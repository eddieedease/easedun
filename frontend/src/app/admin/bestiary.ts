import { ChangeDetectionStrategy, Component, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, errorMessage } from '../core/api';
import { TRAIT_INFO } from '../game/level-format';

@Component({
  selector: 'app-bestiary',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="head">
        <h1>Bestiary</h1>
        <a class="btn primary" routerLink="/admin/enemies/new">+ New enemy</a>
      </div>
      <p class="hint">Reusable enemies with their own sprite and traits. Add them to a district from its <em>Characters &amp; items</em> tab.</p>
      @if (enemies.isLoading()) {
        <p>Loading…</p>
      } @else if (enemies.error()) {
        <p class="error">{{ message(enemies.error()) }}</p>
      } @else {
        <div class="grid">
          @for (e of enemies.value(); track e.id) {
            <a class="panel card" [routerLink]="['/admin/enemies', e.id]">
              <img [src]="e.image" [alt]="e.name" />
              <div class="info">
                <h2>{{ e.name }}</h2>
                <small>HP {{ e.data.hp }} · DMG {{ e.data.attack[0] }}–{{ e.data.attack[1] }}@if (e.data.defense) { · DEF {{ e.data.defense }} }</small>
                <div class="traits">
                  @for (t of e.data.traits; track t) { <span>{{ traitInfo[t].label }}</span> }
                </div>
              </div>
            </a>
          } @empty {
            <p>No enemies yet. Draw your first one!</p>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .hint { color: var(--muted); }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
    .card { display: flex; gap: 12px; align-items: center; color: var(--text); text-decoration: none; }
    .card:hover { border-color: var(--neon-cyan); }
    img { width: 72px; height: 72px; image-rendering: pixelated; filter: drop-shadow(0 0 6px rgba(255, 43, 214, 0.5)); }
    h2 { margin: 0 0 2px; font-size: .95rem; }
    small { color: var(--muted); }
    .traits { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .traits span { font-size: .75em; color: var(--neon-yellow); border: 1px solid rgba(245, 240, 0, 0.4); padding: 0 4px; }
  `,
})
export class BestiaryPage {
  private readonly api = inject(Api);
  protected readonly traitInfo = TRAIT_INFO;
  protected readonly enemies = resource({ loader: () => this.api.enemies() });

  protected message(e: unknown) {
    return errorMessage(e);
  }
}
