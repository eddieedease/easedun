<?php
declare(strict_types=1);

const LEVEL_CELLS = '#.SE?MT';

/**
 * Validates level data sent by the editor and returns a normalized copy.
 * Cells: # wall, . floor, S possible start, E possible exit,
 *        ? random spot, M fixed monster, T fixed treasure.
 */
function validate_level_data(mixed $data): array
{
    if (!is_array($data)) {
        fail(422, 'invalid_level', 'Level data must be an object.');
    }
    $w = (int)($data['width'] ?? 0);
    $h = (int)($data['height'] ?? 0);
    if ($w < 5 || $w > 64 || $h < 5 || $h > 64) {
        fail(422, 'invalid_level', 'Width and height must be between 5 and 64.');
    }
    $rows = $data['rows'] ?? null;
    if (!is_array($rows) || count($rows) !== $h) {
        fail(422, 'invalid_level', 'Row count must equal the height.');
    }
    $starts = 0;
    $exits = 0;
    foreach ($rows as $i => $row) {
        if (!is_string($row) || strlen($row) !== $w || strspn($row, LEVEL_CELLS) !== $w) {
            fail(422, 'invalid_level', "Row {$i} has the wrong length or unknown cells.");
        }
        $starts += substr_count($row, 'S');
        $exits += substr_count($row, 'E');
    }
    if ($starts < 1 || $exits < 1) {
        fail(422, 'invalid_level', 'A level needs at least one start (S) and one exit (E).');
    }

    $scenario = is_array($data['scenario'] ?? null) ? $data['scenario'] : [];
    $weights = is_array($scenario['weights'] ?? null) ? $scenario['weights'] : [];
    return [
        'width' => $w,
        'height' => $h,
        'rows' => array_values($rows),
        'scenario' => [
            'spawnChance' => max(0.0, min(1.0, (float)($scenario['spawnChance'] ?? 0.6))),
            'weights' => [
                'monster' => max(0, (int)($weights['monster'] ?? 3)),
                'treasure' => max(0, (int)($weights['treasure'] ?? 2)),
                'trap' => max(0, (int)($weights['trap'] ?? 1)),
            ],
        ],
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
