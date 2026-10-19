import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, errorMessage } from '../core/api';
import { CellChar, LevelData, LevelInput } from '../core/models';

interface Tool {
  cell: CellChar;
  label: string;
  hint: string;
}

const TOOLS: Tool[] = [
  { cell: '#', label: 'Wall', hint: 'Solid stone' },
  { cell: '.', label: 'Floor', hint: 'Walkable' },
  { cell: 'S', label: 'Start', hint: 'One of these is picked at random each run' },
  { cell: 'E', label: 'Exit', hint: 'One of these becomes the real stairs each run' },
  { cell: '?', label: 'Random', hint: 'Rolls monster / treasure / trap / nothing' },
  { cell: 'M', label: 'Monster', hint: 'Always a monster (random type)' },
  { cell: 'T', label: 'Treasure', hint: 'Always treasure (random amount)' },
];

function emptyLevel(width = 12, height = 10): LevelData {
  const rows = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => (x === 0 || y === 0 || x === width - 1 || y === height - 1 ? '#' : '.')).join(''),
  );
  rows[1] = '#S' + rows[1].slice(2);
  rows[height - 2] = rows[height - 2].slice(0, width - 2) + 'E#';
  return { width, height, rows, scenario: { spawnChance: 0.6, weights: { monster: 3, treasure: 2, trap: 1 } } };
}

@Component({
  selector: 'app-level-editor',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:pointerup)': 'painting.set(false)' },
  templateUrl: './level-editor.html',
  styleUrl: './level-editor.scss',
})
export class LevelEditorPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  /** Route param; undefined on /admin/levels/new. */
  readonly id = input<string>();

  protected readonly tools = TOOLS;
  protected readonly tool = signal<CellChar>('#');
  protected readonly painting = signal(false);

  protected name = '';
  protected description = '';
  protected published = false;
  protected readonly data = signal<LevelData>(emptyLevel());
  protected sizeW = 12;
  protected sizeH = 10;

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');

  protected readonly counts = computed(() => {
    const all = this.data().rows.join('');
    const count = (c: string) => all.split(c).length - 1;
    return { S: count('S'), E: count('E'), '?': count('?'), M: count('M'), T: count('T') };
  });
  protected readonly problems = computed(() => {
    const c = this.counts();
    return [c.S === 0 && 'Place at least one start (S).', c.E === 0 && 'Place at least one exit (E).'].filter(Boolean);
  });

  constructor() {
    effect(() => {
      const id = Number(this.id());
      if (id) this.load(id);
    });
  }

  private async load(id: number) {
    this.loading.set(true);
    try {
      const level = await this.api.level(id);
      this.name = level.name;
      this.description = level.description;
      this.published = level.published;
      this.data.set(level.data);
      this.sizeW = level.data.width;
      this.sizeH = level.data.height;
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected paint(x: number, y: number, start = false) {
    if (start) this.painting.set(true);
    else if (!this.painting()) return;
    const cell = this.tool();
    this.data.update((d) => {
      if (d.rows[y][x] === cell) return d;
      const rows = [...d.rows];
      rows[y] = rows[y].slice(0, x) + cell + rows[y].slice(x + 1);
      return { ...d, rows };
    });
  }

  /** Resizes the grid, keeping existing cells and walling the new edges. */
  protected resize() {
    const w = clamp(this.sizeW, 5, 64);
    const h = clamp(this.sizeH, 5, 64);
    this.sizeW = w;
    this.sizeH = h;
    this.data.update((d) => {
      const rows = Array.from({ length: h }, (_, y) =>
        Array.from({ length: w }, (_, x) => {
          const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
          return edge ? '#' : (d.rows[y]?.[x] ?? '.');
        }).join(''),
      );
      return { ...d, width: w, height: h, rows };
    });
  }

  protected clear() {
    if (confirm('Reset the grid to an empty room?')) this.data.set({ ...emptyLevel(this.sizeW, this.sizeH), scenario: this.data().scenario });
  }

  protected setScenario(field: 'spawnChance' | 'monster' | 'treasure' | 'trap', value: number) {
    this.data.update((d) => {
      const s = d.scenario;
      return field === 'spawnChance'
        ? { ...d, scenario: { ...s, spawnChance: value } }
        : { ...d, scenario: { ...s, weights: { ...s.weights, [field]: value } } };
    });
  }

  protected async save(thenPlay = false) {
    this.error.set('');
    this.notice.set('');
    this.saving.set(true);
    const input: LevelInput = { name: this.name, description: this.description, published: this.published, data: this.data() };
    try {
      const id = Number(this.id());
      const saved = id ? await this.api.updateLevel(id, input) : await this.api.createLevel(input);
      this.notice.set('Saved.');
      if (thenPlay) this.router.navigate(['/play', saved.id]);
      else if (!id) this.router.navigate(['/admin/levels', saved.id], { replaceUrl: true });
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.saving.set(false);
    }
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(Number(n) || min)));
}
