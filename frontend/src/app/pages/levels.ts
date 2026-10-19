import { ChangeDetectionStrategy, Component, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, errorMessage } from '../core/api';
import { Auth } from '../core/auth';

@Component({
  selector: 'app-levels',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <h1>Choose your district</h1>
      @if (levels.isLoading()) {
        <p>Booting up…</p>
      } @else if (levels.error()) {
        <p class="error">{{ message(levels.error()) }}</p>
      } @else {
        <div class="grid">
          @for (level of levels.value(); track level.id) {
            <a class="panel card" [routerLink]="['/play', level.id]">
              <h2>{{ level.name }}</h2>
              <p>{{ level.description }}</p>
              @if (!level.published) {
                <span class="draft">Draft – only admins can see this</span>
              }
            </a>
          } @empty {
            <p>No districts have been published yet.</p>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
    .card { color: var(--text); text-decoration: none; display: block; }
    .card:hover { border-color: var(--accent); }
    .card p { color: var(--muted); margin: 0; }
    .draft { color: var(--accent); font-size: .85em; }
  `,
})
export class LevelsPage {
  private readonly api = inject(Api);
  private readonly auth = inject(Auth);

  protected readonly levels = resource({
    params: () => ({ asPlayer: !this.auth.adminView() }),
    loader: ({ params }) => this.api.levels(params.asPlayer),
  });

  protected message(e: unknown) {
    return errorMessage(e);
  }
}
