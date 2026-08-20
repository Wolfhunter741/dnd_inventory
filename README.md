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

Reverse proxy nginx (`/etc/nginx/sites-available/inventaire-dnd`) :

```nginx
server {
    listen 80;
    server_name inventaire.mondomaine.fr;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/inventaire-dnd /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# certificat HTTPS gratuit
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d inventaire.mondomaine.fr
```

## 4. Sécurité et bon sens

- N'importe qui connaissant l'URL peut lire/modifier tous les inventaires
  (pas de compte ni de mot de passe). Pour une table privée, c'est
  généralement suffisant, mais vous pouvez restreindre l'accès avec une
  authentification HTTP basique dans nginx si besoin (`auth_basic`).
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
