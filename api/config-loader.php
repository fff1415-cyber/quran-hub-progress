<?php

declare(strict_types=1);

function api_load_optional_config(): void
{
    $platformConfig = __DIR__ . '/config.platform.php';
    if (file_exists($platformConfig)) {
        require_once $platformConfig;
    }
}
