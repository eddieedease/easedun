import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Auth } from '../core/auth';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header>
      <a routerLink="/" class="logo">⚔ Dungeon Crawler</a>
      <nav>
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Play</a>
        @if (auth.adminView()) {
          <a routerLink="/admin" routerLinkActive="active">Level editor</a>
        }
      </nav>
      <span class="spacer"></span>
      @if (auth.isAdmin()) {
        <button class="btn view-toggle" (click)="toggleView()" [class.on]="auth.viewAsPlayer()">
          {{ auth.viewAsPlayer() ? '👁 Viewing as player' : '🛠 Admin view' }}
        </button>
      }
      <span class="user">{{ auth.user()?.username }}</span>
      <button class="btn" (click)="logout()">Log out</button>
    </header>
    <router-outlet />
  `,
  styles: `
    header {
      display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px;
      padding: 6px 16px; background: var(--panel-dark); border-bottom: 3px solid var(--edge);
    }
    .logo { color: var(--accent); text-decoration: none; font-size: 1.3em; }
    nav { display: flex; gap: 12px; }
    nav a { color: var(--muted); text-decoration: none; }
    nav a.active, nav a:hover { color: var(--text); }
    .spacer { flex: 1; }
    .user { color: var(--muted); }
    .view-toggle.on { border-color: var(--accent); }
  `,
})
export class Shell {
  protected readonly auth = inject(Auth);
  private readonly router = inject(Router);

  toggleView() {
    this.auth.toggleViewAsPlayer();
    if (this.auth.viewAsPlayer() && this.router.url.startsWith('/admin')) this.router.navigateByUrl('/');
  }

  async logout() {
    await this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
