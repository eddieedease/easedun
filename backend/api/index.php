<?php
/**
 * JSON API front controller.
 * Routes are passed as ?r=/path so it works on any host without URL rewriting.
 */
declare(strict_types=1);

require_once __DIR__ . '/../server/bootstrap.php';

set_exception_handler(function (Throwable $e) {
    error_log((string)$e);
    fail(500, 'server_error', 'Something went wrong on the server.');
});

$method = $_SERVER['REQUEST_METHOD'];
$route = '/' . trim((string)($_GET['r'] ?? ''), '/');

// Simple CSRF guard: browsers can't send this header cross-site without CORS approval.
if ($method !== 'GET' && ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'dungeon') {
    fail(400, 'bad_request', 'Missing request header.');
}

if ($route === '/status') {
    json_response([
        'installed' => is_installed(),
        'user' => is_installed() ? current_user() : null,
    ]);
}

if (!is_installed()) {
    fail(503, 'not_installed', 'The application is not installed yet.');
}

ensure_schema();

$routes = [
    ['POST', '#^/auth/login$#', 'login'],
    ['POST', '#^/auth/logout$#', 'logout'],
    ['GET', '#^/auth/me$#', 'me'],
    ['GET', '#^/levels$#', 'list_levels'],
    ['GET', '#^/levels/(\d+)$#', 'get_level'],
    ['POST', '#^/levels$#', 'create_level'],
    ['PUT', '#^/levels/(\d+)$#', 'update_level'],
    ['DELETE', '#^/levels/(\d+)$#', 'delete_level'],
    ['GET', '#^/enemies$#', 'list_enemies'],
    ['POST', '#^/enemies$#', 'create_enemy'],
    ['PUT', '#^/enemies/(\d+)$#', 'update_enemy'],
    ['DELETE', '#^/enemies/(\d+)$#', 'delete_enemy'],
];

foreach ($routes as [$m, $pattern, $handler]) {
    if ($m === $method && preg_match($pattern, $route, $match)) {
        $handler(...array_map('intval', array_slice($match, 1)));
    }
}
fail(404, 'not_found', "No route for {$method} {$route}");

// ---- handlers -------------------------------------------------------------

function login(): never
{
    $body = json_body();
    $stmt = db()->prepare('SELECT id, username, role, password_hash FROM ' . t('users') . ' WHERE username = ?');
    $stmt->execute([(string)($body['username'] ?? '')]);
    $user = $stmt->fetch();
    if (!$user || !password_verify((string)($body['password'] ?? ''), $user['password_hash'])) {
        fail(401, 'invalid_credentials', 'Wrong username or password.');
    }
    start_session();
    session_regenerate_id(true);
    $_SESSION['user_id'] = (int)$user['id'];
    json_response(['id' => (int)$user['id'], 'username' => $user['username'], 'role' => $user['role']]);
}

function logout(): never
{
    start_session();
    $_SESSION = [];
    session_destroy();
    json_response(['ok' => true]);
}

function me(): never
{
    json_response(require_user());
}

function list_levels(): never
{
    $user = require_user();
    // Admins can ask for the player's view with ?asPlayer=1.
    $all = $user['role'] === 'admin' && empty($_GET['asPlayer']);
    $sql = 'SELECT id, name, description, published, updated_at FROM ' . t('levels')
        . ($all ? '' : ' WHERE published = 1') . ' ORDER BY id';
    $rows = db()->query($sql)->fetchAll();
    json_response(array_map(fn($r) => level_row_to_json($r, false), $rows));
}

function find_level(int $id): array
{
    $stmt = db()->prepare('SELECT * FROM ' . t('levels') . ' WHERE id = ?');
    $stmt->execute([$id]);
    return $stmt->fetch() ?: fail(404, 'not_found', 'Level not found.');
}

function get_level(int $id): never
{
    $user = require_user();
    $row = find_level($id);
    if (!$row['published'] && $user['role'] !== 'admin') {
        fail(404, 'not_found', 'Level not found.');
    }
    $level = level_row_to_json($row, true);
    $level['enemies'] = enemies_for_level($level['data'] ?? []);
    json_response($level);
}

function level_fields(array $body): array
{
    $name = trim((string)($body['name'] ?? ''));
    if ($name === '' || mb_strlen($name) > 100) {
        fail(422, 'invalid_level', 'Name is required (max 100 characters).');
    }
    return [
        $name,
        (string)($body['description'] ?? ''),
        json_encode(validate_level_data($body['data'] ?? null)),
        !empty($body['published']) ? 1 : 0,
    ];
}

function create_level(): never
{
    $user = require_admin();
    $fields = level_fields(json_body());
    $stmt = db()->prepare('INSERT INTO ' . t('levels') . ' (name, description, data, published, created_by) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute([...$fields, $user['id']]);
    json_response(level_row_to_json(find_level((int)db()->lastInsertId()), true), 201);
}

function update_level(int $id): never
{
    require_admin();
    find_level($id);
    $fields = level_fields(json_body());
    $stmt = db()->prepare('UPDATE ' . t('levels') . ' SET name = ?, description = ?, data = ?, published = ? WHERE id = ?');
    $stmt->execute([...$fields, $id]);
    json_response(level_row_to_json(find_level($id), true));
}

function delete_level(int $id): never
{
    require_admin();
    find_level($id);
    db()->prepare('DELETE FROM ' . t('levels') . ' WHERE id = ?')->execute([$id]);
    json_response(['ok' => true]);
}

// ---- bestiary -------------------------------------------------------------

function list_enemies(): never
{
    require_admin();
    $rows = db()->query('SELECT * FROM ' . t('enemies') . ' ORDER BY name')->fetchAll();
    json_response(array_map('enemy_row_to_json', $rows));
}

function find_enemy(int $id): array
{
    $stmt = db()->prepare('SELECT * FROM ' . t('enemies') . ' WHERE id = ?');
    $stmt->execute([$id]);
    return $stmt->fetch() ?: fail(404, 'not_found', 'Enemy not found.');
}

function create_enemy(): never
{
    $user = require_admin();
    $fields = validate_enemy(json_body());
    db()->prepare('INSERT INTO ' . t('enemies') . ' (name, data, image, created_by) VALUES (?, ?, ?, ?)')->execute([...$fields, $user['id']]);
    json_response(enemy_row_to_json(find_enemy((int)db()->lastInsertId())), 201);
}

function update_enemy(int $id): never
{
    require_admin();
    find_enemy($id);
    $fields = validate_enemy(json_body());
    db()->prepare('UPDATE ' . t('enemies') . ' SET name = ?, data = ?, image = ? WHERE id = ?')->execute([...$fields, $id]);
    json_response(enemy_row_to_json(find_enemy($id)));
}

function delete_enemy(int $id): never
{
    require_admin();
    find_enemy($id);
    db()->prepare('DELETE FROM ' . t('enemies') . ' WHERE id = ?')->execute([$id]);
    json_response(['ok' => true]);
}
