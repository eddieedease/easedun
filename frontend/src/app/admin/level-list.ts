import { ChangeDetectionStrategy, Component, inject, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, errorMessage } from '../core/api';
import { LevelSummary } from '../core/models';

@Component({
  selector: 'app-level-list',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="head">
        <h1>Levels</h1>
        <a class="btn primary" routerLink="/admin/levels/new">+ New level</a>
      </div>
      @if (error()) {
        <p class="error">{{ error() }}</p>
      }
      @if (levels.isLoading()) {
        <p>Loading…</p>
      } @else {
        <table class="panel">
          <thead>
            <tr><th>Name</th><th>Status</th><th>Updated</th><th></th></tr>
          </thead>
          <tbody>
            @for (level of levels.value(); track level.id) {
              <tr>
                <td><a [routerLink]="['/admin/levels', level.id]">{{ level.name }}</a></td>
                <td>{{ level.published ? 'Published' : 'Draft' }}</td>
                <td>{{ level.updatedAt }}</td>
                <td class="actions">
                  <a class="btn" [routerLink]="['/play', level.id]">Playtest</a>
                  <button class="btn danger" (click)="remove(level)">Delete</button>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="4">No levels yet. Create your first dungeon!</td></tr>
            }
          </tbody>
        </table>
      }
    </div>
  `,
  styles: `
    .head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; color: var(--muted); font-weight: normal; }
    th, td { padding: 6px 8px; border-bottom: 1px solid var(--edge); }
    .actions { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; }
    @media (max-width: 600px) { th:nth-child(3), td:nth-child(3) { display: none; } }
  `,
})
export class LevelListPage {
  private readonly api = inject(Api);
  protected readonly error = signal('');
  protected readonly levels = resource({ loader: () => this.api.levels(false) });

  async remove(level: LevelSummary) {
    if (!confirm(`Delete "${level.name}"? This cannot be undone.`)) return;
    try {
      await this.api.deleteLevel(level.id);
      this.levels.reload();
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }
}
