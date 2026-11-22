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

if (!is_installed()) {
    if ($route === '/status') {
        json_response(['installed' => false, 'user' => null, 'registration' => false]);
    }
    fail(503, 'not_installed', 'The application is not installed yet.');
}

ensure_schema();

if ($route === '/status') {
    json_response([
        'installed' => true,
        'user' => current_user(),
        'registration' => setting('registration_open') === '1',
    ]);
}

$routes = [
    ['POST', '#^/auth/login$#', 'login'],
    ['POST', '#^/auth/logout$#', 'logout'],
    ['GET', '#^/auth/me$#', 'me'],
    ['POST', '#^/auth/register$#', 'register'],
    ['POST', '#^/auth/verify$#', 'verify_email'],
    ['POST', '#^/auth/resend$#', 'resend_verification'],
    ['POST', '#^/auth/forgot$#', 'forgot_password'],
    ['POST', '#^/auth/reset$#', 'reset_password'],
    ['GET', '#^/users$#', 'list_users'],
    ['POST', '#^/users$#', 'create_user'],
    ['PUT', '#^/users/(\\d+)$#', 'update_user'],
    ['DELETE', '#^/users/(\\d+)$#', 'delete_user'],
    ['POST', '#^/users/(\\d+)/resend$#', 'admin_resend_verification'],
    ['GET', '#^/settings$#', 'get_settings'],
    ['PUT', '#^/settings$#', 'update_settings'],
    ['POST', '#^/settings/test-mail$#', 'test_mail'],
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
    rate_limit('login', 10, 15);
    $body = json_body();
    // Players may log in with their username or their email address.
    $login = trim((string)($body['username'] ?? ''));
    $user = str_contains($login, '@') ? find_user_by('email', strtolower($login)) : find_user_by('username', $login);
    if (!$user || !password_verify((string)($body['password'] ?? ''), $user['password_hash'])) {
        fail(401, 'invalid_credentials', 'Wrong username or password.');
    }
    if ($user['email'] !== null && $user['email_verified_at'] === null) {
        fail(403, 'unverified', 'Please confirm your email address first. Check your inbox for the activation link.');
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

// ---- sign-up & email -------------------------------------------------------

function register(): never
{
    if (setting('registration_open') !== '1') {
        fail(403, 'registration_closed', 'Sign-up is closed. Ask an admin for an account.');
    }
    rate_limit('register', 5, 60);
    $body = json_body();
    // Honeypot: real visitors never see or fill this field.
    if (trim((string)($body['website'] ?? '')) !== '') {
        json_response(['ok' => true, 'message' => GENERIC_SIGNUP_REPLY], 202);
    }
    $username = trim((string)($body['username'] ?? ''));
    $email = normalize_email((string)($body['email'] ?? ''));
    $password = (string)($body['password'] ?? '');
    if (!valid_username($username)) {
        fail(422, 'invalid_username', 'Usernames are 3–30 letters, digits, dots, dashes or underscores.');
    }
    if ($email === null) {
        fail(422, 'invalid_email', 'Please enter a valid email address.');
    }
    check_password($password);
    if (find_user_by('username', $username)) {
        fail(409, 'username_taken', 'That username is already taken.');
    }
    $existing = find_user_by('email', $email);
    if ($existing) {
        // Same reply as a fresh sign-up, so nobody can probe which emails are registered.
        send_already_registered_email($existing);
        json_response(['ok' => true, 'message' => GENERIC_SIGNUP_REPLY], 202);
    }
    db()->prepare('INSERT INTO ' . t('users') . " (username, email, password_hash, role) VALUES (?, ?, ?, 'player')")
        ->execute([$username, $email, password_hash($password, PASSWORD_DEFAULT)]);
    $error = send_verification_email(find_user_by('username', $username));
    if ($error) {
        error_log("Verification email failed: {$error}");
    }
    json_response(['ok' => true, 'message' => GENERIC_SIGNUP_REPLY], 202);
}

function verify_email(): never
{
    $id = consume_token((string)(json_body()['token'] ?? ''), 'verify');
    if (!$id) {
        fail(400, 'invalid_token', 'This activation link is invalid or has expired. Log in to request a new one.');
    }
    db()->prepare('UPDATE ' . t('users') . ' SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = ?')->execute([$id]);
    $user = find_user_by('id', (string)$id);
    json_response(['ok' => true, 'username' => $user['username'] ?? '']);
}

function resend_verification(): never
{
    rate_limit('resend', 5, 60);
    $login = trim((string)(json_body()['login'] ?? ''));
    $user = str_contains($login, '@') ? find_user_by('email', strtolower($login)) : find_user_by('username', $login);
    if ($user && $user['email'] !== null && $user['email_verified_at'] === null) {
        send_verification_email($user);
    }
    json_response(['ok' => true, 'message' => 'If that account is waiting for activation, a new link is on its way.']);
}

function forgot_password(): never
{
    rate_limit('forgot', 5, 60);
    $email = normalize_email((string)(json_body()['email'] ?? ''));
    $user = $email ? find_user_by('email', $email) : null;
    if ($user) {
        send_reset_email($user);
    }
    json_response(['ok' => true, 'message' => 'If an account uses that email address, we sent a link to reset the password.']);
}

function reset_password(): never
{
    rate_limit('reset', 10, 60);
    $body = json_body();
    $password = (string)($body['password'] ?? '');
    check_password($password);
    $id = consume_token((string)($body['token'] ?? ''), 'reset');
    if (!$id) {
        fail(400, 'invalid_token', 'This reset link is invalid or has expired. Request a new one.');
    }
    // Opening the link proves the email address works, so this also verifies it.
    db()->prepare('UPDATE ' . t('users') . ' SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = ?')
        ->execute([password_hash($password, PASSWORD_DEFAULT), $id]);
    json_response(['ok' => true]);
}

// ---- users (admin) ---------------------------------------------------------

function list_users(): never
{
    require_admin();
    $rows = db()->query('SELECT * FROM ' . t('users') . ' ORDER BY created_at DESC, id DESC')->fetchAll();
    json_response(array_map('user_to_json', $rows));
}

function create_user(): never
{
    require_admin();
    $body = json_body();
    $username = trim((string)($body['username'] ?? ''));
    $emailRaw = trim((string)($body['email'] ?? ''));
    $email = $emailRaw === '' ? null : normalize_email($emailRaw);
    $role = ($body['role'] ?? 'player') === 'admin' ? 'admin' : 'player';
    if (!valid_username($username)) {
        fail(422, 'invalid_username', 'Usernames are 3–30 letters, digits, dots, dashes or underscores.');
    }
    if ($emailRaw !== '' && $email === null) {
        fail(422, 'invalid_email', 'Please enter a valid email address.');
    }
    check_password((string)($body['password'] ?? ''));
    if (find_user_by('username', $username)) {
        fail(409, 'username_taken', 'That username is already taken.');
    }
    if ($email && find_user_by('email', $email)) {
        fail(409, 'email_taken', 'That email address is already used by another account.');
    }
    // Accounts made by an admin are trusted: no activation needed.
    db()->prepare('INSERT INTO ' . t('users') . ' (username, email, email_verified_at, password_hash, role) VALUES (?, ?, IF(? IS NULL, NULL, NOW()), ?, ?)')
        ->execute([$username, $email, $email, password_hash((string)$body['password'], PASSWORD_DEFAULT), $role]);
    json_response(user_to_json(find_user_by('username', $username)), 201);
}

function update_user(int $id): never
{
    $me = require_admin();
    $user = find_user_by('id', (string)$id) ?? fail(404, 'not_found', 'User not found.');
    $body = json_body();
    $sets = [];
    $args = [];
    if (array_key_exists('role', $body)) {
        $role = $body['role'] === 'admin' ? 'admin' : 'player';
        if ($user['role'] === 'admin' && $role !== 'admin' && admin_count() <= 1) {
            fail(409, 'last_admin', 'This is the last admin. Make someone else admin first.');
        }
        $sets[] = 'role = ?';
        $args[] = $role;
    }
    if (array_key_exists('email', $body)) {
        $raw = trim((string)$body['email']);
        $email = $raw === '' ? null : normalize_email($raw);
        if ($raw !== '' && $email === null) {
            fail(422, 'invalid_email', 'Please enter a valid email address.');
        }
        $other = $email ? find_user_by('email', $email) : null;
        if ($other && (int)$other['id'] !== $id) {
            fail(409, 'email_taken', 'That email address is already used by another account.');
        }
        $sets[] = 'email = ?';
        $args[] = $email;
    }
    if (!empty($body['password'])) {
        check_password((string)$body['password']);
        $sets[] = 'password_hash = ?';
        $args[] = password_hash((string)$body['password'], PASSWORD_DEFAULT);
    }
    if (array_key_exists('verified', $body)) {
        $sets[] = $body['verified'] ? 'email_verified_at = COALESCE(email_verified_at, NOW())' : 'email_verified_at = NULL';
    }
    if ($sets) {
        $args[] = $id;
        db()->prepare('UPDATE ' . t('users') . ' SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($args);
    }
    json_response(user_to_json(find_user_by('id', (string)$id)));
}

function delete_user(int $id): never
{
    $me = require_admin();
    $user = find_user_by('id', (string)$id) ?? fail(404, 'not_found', 'User not found.');
    if ($id === $me['id']) {
        fail(409, 'self', "You can't delete your own account here.");
    }
    if ($user['role'] === 'admin' && admin_count() <= 1) {
        fail(409, 'last_admin', 'This is the last admin.');
    }
    db()->prepare('DELETE FROM ' . t('users') . ' WHERE id = ?')->execute([$id]);
    json_response(['ok' => true]);
}

function admin_resend_verification(int $id): never
{
    require_admin();
    $user = find_user_by('id', (string)$id) ?? fail(404, 'not_found', 'User not found.');
    if ($user['email'] === null) {
        fail(422, 'no_email', 'This account has no email address.');
    }
    $error = send_verification_email($user);
    if ($error) {
        fail(502, 'mail_failed', "Couldn't send the email: {$error}");
    }
    json_response(['ok' => true]);
}

// ---- settings (admin) ------------------------------------------------------

function settings_to_json(): array
{
    $m = mail_settings();
    return [
        'registrationOpen' => setting('registration_open') === '1',
        'siteUrl' => setting('site_url'),
        'detectedSiteUrl' => site_url(),
        'mail' => [
            'method' => $m['method'],
            'from' => $m['from'],
            'fromName' => $m['from_name'],
            'smtpHost' => $m['smtp_host'],
            'smtpPort' => $m['smtp_port'],
            'smtpSecure' => $m['smtp_secure'],
            'smtpUser' => $m['smtp_user'],
            // The password is never sent back to the browser.
            'smtpPassSet' => $m['smtp_pass'] !== '',
        ],
    ];
}

function get_settings(): never
{
    require_admin();
    json_response(settings_to_json());
}

function update_settings(): never
{
    require_admin();
    $b = json_body();
    $mail = is_array($b['mail'] ?? null) ? $b['mail'] : [];
    $siteUrl = trim((string)($b['siteUrl'] ?? ''));
    if ($siteUrl !== '' && !preg_match('#^https?://[^\s/$.?\#].[^\s]*$#i', $siteUrl)) {
        fail(422, 'invalid_url', 'The site address must start with http:// or https://');
    }
    $from = trim((string)($mail['from'] ?? ''));
    if ($from !== '' && !filter_var($from, FILTER_VALIDATE_EMAIL)) {
        fail(422, 'invalid_email', 'The sender address is not a valid email address.');
    }
    $values = [
        'registration_open' => !empty($b['registrationOpen']) ? '1' : '0',
        'site_url' => $siteUrl === '' ? '' : rtrim($siteUrl, '/') . '/',
        'mail_method' => ($mail['method'] ?? 'mail') === 'smtp' ? 'smtp' : 'mail',
        'mail_from' => $from,
        'mail_from_name' => mb_substr(trim((string)($mail['fromName'] ?? 'Crawlease')), 0, 80),
        'smtp_host' => trim((string)($mail['smtpHost'] ?? '')),
        'smtp_port' => (string)max(1, min(65535, (int)($mail['smtpPort'] ?? 587))),
        'smtp_secure' => in_array($mail['smtpSecure'] ?? 'tls', ['none', 'tls', 'ssl'], true) ? $mail['smtpSecure'] : 'tls',
        'smtp_user' => trim((string)($mail['smtpUser'] ?? '')),
    ];
    if (isset($mail['smtpPass']) && $mail['smtpPass'] !== '') {
        $values['smtp_pass'] = (string)$mail['smtpPass'];
    } elseif (!empty($mail['clearSmtpPass'])) {
        $values['smtp_pass'] = '';
    }
    set_settings($values);
    json_response(settings_to_json());
}

function test_mail(): never
{
    $me = require_admin();
    rate_limit('test_mail', 10, 10);
    $to = normalize_email((string)(json_body()['to'] ?? ''));
    if (!$to) {
        fail(422, 'invalid_email', 'Enter an address to send the test email to.');
    }
    $error = send_mail($to, 'Crawlease test email', "It works! Emails from Crawlease reach this inbox.\n\nSent by {$me['username']}.",
        mail_layout('It works!', '<p>Emails from Crawlease reach this inbox.</p>'));
    if ($error) {
        fail(502, 'mail_failed', $error);
    }
    json_response(['ok' => true]);
}
