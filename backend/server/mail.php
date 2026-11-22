<?php
declare(strict_types=1);

/**
 * Outgoing email without dependencies: PHP's mail() (works on most shared hosts)
 * or a small SMTP client (STARTTLS / SSL, AUTH LOGIN). Configured in the settings table.
 */

/** Current mail settings with defaults. */
function mail_settings(): array
{
    $host = parse_url(site_url(), PHP_URL_HOST) ?: 'localhost';
    return [
        'method' => setting('mail_method', 'mail') === 'smtp' ? 'smtp' : 'mail',
        'from' => setting('mail_from', 'noreply@' . preg_replace('/^www\./', '', $host)),
        'from_name' => setting('mail_from_name', 'Crawlease'),
        'smtp_host' => setting('smtp_host'),
        'smtp_port' => (int)setting('smtp_port', '587'),
        'smtp_secure' => setting('smtp_secure', 'tls'),
        'smtp_user' => setting('smtp_user'),
        'smtp_pass' => setting('smtp_pass'),
    ];
}

/**
 * Sends a plain-text + HTML email. Returns null on success, or an error message.
 */
function send_mail(string $to, string $subject, string $text, string $html = ''): ?string
{
    $cfg = mail_settings();
    if (!filter_var($to, FILTER_VALIDATE_EMAIL) || !filter_var($cfg['from'], FILTER_VALIDATE_EMAIL)) {
        return 'Invalid sender or recipient address.';
    }
    [$headers, $body] = build_message($cfg, $to, $subject, $text, $html);
    try {
        if ($cfg['method'] === 'smtp') {
            smtp_send($cfg, $to, $headers, $body);
            return null;
        }
        $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
        // mail() adds To and Subject itself.
        $extra = array_filter($headers, fn($h) => !preg_match('/^(To|Subject):/i', $h));
        $ok = @mail($to, $encodedSubject, $body, implode("\r\n", $extra), '-f' . $cfg['from']);
        return $ok ? null : 'PHP mail() failed. Configure SMTP in Settings instead.';
    } catch (Throwable $e) {
        error_log('Mail error: ' . $e->getMessage());
        return $e->getMessage();
    }
}

/** @return array{0: string[], 1: string} headers and body */
function build_message(array $cfg, string $to, string $subject, string $text, string $html): array
{
    $boundary = 'b' . bin2hex(random_bytes(8));
    $domain = substr(strrchr($cfg['from'], '@'), 1);
    $fromName = '=?UTF-8?B?' . base64_encode($cfg['from_name']) . '?=';
    $headers = [
        "From: {$fromName} <{$cfg['from']}>",
        "To: <{$to}>",
        'Subject: =?UTF-8?B?' . base64_encode($subject) . '?=',
        'Date: ' . date(DATE_RFC2822),
        'Message-ID: <' . bin2hex(random_bytes(12)) . "@{$domain}>",
        'MIME-Version: 1.0',
        "Content-Type: multipart/alternative; boundary=\"{$boundary}\"",
    ];
    $html = $html !== '' ? $html : nl2br(htmlspecialchars($text));
    $body = "--{$boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
        . chunk_split(base64_encode($text))
        . "--{$boundary}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
        . chunk_split(base64_encode($html))
        . "--{$boundary}--\r\n";
    return [$headers, $body];
}

/** Minimal SMTP client. Throws on any protocol error. */
function smtp_send(array $cfg, string $to, array $headers, string $body): void
{
    if ($cfg['smtp_host'] === '') {
        throw new RuntimeException('SMTP host is not set.');
    }
    $secure = $cfg['smtp_secure'];
    $remote = ($secure === 'ssl' ? 'ssl://' : 'tcp://') . $cfg['smtp_host'] . ':' . $cfg['smtp_port'];
    $socket = @stream_socket_client($remote, $errno, $errstr, 15);
    if (!$socket) {
        throw new RuntimeException("Could not connect to {$cfg['smtp_host']}:{$cfg['smtp_port']} ({$errstr}).");
    }
    stream_set_timeout($socket, 15);

    $read = function () use ($socket): string {
        $reply = '';
        while (($line = fgets($socket, 515)) !== false) {
            $reply .= $line;
            if (strlen($line) < 4 || $line[3] === ' ') {
                break;
            }
        }
        return $reply;
    };
    $cmd = function (string $line, array $expect) use ($socket, $read): string {
        if ($line !== '') {
            fwrite($socket, $line . "\r\n");
        }
        $reply = $read();
        if (!in_array((int)substr($reply, 0, 3), $expect, true)) {
            throw new RuntimeException('SMTP error: ' . trim($reply ?: 'no reply'));
        }
        return $reply;
    };

    $hostname = parse_url(site_url(), PHP_URL_HOST) ?: 'localhost';
    $cmd('', [220]);
    $cmd("EHLO {$hostname}", [250]);
    if ($secure === 'tls') {
        $cmd('STARTTLS', [220]);
        if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            throw new RuntimeException('Could not start TLS with the SMTP server.');
        }
        $cmd("EHLO {$hostname}", [250]);
    }
    if ($cfg['smtp_user'] !== '') {
        $cmd('AUTH LOGIN', [334]);
        $cmd(base64_encode($cfg['smtp_user']), [334]);
        $cmd(base64_encode($cfg['smtp_pass']), [235]);
    }
    $cmd("MAIL FROM:<{$cfg['from']}>", [250]);
    $cmd("RCPT TO:<{$to}>", [250, 251]);
    $cmd('DATA', [354]);
    // Dot-stuffing: lines starting with "." get an extra one.
    $data = implode("\r\n", $headers) . "\r\n\r\n" . preg_replace('/^\./m', '..', $body);
    $cmd($data . "\r\n.", [250]);
    $cmd('QUIT', [221]);
    fclose($socket);
}

/** Wraps a short message in a simple, mail-client-safe HTML layout. */
function mail_layout(string $title, string $paragraphHtml, string $buttonLabel = '', string $buttonUrl = ''): string
{
    $button = $buttonUrl === '' ? '' :
        '<p style="margin:24px 0"><a href="' . htmlspecialchars($buttonUrl) . '" style="background:#f2b440;color:#17130b;padding:10px 18px;text-decoration:none;font-weight:bold;border-radius:3px">'
        . htmlspecialchars($buttonLabel) . '</a></p><p style="color:#8b877d;font-size:12px">Or open this link: '
        . htmlspecialchars($buttonUrl) . '</p>';
    return '<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#222">'
        . '<h2 style="margin:0 0 16px;letter-spacing:.08em">CRAWLEASE</h2>'
        . '<h3 style="margin:0 0 12px">' . htmlspecialchars($title) . '</h3>'
        . $paragraphHtml . $button . '</div>';
}
