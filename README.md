# Inventaire D&D — serveur auto-hébergé

Petit backend Node.js qui sert la page de l'inventaire et sauvegarde les
données (personnages + objets) dans un fichier `data.json` sur le disque,
via une API clé-valeur toute simple. Tous les joueurs qui ouvrent l'URL
du serveur voient et modifient le même inventaire.

## 1. Installer sur le serveur

Prérequis : Node.js 18+ (`node -v` pour vérifier).

```bash
# copier le dossier sur le serveur, puis :
cd inventaire-dnd-server
npm install
npm start          # démarre sur http://localhost:3000
```

Testez d'abord en local (`ssh -L 3000:localhost:3000 user@serveur` depuis
votre machine, puis ouvrez http://localhost:3000 dans votre navigateur)
avant de l'exposer publiquement.

## 2. Le garder actif en permanence (systemd)

Créez `/etc/systemd/system/inventaire-dnd.service` :

```ini
[Unit]
Description=Inventaire D&D
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/inventaire-dnd-server
ExecStart=/usr/bin/node server.js
Environment=PORT=3000
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Puis :

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now inventaire-dnd
sudo systemctl status inventaire-dnd
```

## 3. Exposer via nginx + HTTPS

L'application n'a **aucun compte ni mot de passe** : quiconque connaît
l'URL peut lire/modifier/supprimer tout le contenu. Dès que le serveur
quitte votre machine locale, une authentification est donc **obligatoire**,
pas optionnelle.

Utilisez la config fournie dans [`deploy/nginx-inventaire-dnd.conf`](deploy/nginx-inventaire-dnd.conf),
qui active `auth_basic` par défaut :

```bash
# 1. créer le fichier de mots de passe (un compte par joueur/table)
sudo apt install apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd-inventaire-dnd ma_table

# 2. copier la config
sudo cp deploy/nginx-inventaire-dnd.conf /etc/nginx/sites-available/inventaire-dnd
sudo ln -s /etc/nginx/sites-available/inventaire-dnd /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 3. certificat HTTPS gratuit (ajoute aussi la redirection HTTP -> HTTPS)
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d inventaire.mondomaine.fr
```

## 4. Sécurité et bon sens

- **Authentification obligatoire** dès que le serveur est accessible depuis
  Internet : voir l'étape 3 ci-dessus (`auth_basic`). Sans ça, n'importe qui
  trouvant l'URL a un accès complet en lecture/écriture/suppression sur
  toutes les données, y compris celles des autres joueurs.
- Le serveur applique déjà côté Node (`server.js`) : des en-têtes de
  sécurité (CSP, `X-Frame-Options`, etc. via `helmet`), une limite de débit
  sur l'API (`express-rate-limit`), et une validation stricte des clés et
  tailles de valeurs stockées. Le front-end échappe systématiquement les
  données utilisateur (noms de personnages/objets, icônes) avant de les
  insérer dans la page, pour éviter les injections HTML/JS.
- Pare-feu : n'ouvrez que les ports 80/443 (`ufw allow 80,443/tcp`),
  gardez le port 3000 fermé au monde extérieur (nginx s'en charge en local).
- Sauvegardez régulièrement `data.json` (c'est tout l'état de l'appli).

## Structure

- `server.js` — serveur Express (sert `public/` + API `/api/kv/:key`)
- `public/index.html` — l'application (identique à la version Claude,
  elle détecte automatiquement l'absence de `window.storage` et utilise
  cette API à la place)
- `data.json` — créé automatiquement au premier lancement, contient
  toutes les données
- `deploy/nginx-inventaire-dnd.conf` — config nginx prête à l'emploi avec
  authentification `auth_basic` obligatoire
