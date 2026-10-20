<?php
declare(strict_types=1);

const LEVEL_CELLS = '#.SE?';
const LEVEL_THEMES = ['neon-night', 'acid-rain', 'corpo', 'rust-slums'];
const ACTOR_KINDS = ['npc', 'enemy', 'item', 'terminal', 'trigger'];
const MAX_LEVEL_BYTES = 2_000_000;

/**
 * Validates level data sent by the editor (format v2) and returns a normalized copy.
 * Cells: # building, . street, S possible start, E possible exit, ? random spot.
 * Actors (characters, enemies, items, terminals, triggers) and their dialogue are
 * structurally checked; texts are stored as-is and escaped by the frontend.
 */
function validate_level_data(mixed $data): array
{
    $bad = fn(string $msg) => fail(422, 'invalid_level', $msg);
    if (!is_array($data) || ($data['version'] ?? null) !== 2) {
        $bad('Level data must be an object with version 2.');
    }
    if (strlen(json_encode($data)) > MAX_LEVEL_BYTES) {
        $bad('Level is too large.');
    }
    $w = (int)($data['width'] ?? 0);
    $h = (int)($data['height'] ?? 0);
    if ($w < 5 || $w > 128 || $h < 5 || $h > 128) {
        $bad('Width and height must be between 5 and 128.');
    }
    $rows = $data['rows'] ?? null;
    if (!is_array($rows) || count($rows) !== $h) {
        $bad('Row count must equal the height.');
    }
    $starts = 0;
    $exits = 0;
    foreach (array_values($rows) as $i => $row) {
        if (!is_string($row) || strlen($row) !== $w || strspn($row, LEVEL_CELLS) !== $w) {
            $bad("Row {$i} has the wrong length or unknown cells.");
        }
        $starts += substr_count($row, 'S');
        $exits += substr_count($row, 'E');
    }
    if ($starts < 1 || $exits < 1) {
        $bad('A level needs at least one start (S) and one exit (E).');
    }

    $actors = [];
    foreach (array_values(is_array($data['actors'] ?? null) ? $data['actors'] : []) as $a) {
        if (!is_array($a) || !preg_match('/^[A-Za-z0-9_-]{1,40}$/', (string)($a['id'] ?? ''))
            || !in_array($a['kind'] ?? null, ACTOR_KINDS, true) || !is_array($a['dialogue'] ?? null)) {
            $bad('Every actor needs an id, a valid kind and a dialogue list.');
        }
        $a['name'] = mb_substr((string)($a['name'] ?? ''), 0, 80);
        $a['sprite'] = mb_substr((string)($a['sprite'] ?? ''), 0, 8);
        $a['dialogue'] = array_values(array_filter($a['dialogue'], 'is_array'));
        $actors[$a['id']] = $a;
    }
    if (count($actors) > 500) {
        $bad('Too many actors (max 500).');
    }

    $placements = [];
    foreach (is_array($data['placements'] ?? null) ? $data['placements'] : [] as $p) {
        $x = (int)($p['x'] ?? -1);
        $y = (int)($p['y'] ?? -1);
        if ($x >= 0 && $y >= 0 && $x < $w && $y < $h && isset($actors[$p['actor'] ?? ''])) {
            $placements[] = ['x' => $x, 'y' => $y, 'actor' => $p['actor']];
        }
    }

    $weighted = function (mixed $list) use ($actors): array {
        $pool = [];
        foreach (is_array($list) ? $list : [] as $r) {
            $weight = max(0, min(100, (int)($r['weight'] ?? 0)));
            if ($weight > 0 && isset($actors[$r['actor'] ?? ''])) {
                $pool[] = ['actor' => $r['actor'], 'weight' => $weight];
            }
        }
        return $pool;
    };

    $story = is_array($data['story'] ?? null) ? $data['story'] : [];
    $text = fn(string $key, int $max) => mb_substr((string)($story[$key] ?? ''), 0, $max);
    return [
        'version' => 2,
        'width' => $w,
        'height' => $h,
        'rows' => array_values($rows),
        'theme' => in_array($data['theme'] ?? null, LEVEL_THEMES, true) ? $data['theme'] : 'neon-night',
        'story' => [
            'intro' => $text('intro', 5000),
            'outro' => $text('outro', 5000),
            'exitFlag' => $text('exitFlag', 60),
            'exitLockedText' => $text('exitLockedText', 1000),
        ],
        'actors' => array_values($actors),
        'placements' => $placements,
        'spawnChance' => max(0.0, min(1.0, (float)($data['spawnChance'] ?? 0.5))),
        'randomPool' => $weighted($data['randomPool'] ?? null),
        'encounterRate' => max(0.0, min(0.5, (float)($data['encounterRate'] ?? 0))),
        'encounterPool' => $weighted($data['encounterPool'] ?? null),
    ];
}

function level_row_to_json(array $row, bool $withData): array
{
    $out = [
        'id' => (int)$row['id'],
        'name' => $row['name'],
        'description' => $row['description'],
        'published' => (bool)$row['published'],
        'updatedAt' => $row['updated_at'],
    ];
    if ($withData) {
        $out['data'] = json_decode($row['data'], true);
    }
    return $out;
}
