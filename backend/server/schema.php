<?php
declare(strict_types=1);

/**
 * The latest schema as CREATE TABLE statements, used by the installer.
 * @return array<string, string> table key => SQL
 */
function schema_tables(string $p): array
{
    return [
        'settings' => "CREATE TABLE IF NOT EXISTS {$p}settings (
            name VARCHAR(64) NOT NULL PRIMARY KEY,
            value TEXT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'users' => "CREATE TABLE IF NOT EXISTS {$p}users (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) NOT NULL UNIQUE,
            email VARCHAR(190) NULL,
            email_verified_at DATETIME NULL,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(16) NOT NULL DEFAULT 'player',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY {$p}users_email (email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        'levels' => "CREATE TABLE IF NOT EXISTS {$p}levels (
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

        // Bestiary of reusable enemies with a pixel-art sprite (PNG data URL).
        'enemies' => "CREATE TABLE IF NOT EXISTS {$p}enemies (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(80) NOT NULL,
            data TEXT NOT NULL,
            image MEDIUMTEXT NOT NULL,
            created_by INT UNSIGNED NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            CONSTRAINT {$p}enemies_user_fk FOREIGN KEY (created_by) REFERENCES {$p}users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        // One-time tokens for email verification and password resets (only the hash is stored).
        'user_tokens' => "CREATE TABLE IF NOT EXISTS {$p}user_tokens (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            user_id INT UNSIGNED NOT NULL,
            type VARCHAR(16) NOT NULL,
            token_hash CHAR(64) NOT NULL UNIQUE,
            expires_at DATETIME NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT {$p}user_tokens_user_fk FOREIGN KEY (user_id) REFERENCES {$p}users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",

        // Recent sensitive actions per IP, for rate limiting.
        'attempts' => "CREATE TABLE IF NOT EXISTS {$p}attempts (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            action VARCHAR(32) NOT NULL,
            ip VARCHAR(45) NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY {$p}attempts_lookup (action, ip, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
    ];
}

/** @return string[] SQL statements that create the latest schema. */
function schema_statements(string $p): array
{
    return array_values(schema_tables($p));
}

/**
 * Upgrade steps for existing installs, keyed by the schema version they lead to.
 * @return array<int, string[]>
 */
function schema_migrations(string $p): array
{
    $tables = schema_tables($p);
    return [
        2 => [$tables['enemies']],
        3 => [
            "ALTER TABLE {$p}users
                ADD COLUMN email VARCHAR(190) NULL AFTER username,
                ADD COLUMN email_verified_at DATETIME NULL AFTER email,
                ADD UNIQUE KEY {$p}users_email (email)",
            $tables['user_tokens'],
            $tables['attempts'],
        ],
    ];
}

/** A hand-made story level so a fresh install has something to play. */
function demo_level(): array
{
    return json_decode(file_get_contents(__DIR__ . '/demo-level.json'), true);
}
