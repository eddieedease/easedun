import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Auth } from '../core/auth';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header>
      <a routerLink="/" class="logo">NEON//STREETS</a>
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
      padding: 6px 16px; background: var(--panel-dark); border-bottom: 1px solid var(--neon-pink); box-shadow: 0 0 18px rgba(255,43,214,.25);
    }
    .logo { font-family: var(--font-display); color: var(--neon-pink); text-decoration: none; font-weight: 700; letter-spacing: .12em; text-shadow: 0 0 10px rgba(255,43,214,.7); }
    nav { display: flex; gap: 12px; }
    nav a { color: var(--muted); text-decoration: none; }
    nav a.active, nav a:hover { color: var(--text); }
    .spacer { flex: 1; }
    .user { color: var(--muted); }
    .view-toggle.on { color: var(--neon-yellow); border-color: var(--neon-yellow); }
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
