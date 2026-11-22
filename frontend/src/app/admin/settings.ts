import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, errorMessage } from '../core/api';
import { Auth } from '../core/auth';
import { SiteSettings } from '../core/models';

@Component({
  selector: 'app-settings',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <h1>Settings</h1>
      @if (!s()) {
        <p>{{ error() || 'Loading…' }}</p>
      } @else {
        @let cfg = s()!;
        <form (ngSubmit)="save()">
          <section class="panel">
            <div class="panel-title">Players</div>
            <label class="check">
              <input type="checkbox" name="reg" [(ngModel)]="cfg.registrationOpen" />
              Let visitors create their own account (they activate it by email)
            </label>
            <p class="hint">When off, only admins can add players (under Users).</p>
          </section>

          <section class="panel">
            <div class="panel-title">Site address</div>
            <label>Public web address of the game
              <input name="siteUrl" [(ngModel)]="cfg.siteUrl" [placeholder]="cfg.detectedSiteUrl ?? ''" />
            </label>
            <p class="hint">Used in links inside emails. Leave empty to use the address the server sees right now: <code>{{ cfg.detectedSiteUrl }}</code></p>
          </section>

          <section class="panel">
            <div class="panel-title">Email</div>
            <div class="grid">
              <label>Send email with
                <select name="method" [(ngModel)]="cfg.mail.method">
                  <option value="mail">PHP mail() (no setup)</option>
                  <option value="smtp">SMTP server</option>
                </select>
              </label>
              <label>Sender address <input name="from" type="email" [(ngModel)]="cfg.mail.from" placeholder="noreply@your-domain.com" /></label>
              <label>Sender name <input name="fromName" [(ngModel)]="cfg.mail.fromName" /></label>
            </div>
            @if (cfg.mail.method === 'smtp') {
              <div class="grid">
                <label>SMTP server <input name="host" [(ngModel)]="cfg.mail.smtpHost" placeholder="mail.your-domain.com" /></label>
                <label>Port <input name="port" type="number" [(ngModel)]="cfg.mail.smtpPort" /></label>
                <label>Security
                  <select name="secure" [(ngModel)]="cfg.mail.smtpSecure">
                    <option value="tls">STARTTLS (usually port 587)</option>
                    <option value="ssl">SSL/TLS (usually port 465)</option>
                    <option value="none">None</option>
                  </select>
                </label>
                <label>Username <input name="user" [(ngModel)]="cfg.mail.smtpUser" autocomplete="off" /></label>
                <label>Password
                  <input name="pass" type="password" [(ngModel)]="cfg.mail.smtpPass" autocomplete="new-password"
                         [placeholder]="cfg.mail.smtpPassSet ? '•••••• (saved; type to replace)' : ''" />
                </label>
              </div>
            }
            <div class="test">
              <input name="testTo" type="email" [(ngModel)]="testTo" placeholder="send a test email to…" aria-label="Test email address" />
              <button class="btn" type="button" (click)="test()" [disabled]="busy() || !testTo">Send test email</button>
            </div>
            <p class="hint">Save first, then send a test. Use a sender address on your own domain so emails don't land in spam.</p>
          </section>

          @if (error()) { <p class="error">{{ error() }}</p> }
          @if (notice()) { <p class="ok">{{ notice() }}</p> }
          <button class="btn primary" type="submit" [disabled]="busy()">Save settings</button>
        </form>
      }
    </div>
  `,
  styles: `
    form { display: flex; flex-direction: column; gap: 12px; max-width: 760px; }
    .panel { display: flex; flex-direction: column; gap: 8px; }
    label { display: flex; flex-direction: column; font-size: .9em; gap: 2px; }
    .check { flex-direction: row; align-items: center; gap: 8px; color: var(--text); }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px 12px; }
    .test { display: flex; gap: 8px; flex-wrap: wrap; }
    .test input { flex: 1; min-width: 200px; }
    .hint { color: var(--muted); font-size: .85em; margin: 0; }
    code { color: var(--neon-yellow); }
    .ok { color: var(--good); }
    button.primary { align-self: flex-start; }
  `,
})
export class SettingsPage {
  private readonly api = inject(Api);
  private readonly auth = inject(Auth);
  protected readonly s = signal<SiteSettings | null>(null);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly busy = signal(false);
  protected testTo = '';

  constructor() {
    void this.load();
  }

  private async load() {
    try {
      this.s.set(await this.api.settings());
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }

  protected async save() {
    const cfg = this.s();
    if (!cfg) return;
    this.error.set('');
    this.notice.set('');
    this.busy.set(true);
    try {
      const saved = await this.api.updateSettings(cfg);
      this.s.set(saved);
      this.auth.registration.set(saved.registrationOpen);
      this.notice.set('Settings saved.');
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected async test() {
    this.error.set('');
    this.notice.set('');
    this.busy.set(true);
    try {
      await this.api.testMail(this.testTo);
      this.notice.set(`Test email sent to ${this.testTo}. Check that inbox (and its spam folder).`);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
