import { HttpClient, HttpInterceptorFn, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Account, AccountInput, EnemyDef, EnemyInput, Level, LevelInput, LevelSummary, SiteSettings, User } from './models';

/** Routes go through ?r= so the PHP API works on hosts without URL rewriting. */
const API = 'api/index.php';

/** Marks requests as ours; the API rejects non-GET requests without it (CSRF guard). */
export const apiHeaderInterceptor: HttpInterceptorFn = (req, next) =>
  next(req.clone({ setHeaders: { 'X-Requested-With': 'dungeon' } }));

@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  private get<T>(route: string, extra: Record<string, string> = {}) {
    return firstValueFrom(this.http.get<T>(API, { params: new HttpParams({ fromObject: { r: route, ...extra } }) }));
  }

  private send<T>(method: 'POST' | 'PUT' | 'DELETE', route: string, body?: unknown) {
    return firstValueFrom(this.http.request<T>(method, API, { params: { r: route }, body }));
  }

  status() {
    return this.get<{ installed: boolean; user: User | null; registration: boolean }>('/status');
  }

  login(username: string, password: string) {
    return this.send<User>('POST', '/auth/login', { username, password });
  }

  register(input: { username: string; email: string; password: string; website: string }) {
    return this.send<{ ok: true; message: string }>('POST', '/auth/register', input);
  }

  verifyEmail(token: string) {
    return this.send<{ ok: true; username: string }>('POST', '/auth/verify', { token });
  }

  resendVerification(login: string) {
    return this.send<{ ok: true; message: string }>('POST', '/auth/resend', { login });
  }

  forgotPassword(email: string) {
    return this.send<{ ok: true; message: string }>('POST', '/auth/forgot', { email });
  }

  resetPassword(token: string, password: string) {
    return this.send<{ ok: true }>('POST', '/auth/reset', { token, password });
  }

  users() {
    return this.get<Account[]>('/users');
  }

  createUser(input: AccountInput) {
    return this.send<Account>('POST', '/users', input);
  }

  updateUser(id: number, input: AccountInput) {
    return this.send<Account>('PUT', `/users/${id}`, input);
  }

  deleteUser(id: number) {
    return this.send<{ ok: true }>('DELETE', `/users/${id}`);
  }

  resendUserVerification(id: number) {
    return this.send<{ ok: true }>('POST', `/users/${id}/resend`);
  }

  settings() {
    return this.get<SiteSettings>('/settings');
  }

  updateSettings(input: SiteSettings) {
    return this.send<SiteSettings>('PUT', '/settings', input);
  }

  testMail(to: string) {
    return this.send<{ ok: true }>('POST', '/settings/test-mail', { to });
  }

  logout() {
    return this.send<{ ok: true }>('POST', '/auth/logout');
  }

  levels(asPlayer: boolean) {
    return this.get<LevelSummary[]>('/levels', asPlayer ? { asPlayer: '1' } : {});
  }

  level(id: number) {
    return this.get<Level>(`/levels/${id}`);
  }

  createLevel(input: LevelInput) {
    return this.send<Level>('POST', '/levels', input);
  }

  updateLevel(id: number, input: LevelInput) {
    return this.send<Level>('PUT', `/levels/${id}`, input);
  }

  deleteLevel(id: number) {
    return this.send<{ ok: true }>('DELETE', `/levels/${id}`);
  }

  enemies() {
    return this.get<EnemyDef[]>('/enemies');
  }

  createEnemy(input: EnemyInput) {
    return this.send<EnemyDef>('POST', '/enemies', input);
  }

  updateEnemy(id: number, input: EnemyInput) {
    return this.send<EnemyDef>('PUT', `/enemies/${id}`, input);
  }

  deleteEnemy(id: number) {
    return this.send<{ ok: true }>('DELETE', `/enemies/${id}`);
  }
}

/** The API's error code (e.g. 'unverified'), if any. */
export function errorCode(err: unknown): string {
  return (err as { error?: { error?: string } })?.error?.error ?? '';
}

/** Pulls a readable message out of an API error. */
export function errorMessage(err: unknown): string {
  const e = err as { error?: { message?: string }; message?: string };
  return e?.error?.message ?? e?.message ?? 'Unknown error';
}
