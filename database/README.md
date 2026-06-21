# إعداد قاعدة MySQL على Hostinger

1. hPanel → **Databases → MySQL Databases**
2. أنشئ قاعدة جديدة (مثلاً `u112851217_quran`) — **لا تستخدم** قاعدة WordPress `u112851217_4ve9r`
3. أنشئ مستخدم MySQL واربطه بالقاعدة (All Privileges)
4. phpMyAdmin → اختر القاعدة الجديدة → **SQL** → نفّذ [`schema.sql`](./schema.sql)
5. انسخ [`../api/config.example.php`](../api/config.example.php) إلى `api/config.php` على السيرفر وعبّئ بيانات الاتصال
