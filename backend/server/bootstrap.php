<?php
declare(strict_types=1);

const SERVER_DIR = __DIR__;
const CONFIG_FILE = __DIR__ . '/config.php';
const SCHEMA_VERSION = 1;

require_once __DIR__ . '/http.php';
require_once __DIR__ . '/schema.php';
require_once __DIR__ . '/levels.php';

function app_config(): ?array
{
    static $config = false;
    if ($config === false) {
        $config = is_file(CONFIG_FILE) ? require CONFIG_FILE : null;
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
