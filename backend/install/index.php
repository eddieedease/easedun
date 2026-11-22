<?php
/**
 * Web installer: collects database, site address, email and admin details,
 * creates the tables, adapts the app to a subfolder if needed, seeds a demo
 * level and writes server/config.php. Once config.php exists it refuses to run again.
 */
declare(strict_types=1);

require_once __DIR__ . '/../server/bootstrap.php';

$devDefaults = getenv('INSTALLER_DEV_DEFAULTS') === '1';

// Where the game lives, guessed from this page's own URL (…/install/index.php).
$https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
$detectedHost = ($https ? 'https' : 'http') . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
$detectedPath = rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/install/index.php')), '/\\') . '/';

$values = [
    'db_host' => getenv('INSTALLER_DB_HOST') ?: 'localhost',
    'db_port' => '3306',
    'db_name' => getenv('INSTALLER_DB_NAME') ?: '',
    'db_user' => getenv('INSTALLER_DB_USER') ?: '',
    'db_pass' => getenv('INSTALLER_DB_PASS') ?: '',
    'db_prefix' => 'dc_',
    'site_mode' => $detectedPath === '/' ? 'root' : 'subfolder',
    'site_path' => $detectedPath,
    'site_url' => $detectedHost . $detectedPath,
    'admin_user' => 'admin',
    'admin_email' => $devDefaults ? 'admin@crawlease.test' : '',
    'admin_pass' => $devDefaults ? 'admin123' : '',
    'registration' => '0',
    'mail_method' => getenv('INSTALLER_SMTP_HOST') ? 'smtp' : 'mail',
    'mail_from' => $devDefaults ? 'noreply@crawlease.test' : '',
    'smtp_host' => getenv('INSTALLER_SMTP_HOST') ?: '',
    'smtp_port' => getenv('INSTALLER_SMTP_PORT') ?: '587',
    'smtp_secure' => getenv('INSTALLER_SMTP_HOST') ? 'none' : 'tls',
    'smtp_user' => '',
    'smtp_pass' => '',
    'test_mail' => '1',
    'demo' => '1',
    'player_user' => $devDefaults ? 'player' : '',
    'player_pass' => $devDefaults ? 'player123' : '',
];
$checkboxes = ['registration', 'test_mail', 'demo'];
$secrets = ['db_pass', 'admin_pass', 'smtp_pass', 'player_pass'];
$errors = [];
$done = false;
$manualConfig = null;
$notes = [];

if (is_installed()) {
    render_page(function () { ?>
        <h2>Already installed</h2>
        <p>The game is ready. For security, delete the <code>install/</code> folder from your server.</p>
        <p><a class="btn" href="../">Open the game</a></p>
    <?php });
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    foreach ($values as $key => $_) {
        $values[$key] = in_array($key, $checkboxes, true)
            ? (isset($_POST[$key]) ? '1' : '0')
            : (in_array($key, $secrets, true) ? (string)($_POST[$key] ?? '') : trim((string)($_POST[$key] ?? '')));
    }

    // Site address.
    $values['site_mode'] = $values['site_mode'] === 'subfolder' ? 'subfolder' : 'root';
    $path = $values['site_mode'] === 'root' ? '/' : '/' . trim($values['site_path'], '/') . '/';
    if ($values['site_mode'] === 'subfolder' && !preg_match('#^/[A-Za-z0-9._~/-]+/$#', $path)) {
        $errors[] = 'The subfolder may only contain letters, digits, dots, dashes, underscores and slashes.';
    }
    $values['site_path'] = $path;
    $siteUrl = rtrim($values['site_url'], '/') . '/';
    if (!preg_match('#^https?://[^/\s]+(/.*)?$#i', $siteUrl)) {
        $errors[] = 'The site address must start with http:// or https://';
    } elseif (parse_url($siteUrl, PHP_URL_PATH) !== $path) {
        $errors[] = "The site address should end in the game's folder ({$path}).";
    }

    if ($values['db_name'] === '' || $values['db_user'] === '') {
        $errors[] = 'Database name and user are required.';
    }
    if (!preg_match('/^[A-Za-z0-9_]{0,20}$/', $values['db_prefix'])) {
        $errors[] = 'Table prefix may only contain letters, digits and underscores.';
    }
    if (!valid_username($values['admin_user'])) {
        $errors[] = 'Admin username: 3–30 letters, digits, dot, dash or underscore.';
    }
    $adminEmail = $values['admin_email'] === '' ? null : normalize_email($values['admin_email']);
    if ($values['admin_email'] !== '' && $adminEmail === null) {
        $errors[] = 'The admin email address is not valid.';
    }
    if (strlen($values['admin_pass']) < 8) {
        $errors[] = 'Admin password must be at least 8 characters.';
    }
    $wantPlayer = $values['player_user'] !== '';
    if ($wantPlayer && (!valid_username($values['player_user']) || strlen($values['player_pass']) < 8)) {
        $errors[] = 'Test player: a valid username and a password of at least 8 characters.';
    }
    if ($values['mail_from'] !== '' && !filter_var($values['mail_from'], FILTER_VALIDATE_EMAIL)) {
        $errors[] = 'The sender email address is not valid.';
    }
    if ($values['mail_method'] === 'smtp' && $values['smtp_host'] === '') {
        $errors[] = 'Enter the SMTP server, or choose PHP mail().';
    }
    if ($values['registration'] === '1' && $adminEmail === null) {
        $errors[] = 'Open sign-up sends activation emails: please add an admin email address so you can test that mail works.';
    }

    if (!$errors) {
        try {
            $pdo = connect_db($values['db_host'], $values['db_name'], $values['db_user'], $values['db_pass'], (int)$values['db_port']);
            $p = $values['db_prefix'];
            foreach (schema_statements($p) as $sql) {
                $pdo->exec($sql);
            }
            $pdo->beginTransaction();
            $setting = $pdo->prepare("REPLACE INTO {$p}settings (name, value) VALUES (?, ?)");
            foreach ([
                'schema_version' => (string)SCHEMA_VERSION,
                'site_url' => $siteUrl,
                'registration_open' => $values['registration'],
                'mail_method' => $values['mail_method'] === 'smtp' ? 'smtp' : 'mail',
                'mail_from' => $values['mail_from'],
                'mail_from_name' => 'Crawlease',
                'smtp_host' => $values['smtp_host'],
                'smtp_port' => (string)(int)$values['smtp_port'],
                'smtp_secure' => in_array($values['smtp_secure'], ['none', 'tls', 'ssl'], true) ? $values['smtp_secure'] : 'tls',
                'smtp_user' => $values['smtp_user'],
                'smtp_pass' => $values['smtp_pass'],
            ] as $name => $value) {
                $setting->execute([$name, $value]);
            }
            $addUser = $pdo->prepare("INSERT INTO {$p}users (username, email, email_verified_at, password_hash, role) VALUES (?, ?, IF(? IS NULL, NULL, NOW()), ?, ?)");
            $addUser->execute([$values['admin_user'], $adminEmail, $adminEmail, password_hash($values['admin_pass'], PASSWORD_DEFAULT), 'admin']);
            $adminId = (int)$pdo->lastInsertId();
            if ($wantPlayer) {
                $addUser->execute([$values['player_user'], null, null, password_hash($values['player_pass'], PASSWORD_DEFAULT), 'player']);
            }
            if ($values['demo'] === '1') {
                $pdo->prepare("INSERT INTO {$p}levels (name, description, data, published, created_by) VALUES (?, ?, ?, 1, ?)")
                    ->execute(['District 9: Neon Debt', 'A short demo story. Recover a stolen data chip and catch the metro out.', json_encode(demo_level()), $adminId]);
            }
            $pdo->commit();

            $config = "<?php\n// Generated by the installer on " . date('c') . "\nreturn " . var_export([
                'db' => [
                    'host' => $values['db_host'],
                    'port' => (int)$values['db_port'],
                    'name' => $values['db_name'],
                    'user' => $values['db_user'],
                    'pass' => $values['db_pass'],
                    'prefix' => $p,
                ],
            ], true) . ";\n";
            if (@file_put_contents(CONFIG_FILE, $config) === false) {
                $manualConfig = $config;
            }
            $notes = array_merge($notes, adapt_to_folder(dirname(__DIR__), $path));
            $done = true;

            if ($values['test_mail'] === '1' && $adminEmail !== null && $manualConfig === null) {
                $error = send_mail($adminEmail, 'Crawlease is installed', "Your Crawlease game is live at {$siteUrl}\n\nThis test email shows that the game can send activation and password emails.",
                    mail_layout('Your game is installed', '<p>This test email shows that the game can send activation and password emails.</p>', 'Open the game', $siteUrl));
                $notes[] = $error === null
                    ? "Test email sent to {$adminEmail}. If it doesn't arrive, check the spam folder and the email settings."
                    : "The test email could not be sent ({$error}). Fix the email settings later under Settings in the admin menu.";
            }
        } catch (PDOException $e) {
            if (isset($pdo) && $pdo->inTransaction()) {
                $pdo->rollBack();
            }
            $errors[] = 'Database error: ' . $e->getMessage();
        }
    }
}

/**
 * Points the built app at its folder: the <base href> in index.html and the
 * RewriteBase in .htaccess. Skipped when those files aren't there (development).
 * @return string[] notes for the result page
 */
function adapt_to_folder(string $root, string $path): array
{
    $notes = [];
    $index = $root . '/index.html';
    if (is_file($index)) {
        $html = (string)file_get_contents($index);
        $patched = preg_replace('#<base href="[^"]*">#', '<base href="' . htmlspecialchars($path) . '">', $html, 1);
        if ($patched !== $html && @file_put_contents($index, $patched) === false) {
            $notes[] = "Could not update index.html. Set <base href=\"{$path}\"> in it by hand.";
        }
    }
    $htaccess = $root . '/.htaccess';
    if (is_file($htaccess)) {
        $rules = (string)file_get_contents($htaccess);
        $patched = preg_replace('#^(\s*RewriteBase)\s+\S+#m', '$1 ' . $path, $rules, 1);
        if ($patched !== $rules && @file_put_contents($htaccess, $patched) === false) {
            $notes[] = "Could not update .htaccess. Set \"RewriteBase {$path}\" in it by hand.";
        }
    }
    return $notes;
}

function h(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES);
}

function render_page(callable $body): void
{ ?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Crawlease installer</title>
<style>
  :root { --bg:#0c0d0f; --panel:#16181b; --edge:#3b3f45; --text:#d8d3c7; --muted:#8b877d; --accent:#f2b440; --bad:#d9493a; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; background:var(--bg); color:var(--text); font:16px/1.5 ui-monospace, monospace; display:flex; justify-content:center; padding:24px 16px; }
  main { width:100%; max-width:600px; background:var(--panel); border:1px solid var(--edge); border-top:3px solid var(--accent); padding:24px; box-shadow:0 2px 12px rgba(0,0,0,.4); }
  h1 { margin:0 0 4px; color:var(--accent); letter-spacing:.05em; }
  h2 { color:var(--accent); font-size:1.1rem; border-bottom:1px solid var(--edge); padding-bottom:4px; margin-top:28px; }
  label { display:block; margin:10px 0 2px; color:var(--muted); font-size:.9rem; }
  input[type=text], input[type=password], input[type=number], input[type=email], select { width:100%; padding:8px; background:#101113; color:var(--text); border:1px solid var(--edge); font:inherit; }
  .row { display:grid; grid-template-columns:1fr 110px; gap:12px; }
  .row3 { display:grid; grid-template-columns:1fr 100px 110px; gap:12px; }
  .check, .radio { display:flex; gap:8px; align-items:center; margin-top:10px; color:var(--text); }
  .btn, button { display:inline-block; margin-top:24px; padding:10px 22px; background:var(--accent); color:#17130b; border:0; font:bold 1rem ui-monospace, monospace; cursor:pointer; text-decoration:none; }
  .errors { background:#3a1715; border:1px solid var(--bad); padding:8px 14px; }
  .notes { background:#14201a; border:1px solid #3d5c48; padding:8px 14px; }
  .hint { color:var(--muted); font-size:.85rem; }
  pre { background:#101113; border:1px solid var(--edge); padding:12px; overflow:auto; font-size:.8rem; }
  code { color:var(--accent); }
  .smtp[hidden], #subfolder[hidden] { display:none; }
</style>
</head>
<body><main>
  <h1>CRAWLEASE installer</h1>
  <?php $body(); ?>
</main></body>
</html>
<?php }

render_page(function () use ($values, $errors, $done, $manualConfig, $devDefaults, $notes) {
    if ($done) { ?>
        <h2>Installation complete</h2>
        <?php if ($manualConfig !== null): ?>
            <p>The installer could not write <code>server/config.php</code>. Create that file yourself with this content:</p>
            <pre><?= h($manualConfig) ?></pre>
        <?php endif; ?>
        <?php if ($notes): ?>
            <div class="notes"><?php foreach ($notes as $n): ?><p><?= h($n) ?></p><?php endforeach; ?></div>
        <?php endif; ?>
        <p>The game lives at <code><?= h(rtrim($values['site_url'], '/') . '/') ?></code>. You can now log in as <strong><?= h($values['admin_user']) ?></strong>.</p>
        <p class="hint">Players, sign-up and email settings can be changed later under <em>Users</em> and <em>Settings</em> in the admin menu.
            For security, delete the <code>install/</code> folder from your server.</p>
        <a class="btn" href="../">Open the game</a>
        <?php return;
    } ?>
    <p class="hint">Fill in the details from your hosting panel. The installer creates the tables, your admin account and the settings.
        <?php if ($devDefaults): ?><br><strong>Dev mode:</strong> values are prefilled for the Docker stack; emails go to Mailpit (http://localhost:8025).<?php endif; ?></p>

    <?php if ($errors): ?>
        <div class="errors"><?php foreach ($errors as $e): ?><p><?= h($e) ?></p><?php endforeach; ?></div>
    <?php endif; ?>

    <form method="post" autocomplete="off">
        <h2>Database</h2>
        <div class="row">
            <div><label for="db_host">Host</label><input type="text" id="db_host" name="db_host" value="<?= h($values['db_host']) ?>" required></div>
            <div><label for="db_port">Port</label><input type="number" id="db_port" name="db_port" value="<?= h($values['db_port']) ?>" required></div>
        </div>
        <label for="db_name">Database name</label><input type="text" id="db_name" name="db_name" value="<?= h($values['db_name']) ?>" required>
        <label for="db_user">Username</label><input type="text" id="db_user" name="db_user" value="<?= h($values['db_user']) ?>" required>
        <label for="db_pass">Password</label><input type="password" id="db_pass" name="db_pass" value="<?= h($values['db_pass']) ?>">
        <label for="db_prefix">Table prefix</label><input type="text" id="db_prefix" name="db_prefix" value="<?= h($values['db_prefix']) ?>">
        <p class="hint">A prefix lets the game share one database with other apps.</p>

        <h2>Site address</h2>
        <label class="radio"><input type="radio" name="site_mode" value="root" <?= $values['site_mode'] === 'root' ? 'checked' : '' ?>> Domain or subdomain root, e.g. <code>https://game.example.com/</code></label>
        <label class="radio"><input type="radio" name="site_mode" value="subfolder" <?= $values['site_mode'] === 'subfolder' ? 'checked' : '' ?>> A subfolder, e.g. <code>https://example.com/crawlease/</code></label>
        <div id="subfolder" <?= $values['site_mode'] === 'subfolder' ? '' : 'hidden' ?>>
            <label for="site_path">Subfolder</label><input type="text" id="site_path" name="site_path" value="<?= h($values['site_path']) ?>" placeholder="/crawlease/">
        </div>
        <label for="site_url">Full web address of the game</label><input type="text" id="site_url" name="site_url" value="<?= h($values['site_url']) ?>" required>
        <p class="hint">Detected from this page. Used in activation and password emails. The installer also points the app at the right folder.</p>

        <h2>Admin account</h2>
        <label for="admin_user">Username</label><input type="text" id="admin_user" name="admin_user" value="<?= h($values['admin_user']) ?>" required>
        <label for="admin_email">Email address</label><input type="email" id="admin_email" name="admin_email" value="<?= h($values['admin_email']) ?>" placeholder="you@example.com">
        <label for="admin_pass">Password (min. 8 characters)</label><input type="password" id="admin_pass" name="admin_pass" value="<?= h($values['admin_pass']) ?>" required>

        <h2>Email</h2>
        <p class="hint">Used for account activation and password resets. Most hosts support PHP mail(); SMTP (from your hosting panel or a mail service) is more reliable.</p>
        <label for="mail_method">Send email with</label>
        <select id="mail_method" name="mail_method">
            <option value="mail" <?= $values['mail_method'] === 'mail' ? 'selected' : '' ?>>PHP mail() (no setup)</option>
            <option value="smtp" <?= $values['mail_method'] === 'smtp' ? 'selected' : '' ?>>SMTP server</option>
        </select>
        <label for="mail_from">Sender address</label><input type="email" id="mail_from" name="mail_from" value="<?= h($values['mail_from']) ?>" placeholder="noreply@your-domain.com">
        <p class="hint">Use an address on your own domain, or emails may end up in spam.</p>
        <div class="smtp" <?= $values['mail_method'] === 'smtp' ? '' : 'hidden' ?>>
            <div class="row3">
                <div><label for="smtp_host">SMTP server</label><input type="text" id="smtp_host" name="smtp_host" value="<?= h($values['smtp_host']) ?>" placeholder="mail.your-domain.com"></div>
                <div><label for="smtp_port">Port</label><input type="number" id="smtp_port" name="smtp_port" value="<?= h($values['smtp_port']) ?>"></div>
                <div><label for="smtp_secure">Security</label>
                    <select id="smtp_secure" name="smtp_secure">
                        <?php foreach (['tls' => 'STARTTLS', 'ssl' => 'SSL/TLS', 'none' => 'None'] as $k => $label): ?>
                            <option value="<?= $k ?>" <?= $values['smtp_secure'] === $k ? 'selected' : '' ?>><?= $label ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
            </div>
            <label for="smtp_user">SMTP username</label><input type="text" id="smtp_user" name="smtp_user" value="<?= h($values['smtp_user']) ?>">
            <label for="smtp_pass">SMTP password</label><input type="password" id="smtp_pass" name="smtp_pass" value="<?= h($values['smtp_pass']) ?>">
        </div>
        <label class="check"><input type="checkbox" name="test_mail" value="1" <?= $values['test_mail'] === '1' ? 'checked' : '' ?>> Send a test email to the admin address after installing</label>

        <h2>Players</h2>
        <label class="check"><input type="checkbox" name="registration" value="1" <?= $values['registration'] === '1' ? 'checked' : '' ?>> Let visitors create their own account (with email activation)</label>
        <p class="hint">Leave this off to add players yourself under <em>Users</em>. You can switch it any time in <em>Settings</em>.</p>

        <h2>Extras</h2>
        <label class="check"><input type="checkbox" name="demo" value="1" <?= $values['demo'] === '1' ? 'checked' : '' ?>> Add a demo level</label>
        <label for="player_user">Test player username (optional)</label><input type="text" id="player_user" name="player_user" value="<?= h($values['player_user']) ?>">
        <label for="player_pass">Test player password</label><input type="password" id="player_pass" name="player_pass" value="<?= h($values['player_pass']) ?>">
        <p class="hint">A player account lets you check what regular users see.</p>

        <button type="submit">Install</button>
    </form>
    <script>
      // Show the subfolder / SMTP fields only when they apply, and keep the web address in step with the folder.
      const form = document.querySelector('form');
      const sub = document.getElementById('subfolder');
      const path = document.getElementById('site_path');
      const url = document.getElementById('site_url');
      const syncUrl = () => {
        const mode = form.site_mode.value;
        sub.hidden = mode !== 'subfolder';
        const p = mode === 'root' ? '/' : '/' + path.value.replace(/^\/+|\/+$/g, '') + '/';
        url.value = url.value.replace(/^(https?:\/\/[^/]+).*$/, '$1') + p;
      };
      form.querySelectorAll('input[name=site_mode]').forEach((r) => r.addEventListener('change', syncUrl));
      path.addEventListener('input', syncUrl);
      document.getElementById('mail_method').addEventListener('change', (e) => {
        document.querySelector('.smtp').hidden = e.target.value !== 'smtp';
      });
    </script>
<?php });
