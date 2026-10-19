import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Api } from './api';
import { User } from './models';

const VIEW_KEY = 'dungeon.viewAsPlayer';

@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly api = inject(Api);

  readonly installed = signal(true);
  readonly user = signal<User | null>(null);
  /** Lets an admin browse the app the way a regular player sees it. */
  readonly viewAsPlayer = signal(readFlag(VIEW_KEY));

  readonly isAdmin = computed(() => this.user()?.role === 'admin');
  readonly adminView = computed(() => this.isAdmin() && !this.viewAsPlayer());

  async init() {
    try {
      const status = await this.api.status();
      this.installed.set(status.installed);
      this.user.set(status.user);
    } catch {
      // Backend unreachable: keep defaults, pages will show their own errors.
    }
  }

  async login(username: string, password: string) {
    this.user.set(await this.api.login(username, password));
  }

  async logout() {
    await this.api.logout();
    this.user.set(null);
  }

  toggleViewAsPlayer() {
    this.viewAsPlayer.update((v) => !v);
    try {
      localStorage.setItem(VIEW_KEY, this.viewAsPlayer() ? '1' : '0');
    } catch {}
  }
}

function readFlag(key: string) {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export const authGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);
  if (!auth.installed()) return router.parseUrl('/not-installed');
  return auth.user() ? true : router.parseUrl('/login');
};

export const adminGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  return auth.adminView() ? true : inject(Router).parseUrl('/');
};
