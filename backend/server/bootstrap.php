<?php
declare(strict_types=1);

const SERVER_DIR = __DIR__;
const CONFIG_FILE = __DIR__ . '/config.php';
const SCHEMA_VERSION = 3;

require_once __DIR__ . '/http.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/levels.php';
require_once __DIR__ . '/enemies.php';
require_once __DIR__ . '/mail.php';
require_once __DIR__ . '/accounts.php';

function app_config(): ?array
{
    static $config = null;
    // Only a found config is cached: the installer writes config.php mid-request.
    if ($config === null && is_file(CONFIG_FILE)) {
        $config = require CONFIG_FILE;
    }
    return $config;
}

function is_installed(): bool
{
    return app_config() !== null;
}

function connect_db(string $host, string $name, string $user, string $pass, int $port = 3306): PDO
{
    $dsn = "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4";
    return new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $c = app_config();
        if ($c === null) {
            fail(503, 'not_installed', 'The application is not installed yet.');
        }
        $db = $c['db'];
        $pdo = connect_db($db['host'], $db['name'], $db['user'], $db['pass'], (int)($db['port'] ?? 3306));
    }
    return $pdo;
}

/** Prefix a table name with the configured table prefix. */
function t(string $table): string
{
    return (app_config()['db']['prefix'] ?? '') . $table;
}

function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    session_name('dungeon_sid');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    ]);
    session_start();
}

function current_user(): ?array
{
    start_session();
    $id = $_SESSION['user_id'] ?? null;
    if (!$id) {
        return null;
    }
    $stmt = db()->prepare('SELECT id, username, role FROM ' . t('users') . ' WHERE id = ?');
    $stmt->execute([$id]);
    $user = $stmt->fetch();
    if (!$user) {
        return null;
    }
    $user['id'] = (int)$user['id'];
    return $user;
}

function require_user(): array
{
    return current_user() ?? fail(401, 'unauthorized', 'Please log in.');
}

function require_admin(): array
{
    $user = require_user();
    if ($user['role'] !== 'admin') {
        fail(403, 'forbidden', 'Admin only.');
    }
    return $user;
}

/** Runs the upgrade steps an existing install hasn't had yet. */
function ensure_schema(): void
{
    $settings = t('settings');
    $version = (int)(db()->query("SELECT value FROM {$settings} WHERE name = 'schema_version'")->fetchColumn() ?: 1);
    if ($version >= SCHEMA_VERSION) {
        return;
    }
    foreach (schema_migrations(app_config()['db']['prefix'] ?? '') as $target => $statements) {
        if ($target <= $version) {
            continue;
        }
        foreach ($statements as $sql) {
            db()->exec($sql);
        }
        db()->prepare("REPLACE INTO {$settings} (name, value) VALUES ('schema_version', ?)")->execute([(string)$target]);
    }
}

// ---- settings ---------------------------------------------------------------

/** Reads a value from the settings table (cached per request). */
function setting(string $name, string $default = ''): string
{
    static $cache = null;
    if ($name === '') {
        $cache = null; // reset after writes
        return '';
    }
    if ($cache === null) {
        $cache = [];
        foreach (db()->query('SELECT name, value FROM ' . t('settings'))->fetchAll() as $row) {
            $cache[$row['name']] = $row['value'];
        }
    }
    return $cache[$name] ?? $default;
}

/** @param array<string, string> $values */
function set_settings(array $values): void
{
    $stmt = db()->prepare('REPLACE INTO ' . t('settings') . ' (name, value) VALUES (?, ?)');
    foreach ($values as $name => $value) {
        $stmt->execute([$name, (string)$value]);
    }
    setting(''); // drop the cache
}

/**
 * Public base URL of the game, ending in a slash (e.g. https://game.example.com/ or
 * https://example.com/crawlease/). Set by the installer; guessed from the request otherwise.
 */
function site_url(): string
{
    $url = trim(setting('site_url'));
    if ($url !== '') {
        return rtrim($url, '/') . '/';
    }
    $https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    // The API lives at <base>/api/index.php.
    $base = rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/index.php')), '/\\');
    return ($https ? 'https' : 'http') . '://' . $host . $base . '/';
}

// ---- rate limiting ------------------------------------------------------------

function client_ip(): string
{
    return substr((string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'), 0, 45);
}

/** Allows at most $max $action calls per IP within $minutes, then answers 429. */
function rate_limit(string $action, int $max, int $minutes): void
{
    $table = t('attempts');
    db()->exec("DELETE FROM {$table} WHERE created_at < NOW() - INTERVAL 1 DAY");
    $stmt = db()->prepare("SELECT COUNT(*) FROM {$table} WHERE action = ? AND ip = ? AND created_at > NOW() - INTERVAL ? MINUTE");
    $stmt->execute([$action, client_ip(), $minutes]);
    if ((int)$stmt->fetchColumn() >= $max) {
        fail(429, 'too_many_requests', 'Too many attempts. Please wait a few minutes and try again.');
    }
    db()->prepare("INSERT INTO {$table} (action, ip) VALUES (?, ?)")->execute([$action, client_ip()]);
}
