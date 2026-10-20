import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, errorMessage } from '../core/api';
import { ActorKind, CellChar, LevelData, LevelInput } from '../core/models';
import { KIND_LABELS, emptyLevel, newActor, normalizeLevel } from '../game/level-format';
import { THEME_LIST } from '../game/themes';
import { ActorEditor } from './actor-editor';
import { CELL_COLORS, MapCanvas } from './map-canvas';

type Tab = 'map' | 'actors' | 'story';
type Tool = CellChar | 'place' | 'erase' | 'pick';

const CELL_TOOLS: { tool: CellChar; label: string; hint: string }[] = [
  { tool: '#', label: 'Building', hint: 'Solid block' },
  { tool: '.', label: 'Street', hint: 'Walkable' },
  { tool: 'S', label: 'Start', hint: 'One of these is picked at random each run' },
  { tool: 'E', label: 'Exit', hint: 'One of these becomes the real exit each run' },
  { tool: '?', label: 'Random', hint: 'May spawn something from the random pool' },
];

@Component({
  selector: 'app-level-editor',
  imports: [FormsModule, RouterLink, MapCanvas, ActorEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './level-editor.html',
  styleUrl: './level-editor.scss',
})
export class LevelEditorPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  /** Route param; undefined on /admin/levels/new. */
  readonly id = input<string>();

  protected readonly cellTools = CELL_TOOLS;
  protected readonly cellColors = CELL_COLORS;
  protected readonly themes = THEME_LIST;
  protected readonly kindLabels = KIND_LABELS;
  protected readonly kinds = Object.keys(KIND_LABELS) as ActorKind[];

  protected readonly tab = signal<Tab>('map');
  protected readonly tool = signal<Tool>('#');
  protected readonly selectedActor = signal<string | null>(null);

  protected name = '';
  protected description = '';
  protected published = false;
  protected readonly data = signal<LevelData>(emptyLevel());
  protected sizeW = 20;
  protected sizeH = 16;

  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly dirty = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');

  protected readonly current = computed(() => this.data().actors.find((a) => a.id === this.selectedActor()) ?? null);
  protected readonly counts = computed(() => {
    const all = this.data().rows.join('');
    const count = (c: string) => all.split(c).length - 1;
    return { S: count('S'), E: count('E'), R: count('?') };
  });
  protected readonly problems = computed(() => {
    const c = this.counts();
    return [c.S === 0 && 'Place at least one start (S).', c.E === 0 && 'Place at least one exit (E).'].filter(Boolean) as string[];
  });
  /** All flags mentioned anywhere, as a reminder while writing conditions. */
  protected readonly flags = computed(() => {
    const json = JSON.stringify(this.data());
    const found = new Set<string>();
    for (const m of json.matchAll(/"(?:flag|notFlag|defeatFlag|exitFlag)":"([^"]+)"/g)) found.add(m[1]);
    return [...found].sort();
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
      const data = normalizeLevel(level.data);
      this.data.set(data);
      this.sizeW = data.width;
      this.sizeH = data.height;
      this.dirty.set(false);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  /** Call after mutating nested level data so views redraw. */
  protected touch() {
    this.data.update((d) => ({ ...d }));
    this.dirty.set(true);
    this.notice.set('');
  }

  // ---- map ----------------------------------------------------------------

  protected selectTool(tool: Tool) {
    this.tool.set(tool);
  }

  protected placeTool(actorId: string) {
    this.selectedActor.set(actorId);
    this.tool.set('place');
  }

  protected paint({ x, y, first }: { x: number; y: number; first: boolean }) {
    const d = this.data();
    const tool = this.tool();
    const at = d.placements.findIndex((p) => p.x === x && p.y === y);

    if (tool === 'pick') {
      if (first && at >= 0) {
        this.selectedActor.set(d.placements[at].actor);
        this.tab.set('actors');
      }
      return;
    }
    if (tool === 'erase') {
      if (at >= 0) {
        d.placements.splice(at, 1);
        this.touch();
      }
      return;
    }
    if (tool === 'place') {
      const actor = this.selectedActor();
      if (!actor || d.rows[y][x] === '#') return;
      if (at >= 0) d.placements[at].actor = actor;
      else d.placements.push({ x, y, actor });
      this.touch();
      return;
    }
    if (d.rows[y][x] === tool) return;
    const rows = [...d.rows];
    rows[y] = rows[y].slice(0, x) + tool + rows[y].slice(x + 1);
    // Nothing can stand inside a building.
    const placements = tool === '#' ? d.placements.filter((p) => p.x !== x || p.y !== y) : d.placements;
    this.data.set({ ...d, rows, placements });
    this.dirty.set(true);
  }

  /** Resizes the grid, keeping existing cells and walling the new edges. */
  protected resize() {
    const w = clamp(this.sizeW, 5, 128);
    const h = clamp(this.sizeH, 5, 128);
    this.sizeW = w;
    this.sizeH = h;
    const d = this.data();
    const rows = Array.from({ length: h }, (_, y) =>
      Array.from({ length: w }, (_, x) => {
        const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
        return edge ? '#' : (d.rows[y]?.[x] ?? '.');
      }).join(''),
    );
    const placements = d.placements.filter((p) => p.x > 0 && p.y > 0 && p.x < w - 1 && p.y < h - 1);
    this.data.set({ ...d, width: w, height: h, rows, placements });
    this.dirty.set(true);
  }

  protected fillAll(cell: '#' | '.') {
    if (!confirm(cell === '#' ? 'Fill the whole map with buildings? Then carve streets.' : 'Clear the map to open street?')) return;
    const d = this.data();
    const fresh = emptyLevel(d.width, d.height);
    const rows = cell === '#' ? fresh.rows.map((r) => r.replace(/\./g, '#')) : fresh.rows;
    this.data.set({ ...d, rows, placements: [] });
    this.dirty.set(true);
  }

  protected poolWeight(actorId: string) {
    return this.data().randomPool.find((r) => r.actor === actorId)?.weight ?? 0;
  }

  protected setPoolWeight(actorId: string, weight: number) {
    const d = this.data();
    const pool = d.randomPool.filter((r) => r.actor !== actorId);
    if (weight > 0) pool.push({ actor: actorId, weight });
    this.data.set({ ...d, randomPool: pool });
    this.dirty.set(true);
  }

  protected encounterWeight(actorId: string) {
    return this.data().encounterPool.find((r) => r.actor === actorId)?.weight ?? 0;
  }

  protected setEncounterWeight(actorId: string, weight: number) {
    const d = this.data();
    const pool = d.encounterPool.filter((r) => r.actor !== actorId);
    if (weight > 0) pool.push({ actor: actorId, weight });
    this.data.set({ ...d, encounterPool: pool });
    this.dirty.set(true);
  }

  protected setEncounterRate(value: number) {
    this.data.update((d) => ({ ...d, encounterRate: value }));
    this.dirty.set(true);
  }

  protected setSpawnChance(value: number) {
    this.data.update((d) => ({ ...d, spawnChance: value }));
    this.dirty.set(true);
  }

  protected ofKind(kind: ActorKind) {
    return this.data().actors.filter((a) => a.kind === kind);
  }

  protected placedCount(actorId: string) {
    return this.data().placements.filter((p) => p.actor === actorId).length;
  }

  // ---- actors -------------------------------------------------------------

  protected addActor(kind: ActorKind) {
    const actor = newActor(kind);
    this.data.update((d) => ({ ...d, actors: [...d.actors, actor] }));
    this.selectedActor.set(actor.id);
    this.dirty.set(true);
  }

  protected removeActor(id: string) {
    const actor = this.data().actors.find((a) => a.id === id);
    if (!actor || !confirm(`Delete "${actor.name}"? It is also removed from the map and the random pool.`)) return;
    this.data.update((d) => ({
      ...d,
      actors: d.actors.filter((a) => a.id !== id),
      placements: d.placements.filter((p) => p.actor !== id),
      randomPool: d.randomPool.filter((r) => r.actor !== id),
      encounterPool: d.encounterPool.filter((r) => r.actor !== id),
    }));
    this.selectedActor.set(null);
    this.dirty.set(true);
  }

  // ---- story --------------------------------------------------------------

  protected setTheme(theme: LevelData['theme']) {
    this.data.update((d) => ({ ...d, theme }));
    this.dirty.set(true);
  }

  // ---- save ---------------------------------------------------------------

  protected async save(thenPlay = false) {
    this.error.set('');
    this.notice.set('');
    this.saving.set(true);
    const input: LevelInput = { name: this.name, description: this.description, published: this.published, data: this.data() };
    try {
      const id = Number(this.id());
      const saved = id ? await this.api.updateLevel(id, input) : await this.api.createLevel(input);
      this.dirty.set(false);
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
