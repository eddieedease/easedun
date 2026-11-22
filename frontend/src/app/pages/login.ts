import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, errorCode, errorMessage } from '../core/api';
import { Auth } from '../core/auth';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  host: { class: 'auth' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="panel">
      <h1>CRAWLEASE</h1>
      @if (!auth.installed()) {
        <p>The game is not installed yet.</p>
        <a class="btn primary" href="install/">Run the installer</a>
      } @else {
        <form (ngSubmit)="submit()">
          <label for="u">Username or email</label>
          <input id="u" name="username" [(ngModel)]="username" autocomplete="username" required />
          <label for="p">Password</label>
          <input id="p" name="password" type="password" [(ngModel)]="password" autocomplete="current-password" required />
          @if (error()) {
            <p class="error">{{ error() }}</p>
          }
          @if (unverified()) {
            <button class="btn" type="button" (click)="resend()" [disabled]="busy()">Send a new activation link</button>
          }
          @if (notice()) {
            <p class="notice">{{ notice() }}</p>
          }
          <button class="btn primary" type="submit" [disabled]="busy()">Jack in</button>
        </form>
        <p class="links">
          <a routerLink="/forgot">Forgot password?</a>
          @if (auth.registration()) {
            <a routerLink="/register">Create an account</a>
          }
        </p>
      }
    </main>
  `,
  styles: `.notice { color: var(--good); margin: 4px 0 0; }`,
})
export class LoginPage {
  protected readonly auth = inject(Auth);
  private readonly router = inject(Router);
  protected username = '';
  protected password = '';
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly unverified = signal(false);
  protected readonly notice = signal('');
  private readonly api = inject(Api);

  async submit() {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    this.unverified.set(false);
    try {
      await this.auth.login(this.username, this.password);
      this.router.navigateByUrl('/');
    } catch (e) {
      this.error.set(errorMessage(e));
      this.unverified.set(errorCode(e) === 'unverified');
    } finally {
      this.busy.set(false);
    }
  }

  async resend() {
    this.busy.set(true);
    try {
      this.notice.set((await this.api.resendVerification(this.username)).message);
      this.error.set('');
      this.unverified.set(false);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
