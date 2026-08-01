# Hostinger deployment

## Build for Hostinger

```bash
npm run build:hostinger
```

Uses `.env.hostinger` — **no `VITE_API_URL` required**. The app calls `/api/r.php` on the current domain (`msht.io`, `m1.msht.io`, …).

Upload `dist/client/` to `public_html/` and `api/` to `public_html/api/`.

## GitHub Secrets

| Secret | Value |
|---|---|
| `FTP_SERVER` | **IP السيرفر** من hPanel → Advanced → **SSH Access** (مثل `93.xxx.xxx.xxx`) — **لا** تستخدم `msht.io` |
| `FTP_USERNAME` | اسم SSH من نفس الصفحة (مثل `u112851217`) — **ليس** حساب FTP فرعي |
| `FTP_PASSWORD` | كلمة مرور **الحساب الرئيسي** (نفس كلمة FTP للدomain الرئيسي) |
| `FTP_SERVER_DIR` | `/domains/msht.io/public_html/` (يُحوَّل تلقائياً إلى `/home/u112851217/domains/msht.io/public_html/`) |
| `FTP_API_DIR` | `/domains/msht.io/public_html/api/` |
| `VITE_API_URL` | **اختياري** — للتطوير المحلي فقط (`http://localhost:8080`). على Hostinger اتركه فارغاً؛ التطبيق يستخدم `/api` على نفس الدومين تلقائياً (`m1.msht.io/api`, …). |

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

**ملاحظة:** خطوة «Test server connectivity» في GitHub Actions قد تُظهر تحذيراً حتى مع إعداد صحيح — Hostinger يحجب أحياناً فحص المنفذ من سحابة GitHub. النشر يستمر ويُختبر عند خطوة SFTP الفعلية.

إذا فشل SFTP Action: يُجرّب workflow **rsync عبر SSH** (3 محاولات) ثم FTPS. راجع خطوة «Preflight SFTP login» في Actions لمعرفة إن كانت كلمة المرور أو SSH معطّلة.

## Subdomains (m1.msht.io, m2.msht.io)

إذا ظهرت **صفحة Hostinger الافتراضية (`default.php`)** أو **`ERR_HTTP2_PROTOCOL_ERROR` على m1 فقط**، فالسبب غالباً أن Hostinger أنشأ **مجلداً منفصلاً** لـ `m1` ولم يُحدَّث أو فيه `default.php`.

### الحل الأفضل (مرة واحدة في hPanel) — الافتراضي

1. **Domains** → **Subdomains** → تعديل `m1`
2. **Document root** = نفس مجلد الدومين الرئيسي:  
   `/home/u112851217/domains/msht.io/public_html/`
3. احذف `default.php` من `/domains/m1.msht.io/public_html/` إن وُجد

**لا حاجة لمتغيّر GitHub** — النشر الافتراضي يرفع إلى `msht.io/public_html` فقط، و m1/m2 يقرآن من نفس المجلد.

### أو: مجلدات subdomain منفصلة (متقدّم)

إذا أردت مجلداً مستقلاً لكل subdomain:

1. في GitHub: **Settings** → **Variables** → `HOSTINGER_SEPARATE_SUBDOMAIN_DIRS` = `true`
2. تأكد أن المسارات موجودة على السيرفر:
   - `/domains/m1.msht.io/public_html/`
   - `/domains/m2.msht.io/public_html/`
3. انسخ `api/config.php` إلى m1/m2 إن لزم

### تحقق سريع بعد النشر

| الرابط | المتوقع |
|--------|---------|
| `https://msht.io/deploy-sha.txt` | آخر commit |
| `https://YOUR-SUBDOMAIN.msht.io/deploy-sha.txt` | **نفس** commit (إن docroot موحّد) |

**GitHub Actions** يتحقق من `msht.io` فقط. لتحقق subdomain مجمعك، أضف في **Settings → Variables**:

`HOSTINGER_VERIFY_SUBDOMAINS` = `your-subdomain.msht.io` (مثال: `shtawi.msht.io`)

**m1.msht.io** لم يعد مطلوباً إن حذفته — اضبط docroot subdomain الجديد = `public_html` الرئيسي.

### مزامنة يدوية (SSH)

```bash
npm run build:hostinger
bash scripts/sync-hostinger-subdomains.sh u112851217@SERVER_IP
FTP_PASSWORD=... bash scripts/post-deploy-hostinger-subdomains.sh u112851217 SERVER_IP
```

راجع `dist/HOSTINGER-SUBDOMAINS.txt` بعد كل build.

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
