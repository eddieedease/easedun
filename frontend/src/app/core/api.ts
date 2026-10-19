import { HttpClient, HttpInterceptorFn, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Level, LevelInput, LevelSummary, User } from './models';

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
    return this.get<{ installed: boolean; user: User | null }>('/status');
  }

  login(username: string, password: string) {
    return this.send<User>('POST', '/auth/login', { username, password });
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
}

/** Pulls a readable message out of an API error. */
export function errorMessage(err: unknown): string {
  const e = err as { error?: { message?: string }; message?: string };
  return e?.error?.message ?? e?.message ?? 'Unknown error';
}
