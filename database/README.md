# إعداد قاعدة MySQL على Hostinger



**قاعدة المشروع:** `u112851217_msht_io`



## إعداد أول مرة (قاعدة فارغة)



1. hPanel → **Databases → MySQL Databases** — تأكد أن القاعدة `u112851217_msht_io` موجودة

2. phpMyAdmin → اختر **`u112851217_msht_io`** → **SQL** → نفّذ [`schema.sql`](./schema.sql)

3. على السيرفر: انسخ [`../api/config.example.php`](../api/config.example.php) → `api/config.php` وعبّئ:

   - `DB_NAME` = `u112851217_msht_io`

   - `DB_USER` و `DB_PASS` من hPanel

   - `TOKEN_SECRET` — سلسلة عشوائية طويلة



## ترقية قاعدة موجودة (إضافة التقويم الأكاديمي فقط)



إذا كانت الجداول الأساسية (`halaqat`, `students`, …) موجودة مسبقاً:



1. phpMyAdmin → **`u112851217_msht_io`** → **SQL**

2. نفّذ [`migrate-semesters.sql`](./migrate-semesters.sql)



## تحقق



بعد رفع الملفات على Hostinger، افتح أيّاً من الروابط التالية:

- `https://msht.io/api/health` (عبر index.php — موصى به)
- `https://msht.io/api/r.php?path=/health`
- `https://msht.io/api/health.php` (ملف مباشر)

يجب أن ترى `"ok": true` و `"db_connect": "ok"`. إذا ظهر `"db_connect": "failed"` فالمشكلة في **`api/config.php`** (الملف لا يُرفع تلقائياً مع GitHub — عدّله يدوياً على السيرفر):



- `DB_NAME` = `u112851217_msht_io`

- `DB_USER` = اسم مستخدم MySQL من hPanel (مثل `u112851217_xxxxx` — **ليس** اسم القاعدة)

- `DB_PASS` = كلمة مرور MySQL الصحيحة



بعد التنفيذ يجب أن ترى جدولين جديدين:



- `semesters`

- `academic_weeks`



> **تنبيه:** لا تستخدم قاعدة WordPress (`u112851217_4ve9r`) — استخدم `u112851217_msht_io` فقط.


