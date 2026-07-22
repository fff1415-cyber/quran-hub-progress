# Hostinger deployment

## GitHub Secrets

| Secret | Value |
|---|---|
| `FTP_SERVER` | **IP السيرفر** من hPanel → Advanced → **SSH Access** (مثل `93.xxx.xxx.xxx`) — **لا** تستخدم `msht.io` |
| `FTP_USERNAME` | اسم SSH من نفس الصفحة (مثل `u112851217`) — **ليس** حساب FTP فرعي |
| `FTP_PASSWORD` | كلمة مرور **الحساب الرئيسي** (نفس كلمة FTP للدomain الرئيسي) |
| `FTP_SERVER_DIR` | `/domains/msht.io/public_html/` (يُحوَّل تلقائياً إلى `/home/u112851217/domains/msht.io/public_html/`) |
| `FTP_API_DIR` | `/domains/msht.io/public_html/api/` |
| `VITE_API_URL` | `https://msht.io` |

فعّل **SSH Access** من hPanel → Advanced → SSH Access.

**تحقق محلياً (FileZilla):** Host = IP، Port = `65002`، Protocol = SFTP، User = `u112851217`.

## استكشاف أخطاء GitHub Actions

إذا ظهر: `Frontend deploy failed (FTPS and SFTP)`:

1. **FTP_SERVER** — يجب أن يكون **IP السيرفر** (أرقام فقط)، **ليس** `msht.io`  
   → hPanel → **Advanced** → **SSH Access** → انسخ **Server IP**
2. **FTP_PASSWORD** — كلمة مرور **الحساب الرئيسي** في Hostinger (نفس كلمة FTP)
3. **SSH Access** — يجب أن يكون **مفعّلاً** من hPanel
4. **FTP_USERNAME** — اسم المستخدم من SSH Access (مثل `u112851217`)، وليس حساب FTP فرعي
5. بعد تصحيح الأسرار: GitHub → **Actions** → **Deploy to Hostinger** → **Run workflow**

**اختبار سريع:** FileZilla → SFTP → Host = IP، Port = 65002. إذا فشل محلياً، الأسرار خاطئة قبل GitHub.

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
