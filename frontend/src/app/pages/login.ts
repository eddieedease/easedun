import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { errorMessage } from '../core/api';
import { Auth } from '../core/auth';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="panel">
      <h1>⚔ Dungeon Crawler</h1>
      @if (!auth.installed()) {
        <p>The game is not installed yet.</p>
        <a class="btn primary" href="install/">Run the installer</a>
      } @else {
        <form (ngSubmit)="submit()">
          <label for="u">Username</label>
          <input id="u" name="username" [(ngModel)]="username" autocomplete="username" required />
          <label for="p">Password</label>
          <input id="p" name="password" type="password" [(ngModel)]="password" autocomplete="current-password" required />
          @if (error()) {
            <p class="error">{{ error() }}</p>
          }
          <button class="btn primary" type="submit" [disabled]="busy()">Enter the dungeon</button>
        </form>
      }
    </main>
  `,
  styles: `
    :host { display: flex; min-height: 100vh; align-items: center; justify-content: center; padding: 16px; }
    main { width: 100%; max-width: 380px; }
    form { display: flex; flex-direction: column; gap: 6px; }
    button { margin-top: 12px; }
  `,
})
export class LoginPage {
  protected readonly auth = inject(Auth);
  private readonly router = inject(Router);
  protected username = '';
  protected password = '';
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  async submit() {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.login(this.username, this.password);
      this.router.navigateByUrl('/');
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
