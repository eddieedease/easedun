<?php
declare(strict_types=1);

const ENEMY_TRAITS = ['evasive', 'brutal', 'regenerates', 'leech', 'cowardly'];
const MAX_SPRITE_BYTES = 65536;
const MAX_SPRITE_SIZE = 128;

/** Validates an enemy from the bestiary editor. Returns [name, data JSON, image data URL]. */
function validate_enemy(array $body): array
{
    $bad = fn(string $msg) => fail(422, 'invalid_enemy', $msg);
    $name = trim((string)($body['name'] ?? ''));
    if ($name === '' || mb_strlen($name) > 80) {
        $bad('Name is required (max 80 characters).');
    }

    $image = (string)($body['image'] ?? '');
    if (!preg_match('#^data:image/png;base64,([A-Za-z0-9+/=]+)$#', $image, $m)) {
        $bad('The sprite must be a PNG image.');
    }
    $png = base64_decode($m[1], true);
    if ($png === false || strlen($png) > MAX_SPRITE_BYTES) {
        $bad('The sprite image is too large.');
    }
    $info = @getimagesizefromstring($png);
    if (!$info || $info[2] !== IMAGETYPE_PNG || $info[0] > MAX_SPRITE_SIZE || $info[1] > MAX_SPRITE_SIZE) {
        $bad('The sprite must be a PNG of at most 128x128 pixels.');
    }

    $d = is_array($body['data'] ?? null) ? $body['data'] : [];
    $int = fn($v, int $min, int $max, int $default) => max($min, min($max, is_numeric($v) ? (int)$v : $default));
    $pair = function ($v, int $max, array $default) use ($int) {
        $lo = $int($v[0] ?? null, 0, $max, $default[0]);
        $hi = $int($v[1] ?? null, 0, $max, $default[1]);
        return [min($lo, $hi), max($lo, $hi)];
    };
    $traits = array_values(array_intersect(ENEMY_TRAITS, is_array($d['traits'] ?? null) ? $d['traits'] : []));
    $data = [
        'hp' => $int($d['hp'] ?? null, 1, 999, 12),
        'attack' => $pair($d['attack'] ?? null, 99, [2, 5]),
        'defense' => $int($d['defense'] ?? null, 0, 20, 0),
        'credits' => $pair($d['credits'] ?? null, 9999, [0, 0]),
        'traits' => $traits,
        'intro' => mb_substr((string)($d['intro'] ?? ''), 0, 200),
        'defeat' => mb_substr((string)($d['defeat'] ?? ''), 0, 200),
        'size' => in_array((int)($d['size'] ?? 32), [16, 32, 64], true) ? (int)($d['size'] ?? 32) : 32,
    ];
    return [$name, json_encode($data), $image];
}

function enemy_row_to_json(array $row): array
{
    return [
        'id' => (int)$row['id'],
        'name' => $row['name'],
        'data' => json_decode($row['data'], true),
        'image' => $row['image'],
        'updatedAt' => $row['updated_at'],
    ];
}

/** Bestiary entries referenced by a level's actors (enemyRef), keyed by id. */
function enemies_for_level(array $levelData): array
{
    $ids = [];
    foreach ($levelData['actors'] ?? [] as $a) {
        if (isset($a['enemyRef']) && is_numeric($a['enemyRef'])) {
            $ids[(int)$a['enemyRef']] = true;
        }
    }
    if (!$ids) {
        return [];
    }
    $ids = array_keys($ids);
    $marks = implode(',', array_fill(0, count($ids), '?'));
    $stmt = db()->prepare('SELECT * FROM ' . t('enemies') . " WHERE id IN ({$marks})");
    $stmt->execute($ids);
    return array_map('enemy_row_to_json', $stmt->fetchAll());
}
