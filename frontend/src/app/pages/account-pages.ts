import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, errorMessage } from '../core/api';
import { Auth } from '../core/auth';

/** Sign-up with email activation. */
@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'auth' },
  template: `
    <main class="panel">
      <h1>CRAWLEASE</h1>
      @if (!auth.registration()) {
        <p>Sign-up is closed. Ask an admin for an account.</p>
        <a routerLink="/login">Back to log in</a>
      } @else if (done()) {
        <h2>Check your inbox</h2>
        <p>{{ done() }}</p>
        <p class="hint">No email after a few minutes? Check your spam folder, or log in to request a new link.</p>
        <a class="btn primary" routerLink="/login">Go to log in</a>
      } @else {
        <h2>Create an account</h2>
        <form (ngSubmit)="submit()">
          <label for="u">Username</label>
          <input id="u" name="username" [(ngModel)]="username" autocomplete="username" required minlength="3" maxlength="30" />
          <label for="e">Email address</label>
          <input id="e" name="email" type="email" [(ngModel)]="email" autocomplete="email" required />
          <label for="p">Password (min. 8 characters)</label>
          <input id="p" name="password" type="password" [(ngModel)]="password" autocomplete="new-password" required minlength="8" />
          <label for="p2">Repeat password</label>
          <input id="p2" name="password2" type="password" [(ngModel)]="password2" autocomplete="new-password" required />
          <!-- Honeypot for bots: hidden from people and assistive tech. -->
          <input class="hp" name="website" [(ngModel)]="website" tabindex="-1" autocomplete="off" aria-hidden="true" />
          @if (error()) { <p class="error">{{ error() }}</p> }
          <button class="btn primary" type="submit" [disabled]="busy()">Create account</button>
        </form>
        <p class="links"><a routerLink="/login">I already have an account</a></p>
      }
    </main>
  `,
})
export class RegisterPage {
  private readonly api = inject(Api);
  protected readonly auth = inject(Auth);
  protected username = '';
  protected email = '';
  protected password = '';
  protected password2 = '';
  protected website = '';
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly done = signal('');

  async submit() {
    this.error.set('');
    if (this.password !== this.password2) {
      this.error.set("The passwords don't match.");
      return;
    }
    this.busy.set(true);
    try {
      const res = await this.api.register({ username: this.username, email: this.email, password: this.password, website: this.website });
      this.done.set(res.message);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}

/** Landing page of the activation link in the email. */
@Component({
  selector: 'app-verify',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'auth' },
  template: `
    <main class="panel">
      <h1>CRAWLEASE</h1>
      @if (state() === 'busy') {
        <p>Activating your account…</p>
      } @else if (state() === 'ok') {
        <h2>Account activated</h2>
        <p>Welcome{{ name() ? ', ' + name() : '' }}! You can log in now.</p>
        <a class="btn primary" routerLink="/login">Log in</a>
      } @else {
        <h2>Link not valid</h2>
        <p class="error">{{ error() }}</p>
        <a routerLink="/login">Back to log in</a>
      }
    </main>
  `,
})
export class VerifyPage implements OnInit {
  private readonly api = inject(Api);
  readonly token = input('');
  protected readonly state = signal<'busy' | 'ok' | 'error'>('busy');
  protected readonly name = signal('');
  protected readonly error = signal('');

  async ngOnInit() {
    try {
      const res = await this.api.verifyEmail(this.token());
      this.name.set(res.username);
      this.state.set('ok');
    } catch (e) {
      this.error.set(errorMessage(e));
      this.state.set('error');
    }
  }
}

/** Asks for a password reset link. */
@Component({
  selector: 'app-forgot',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'auth' },
  template: `
    <main class="panel">
      <h1>CRAWLEASE</h1>
      <h2>Forgot your password?</h2>
      @if (done()) {
        <p>{{ done() }}</p>
        <a routerLink="/login">Back to log in</a>
      } @else {
        <p class="hint">Enter the email address of your account and we'll send you a link to choose a new password.</p>
        <form (ngSubmit)="submit()">
          <label for="e">Email address</label>
          <input id="e" name="email" type="email" [(ngModel)]="email" autocomplete="email" required />
          @if (error()) { <p class="error">{{ error() }}</p> }
          <button class="btn primary" type="submit" [disabled]="busy()">Send reset link</button>
        </form>
        <p class="links"><a routerLink="/login">Back to log in</a></p>
      }
    </main>
  `,
})
export class ForgotPage {
  private readonly api = inject(Api);
  protected email = '';
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly done = signal('');

  async submit() {
    this.busy.set(true);
    this.error.set('');
    try {
      this.done.set((await this.api.forgotPassword(this.email)).message);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}

/** Landing page of the reset link: choose a new password. */
@Component({
  selector: 'app-reset',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'auth' },
  template: `
    <main class="panel">
      <h1>CRAWLEASE</h1>
      <h2>Choose a new password</h2>
      @if (done()) {
        <p>Your password has been changed.</p>
        <a class="btn primary" routerLink="/login">Log in</a>
      } @else {
        <form (ngSubmit)="submit()">
          <label for="p">New password (min. 8 characters)</label>
          <input id="p" name="password" type="password" [(ngModel)]="password" autocomplete="new-password" required minlength="8" />
          <label for="p2">Repeat password</label>
          <input id="p2" name="password2" type="password" [(ngModel)]="password2" autocomplete="new-password" required />
          @if (error()) { <p class="error">{{ error() }}</p> }
          <button class="btn primary" type="submit" [disabled]="busy()">Save password</button>
        </form>
        <p class="links"><a routerLink="/forgot">Request a new link</a></p>
      }
    </main>
  `,
})
export class ResetPage {
  private readonly api = inject(Api);
  readonly token = input('');
  protected password = '';
  protected password2 = '';
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly done = signal(false);

  async submit() {
    this.error.set('');
    if (this.password !== this.password2) {
      this.error.set("The passwords don't match.");
      return;
    }
    this.busy.set(true);
    try {
      await this.api.resetPassword(this.token(), this.password);
      this.done.set(true);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
