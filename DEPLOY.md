# Hostinger deployment

## GitHub Secrets

| Secret | Value |
|---|---|
| `FTP_SERVER` | **IP السيرفر** من hPanel → SSH أو FTP (لا تستخدم الدomain خلف Cloudflare) |
| `FTP_USERNAME` | اسم مستخدم SSH/FTP (مثل `u112851217`) |
| `FTP_PASSWORD` | كلمة مرور SSH/FTP |
| `FTP_SERVER_DIR` | جذر الموقع، مثل `/domains/msht.io/public_html/` |
| `FTP_API_DIR` | مجلد API، مثل `/domains/msht.io/public_html/api/` |
| `VITE_API_URL` | `https://yourdomain.com` |

النشر يستخدم **SFTP على المنفذ 65002** (Hostinger shared hosting). فعّل SSH من hPanel → Advanced → SSH Access.

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
