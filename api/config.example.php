<?php
// Copy to config.php on Hostinger (do not commit config.php)

define('DB_HOST', 'localhost');
define('DB_NAME', 'u112851217_msht_io');
define('DB_USER', 'u112851217_YOUR_MYSQL_USER'); // من hPanel → MySQL Users
define('DB_PASS', 'YOUR_PASSWORD_HERE');
define('DB_CHARSET', 'utf8mb4');

// HMAC secret for session tokens — change in production
define('TOKEN_SECRET', 'change-this-to-a-long-random-string');

// Platform super-admin password (msht.io/platform-admin) — or set in config.platform.php on server
define('PLATFORM_ADMIN_SECRET', 'change-this-platform-admin-secret');

// Web Push (VAPID) — generate with: npx web-push generate-vapid-keys
// Add the keys to config.php on the server (do not use example keys in production).
define('VAPID_PUBLIC_KEY', '');
define('VAPID_PRIVATE_KEY', '');
define('VAPID_SUBJECT', 'mailto:admin@msht.io');
