const express = require('express');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');
const PORT = process.env.PORT || 3000;

function loadData(){
  try{ return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch(e){ return {}; }
}
function saveData(data){
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

let data = loadData();
let writeQueue = Promise.resolve();
function persist(){
  writeQueue = writeQueue.then(() => saveData(data)).catch(() => {});
  return writeQueue;
}

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Récupérer une valeur
app.get('/api/kv/:key', (req, res) => {
  const key = req.params.key;
  if (!(key in data)) return res.status(404).json({ error: 'not found' });
  res.json({ key, value: data[key] });
});

// Enregistrer une valeur
app.put('/api/kv/:key', async (req, res) => {
  const key = req.params.key;
  const value = req.body && req.body.value;
  if (typeof value !== 'string') return res.status(400).json({ error: 'value must be a string' });
  data[key] = value;
  await persist();
  res.json({ key, value });
});

// Supprimer une valeur
app.delete('/api/kv/:key', async (req, res) => {
  const key = req.params.key;
  delete data[key];
  await persist();
  res.json({ key, deleted: true });
});

app.listen(PORT, () => console.log('Inventaire D&D — serveur démarré sur le port ' + PORT));
