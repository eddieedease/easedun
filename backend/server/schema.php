<?php
declare(strict_types=1);

/** @return string[] SQL statements that create the schema with the given table prefix. */
function schema_statements(string $p): array
{
    return [
        "CREATE TABLE IF NOT EXISTS {$p}settings (
            name VARCHAR(64) NOT NULL PRIMARY KEY,
            value TEXT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        "CREATE TABLE IF NOT EXISTS {$p}users (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(16) NOT NULL DEFAULT 'player',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        "CREATE TABLE IF NOT EXISTS {$p}levels (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            description TEXT NOT NULL,
            data LONGTEXT NOT NULL,
            published TINYINT(1) NOT NULL DEFAULT 0,
            created_by INT UNSIGNED NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT {$p}levels_user_fk FOREIGN KEY (created_by) REFERENCES {$p}users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
    ];
}

/** A hand-made story level so a fresh install has something to play. */
function demo_level(): array
{
    return json_decode(file_get_contents(__DIR__ . '/demo-level.json'), true);
}
