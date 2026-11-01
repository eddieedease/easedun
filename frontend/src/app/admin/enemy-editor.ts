import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, errorMessage } from '../core/api';
import { EnemyStats, EnemyTrait } from '../core/models';
import { TRAIT_INFO, defaultEnemyStats } from '../game/level-format';
import { PixelEditor } from './pixel-editor';

@Component({
  selector: 'app-enemy-editor',
  imports: [FormsModule, RouterLink, PixelEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './enemy-editor.html',
  styleUrl: './enemy-editor.scss',
})
export class EnemyEditorPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  /** Route param; undefined on /admin/enemies/new. */
  readonly id = input<string>();

  protected readonly traits = Object.entries(TRAIT_INFO) as [EnemyTrait, { label: string; hint: string }][];
  protected name = 'New enemy';
  protected readonly stats = signal<EnemyStats>(defaultEnemyStats());
  protected readonly image = signal('');
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly dirty = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');

  constructor() {
    effect(() => {
      const id = Number(this.id());
      if (id) void this.load(id);
    });
  }

  private async load(id: number) {
    this.loading.set(true);
    try {
      const enemy = (await this.api.enemies()).find((e) => e.id === id);
      if (!enemy) throw new Error('Enemy not found.');
      this.name = enemy.name;
      this.stats.set({ ...defaultEnemyStats(), ...enemy.data });
      this.image.set(enemy.image);
      this.dirty.set(false);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected set<K extends keyof EnemyStats>(key: K, value: EnemyStats[K]) {
    this.stats.update((s) => ({ ...s, [key]: value }));
    this.dirty.set(true);
  }

  protected setPair(key: 'attack' | 'credits', i: 0 | 1, value: number) {
    const pair: [number, number] = [...this.stats()[key]];
    pair[i] = Math.max(0, Math.round(value || 0));
    this.set(key, pair);
  }

  protected setSize(size: number) {
    this.set('size', size === 16 || size === 64 ? size : 32);
  }

  protected toggleTrait(trait: EnemyTrait) {
    const list = this.stats().traits;
    this.set('traits', list.includes(trait) ? list.filter((t) => t !== trait) : [...list, trait]);
  }

  protected onSprite(url: string) {
    this.image.set(url);
    this.dirty.set(true);
  }

  protected async save() {
    this.error.set('');
    this.notice.set('');
    this.saving.set(true);
    const input = { name: this.name, data: this.stats(), image: this.image() };
    try {
      const id = Number(this.id());
      const saved = id ? await this.api.updateEnemy(id, input) : await this.api.createEnemy(input);
      this.dirty.set(false);
      this.notice.set('Saved.');
      if (!id) this.router.navigate(['/admin/enemies', saved.id], { replaceUrl: true });
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove() {
    const id = Number(this.id());
    if (!id || !confirm(`Delete "${this.name}"? Levels that use it fall back to a placeholder.`)) return;
    try {
      await this.api.deleteEnemy(id);
      this.router.navigateByUrl('/admin/enemies');
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }
}
