<?php
declare(strict_types=1);

const VERIFY_TOKEN_MINUTES = 60 * 48;
const RESET_TOKEN_MINUTES = 60;
const GENERIC_SIGNUP_REPLY = 'Almost there! We sent an activation link to your email address. Open it to activate your account.';

function valid_username(string $name): bool
{
    return (bool)preg_match('/^[A-Za-z0-9_.-]{3,30}$/', $name);
}

/** Lower-cased email, or null when it isn't a plausible address. */
function normalize_email(string $email): ?string
{
    $email = strtolower(trim($email));
    return $email !== '' && strlen($email) <= 190 && filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : null;
}

function check_password(string $password): void
{
    if (strlen($password) < 8 || strlen($password) > 200) {
        fail(422, 'weak_password', 'Passwords need at least 8 characters.');
    }
}

function find_user_by(string $column, string $value): ?array
{
    $allowed = ['id', 'username', 'email'];
    if (!in_array($column, $allowed, true)) {
        return null;
    }
    $stmt = db()->prepare('SELECT * FROM ' . t('users') . " WHERE {$column} = ?");
    $stmt->execute([$value]);
    return $stmt->fetch() ?: null;
}

function user_to_json(array $u): array
{
    return [
        'id' => (int)$u['id'],
        'username' => $u['username'],
        'email' => $u['email'],
        'role' => $u['role'],
        'verified' => $u['email'] === null || $u['email_verified_at'] !== null,
        'createdAt' => $u['created_at'],
    ];
}

/** Creates a one-time token (replacing older ones of the same type) and returns its raw value. */
function create_token(int $userId, string $type, int $minutes): string
{
    $token = bin2hex(random_bytes(32));
    $table = t('user_tokens');
    db()->prepare("DELETE FROM {$table} WHERE user_id = ? AND type = ?")->execute([$userId, $type]);
    db()->prepare("INSERT INTO {$table} (user_id, type, token_hash, expires_at) VALUES (?, ?, ?, NOW() + INTERVAL ? MINUTE)")
        ->execute([$userId, $type, hash('sha256', $token), $minutes]);
    return $token;
}

/** Uses up a token. Returns the user id, or null when it is unknown or expired. */
function consume_token(string $token, string $type): ?int
{
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
        return null;
    }
    $table = t('user_tokens');
    $stmt = db()->prepare("SELECT id, user_id, expires_at > NOW() AS valid FROM {$table} WHERE token_hash = ? AND type = ?");
    $stmt->execute([hash('sha256', $token), $type]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    db()->prepare("DELETE FROM {$table} WHERE id = ?")->execute([$row['id']]);
    return $row['valid'] ? (int)$row['user_id'] : null;
}

function send_verification_email(array $user): ?string
{
    $link = site_url() . 'verify?token=' . create_token((int)$user['id'], 'verify', VERIFY_TOKEN_MINUTES);
    $name = $user['username'];
    $text = "Hi {$name},\n\nConfirm your email address to activate your Crawlease account:\n{$link}\n\nThe link is valid for 48 hours. If you didn't sign up, you can ignore this email.";
    $html = mail_layout('Confirm your email', '<p>Hi ' . htmlspecialchars($name) . ',</p><p>Confirm your email address to activate your account. The link is valid for 48 hours.</p>', 'Activate my account', $link)
        . '<p style="max-width:520px;margin:0 auto;padding:0 24px;color:#8b877d;font-size:12px;font-family:Arial,sans-serif">If you didn\'t sign up, you can ignore this email.</p>';
    return send_mail($user['email'], 'Confirm your Crawlease account', $text, $html);
}

function send_reset_email(array $user): ?string
{
    $link = site_url() . 'reset?token=' . create_token((int)$user['id'], 'reset', RESET_TOKEN_MINUTES);
    $name = $user['username'];
    $text = "Hi {$name},\n\nSomeone (hopefully you) asked to reset your Crawlease password:\n{$link}\n\nThe link is valid for 1 hour. If it wasn't you, ignore this email; your password stays the same.";
    $html = mail_layout('Reset your password', '<p>Hi ' . htmlspecialchars($name) . ',</p><p>Someone (hopefully you) asked to reset your password. The link is valid for 1 hour. If it wasn\'t you, ignore this email.</p>', 'Choose a new password', $link);
    return send_mail($user['email'], 'Reset your Crawlease password', $text, $html);
}

/** Sent instead of a second account, so sign-up never reveals which emails are registered. */
function send_already_registered_email(array $user): ?string
{
    $link = site_url() . 'forgot';
    $text = "Hi,\n\nSomeone tried to create a Crawlease account with this email address, but you already have one (username: {$user['username']}).\nForgot your password? Reset it here: {$link}\n\nIf this wasn't you, you can ignore this email.";
    $html = mail_layout('You already have an account', '<p>Someone tried to sign up with this email address, but you already have an account (username: <strong>' . htmlspecialchars($user['username']) . '</strong>).</p><p>If this wasn\'t you, you can ignore this email.</p>', 'Reset my password', $link);
    return send_mail($user['email'], 'Your Crawlease account', $text, $html);
}

/** Number of admins, to protect the last one. */
function admin_count(): int
{
    return (int)db()->query('SELECT COUNT(*) FROM ' . t('users') . " WHERE role = 'admin'")->fetchColumn();
}
