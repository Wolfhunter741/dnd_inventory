const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');
const PORT = process.env.PORT || 3000;

// Garde-fous anti-abus / anti-DoS (ajustables via variables d'env si besoin)
const MAX_KEY_LENGTH = 200;
const MAX_VALUE_LENGTH = 200 * 1024;      // 200 Ko par valeur (au lieu des 2 Mo du body entier)
const MAX_KEYS = 2000;                    // nombre max de clés distinctes stockées
const KEY_PATTERN = /^[a-zA-Z0-9_\-:.]+$/; // pas de "/", "__proto__", espaces, etc.
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function loadData() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    // Objet sans prototype : même si une clé dangereuse passait un jour
    // les filtres ci-dessous, elle ne pourrait pas atteindre Object.prototype.
    return Object.assign(Object.create(null), parsed);
  } catch (e) {
    return Object.create(null);
  }
}
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let data = loadData();
let writeQueue = Promise.resolve();
function persist() {
  writeQueue = writeQueue.then(() => saveData(data)).catch(() => {});
  return writeQueue;
}

function isValidKey(key) {
  return (
    typeof key === 'string' &&
    key.length > 0 &&
    key.length <= MAX_KEY_LENGTH &&
    KEY_PATTERN.test(key) &&
    !FORBIDDEN_KEYS.has(key)
  );
}

const app = express();
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
}));

// Limite le débit de requêtes sur l'API (protège contre le spam / la
// saturation disque par écritures répétées).
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Récupérer une valeur
app.get('/api/kv/:key', (req, res) => {
  const key = req.params.key;
  if (!isValidKey(key)) return res.status(400).json({ error: 'invalid key' });
  if (!(key in data)) return res.status(404).json({ error: 'not found' });
  res.json({ key, value: data[key] });
});

// Enregistrer une valeur
app.put('/api/kv/:key', async (req, res) => {
  const key = req.params.key;
  if (!isValidKey(key)) return res.status(400).json({ error: 'invalid key' });

  const value = req.body && req.body.value;
  if (typeof value !== 'string') {
    return res.status(400).json({ error: 'value must be a string' });
  }
  if (value.length > MAX_VALUE_LENGTH) {
    return res.status(413).json({ error: 'value too large' });
  }
  if (!(key in data) && Object.keys(data).length >= MAX_KEYS) {
    return res.status(507).json({ error: 'storage limit reached' });
  }

  data[key] = value;
  await persist();
  res.json({ key, value });
});

// Supprimer une valeur
app.delete('/api/kv/:key', async (req, res) => {
  const key = req.params.key;
  if (!isValidKey(key)) return res.status(400).json({ error: 'invalid key' });
  delete data[key];
  await persist();
  res.json({ key, deleted: true });
});

app.listen(PORT, () => console.log('Inventaire D&D — serveur démarré sur le port ' + PORT));
