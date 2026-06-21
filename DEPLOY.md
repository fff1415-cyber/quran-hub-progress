# Hostinger deployment

## GitHub Secrets

| Secret | Value |
|---|---|
| `FTP_SERVER` | `ftp.yourdomain.com` |
| `FTP_USERNAME` | FTP user |
| `FTP_PASSWORD` | FTP password |
| `VITE_API_URL` | `https://yourdomain.com` |

## Server setup (once)

1. Create MySQL database — see [`database/README.md`](database/README.md)
2. Copy `api/config.example.php` → `api/config.php` on server via FTP/hPanel File Manager
3. Fill DB credentials and `TOKEN_SECRET`

## Local dev

```bash
bun install
cp .env.example .env
# Terminal 1 — PHP API (requires api/config.php)
php -S localhost:8080 -t api api/index.php
# Terminal 2 — frontend
bun run dev
```
