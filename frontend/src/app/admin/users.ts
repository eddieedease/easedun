import { ChangeDetectionStrategy, Component, computed, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, errorMessage } from '../core/api';
import { Auth } from '../core/auth';
import { Account, Role } from '../core/models';

@Component({
  selector: 'app-users',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="head">
        <h1>Users</h1>
        <input class="search" [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Search name or email" aria-label="Search users" />
      </div>
      @if (error()) { <p class="error">{{ error() }}</p> }
      @if (notice()) { <p class="ok">{{ notice() }}</p> }

      <details class="panel create" [open]="!users.value()?.length">
        <summary>+ Add a user</summary>
        <form (ngSubmit)="create()">
          <label>Username <input name="username" [(ngModel)]="newUser.username" required /></label>
          <label>Email (optional) <input name="email" type="email" [(ngModel)]="newUser.email" /></label>
          <label>Password <input name="password" type="password" [(ngModel)]="newUser.password" autocomplete="new-password" required /></label>
          <label>Role
            <select name="role" [(ngModel)]="newUser.role">
              <option value="player">Player</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <button class="btn primary" type="submit" [disabled]="busy()">Create</button>
        </form>
        <p class="hint">Accounts you create are active right away; no activation email is needed.</p>
      </details>

      @if (users.isLoading()) {
        <p>Loading…</p>
      } @else {
        <div class="panel table-wrap">
          <table>
            <thead>
              <tr><th>User</th><th>Email</th><th>Status</th><th>Role</th><th>Joined</th><th></th></tr>
            </thead>
            <tbody>
              @for (u of filtered(); track u.id) {
                <tr>
                  <td>{{ u.username }} @if (u.id === auth.user()?.id) { <small>(you)</small> }</td>
                  <td>{{ u.email ?? '—' }}</td>
                  <td>
                    @if (u.verified) { <span class="ok">Active</span> }
                    @else {
                      <span class="pending">Awaiting activation</span>
                      <button class="btn mini" (click)="resend(u)" title="Send the activation email again">Resend</button>
                      <button class="btn mini" (click)="patch(u, { verified: true })" title="Activate without email">Activate</button>
                    }
                  </td>
                  <td>
                    <select [ngModel]="u.role" (ngModelChange)="setRole(u, $event)" [attr.aria-label]="'Role of ' + u.username">
                      <option value="player">Player</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td class="date">{{ u.createdAt.slice(0, 10) }}</td>
                  <td>
                    <div class="actions">
                      <button class="btn mini" (click)="setPassword(u)">Set password</button>
                      <button class="btn mini" (click)="setEmail(u)">Email</button>
                      @if (u.id !== auth.user()?.id) {
                        <button class="btn mini danger" (click)="remove(u)">Delete</button>
                      }
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="6">No users found.</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: `
    .head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
    .search { min-width: 220px; }
    .ok { color: var(--good); }
    .pending { color: var(--neon-yellow); margin-right: 4px; }
    .hint { color: var(--muted); font-size: .85em; margin: 6px 0 0; }
    .create { margin-bottom: 12px; }
    summary { cursor: pointer; color: var(--neon-yellow); }
    .create form { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: flex-end; margin-top: 10px; }
    .create label { display: flex; flex-direction: column; font-size: .85em; }
    .table-wrap { overflow-x: auto; padding: 0; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; color: var(--muted); font-weight: normal; font-size: .85em; }
    th, td { padding: 6px 10px; border-bottom: 1px solid var(--edge); vertical-align: middle; }
    small { color: var(--muted); }
    .date { color: var(--muted); white-space: nowrap; }
    .actions { display: flex; gap: 4px; justify-content: flex-end; flex-wrap: wrap; }
    .btn.mini { padding: 0 8px; font-size: .8em; }
  `,
})
export class UsersPage {
  private readonly api = inject(Api);
  protected readonly auth = inject(Auth);
  protected readonly users = resource({ loader: () => this.api.users() });
  protected readonly query = signal('');
  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const list = this.users.value() ?? [];
    return q ? list.filter((u) => u.username.toLowerCase().includes(q) || (u.email ?? '').includes(q)) : list;
  });
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly busy = signal(false);
  protected newUser = { username: '', email: '', password: '', role: 'player' as Role };

  private async run(action: () => Promise<unknown>, success: string) {
    this.error.set('');
    this.notice.set('');
    this.busy.set(true);
    try {
      await action();
      this.notice.set(success);
      this.users.reload();
    } catch (e) {
      this.error.set(errorMessage(e));
      this.users.reload();
    } finally {
      this.busy.set(false);
    }
  }

  protected create() {
    const input = { ...this.newUser };
    void this.run(async () => {
      await this.api.createUser(input);
      this.newUser = { username: '', email: '', password: '', role: 'player' };
    }, `Created ${input.username}.`);
  }

  protected patch(u: Account, input: Parameters<Api['updateUser']>[1]) {
    void this.run(() => this.api.updateUser(u.id, input), `Updated ${u.username}.`);
  }

  protected setRole(u: Account, role: Role) {
    this.patch(u, { role });
  }

  protected setPassword(u: Account) {
    const password = prompt(`New password for ${u.username} (min. 8 characters):`);
    if (password) this.patch(u, { password });
  }

  protected setEmail(u: Account) {
    const email = prompt(`Email address for ${u.username} (leave empty to remove):`, u.email ?? '');
    if (email !== null) this.patch(u, { email });
  }

  protected resend(u: Account) {
    void this.run(() => this.api.resendUserVerification(u.id), `Activation email sent to ${u.email}.`);
  }

  protected remove(u: Account) {
    if (!confirm(`Delete ${u.username}? This cannot be undone.`)) return;
    void this.run(() => this.api.deleteUser(u.id), `Deleted ${u.username}.`);
  }
}
