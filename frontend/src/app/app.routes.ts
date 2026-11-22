import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/auth';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login').then((m) => m.LoginPage) },
  { path: 'not-installed', loadComponent: () => import('./pages/not-installed').then((m) => m.NotInstalledPage) },
  { path: 'register', loadComponent: () => import('./pages/account-pages').then((m) => m.RegisterPage) },
  { path: 'verify', loadComponent: () => import('./pages/account-pages').then((m) => m.VerifyPage) },
  { path: 'forgot', loadComponent: () => import('./pages/account-pages').then((m) => m.ForgotPage) },
  { path: 'reset', loadComponent: () => import('./pages/account-pages').then((m) => m.ResetPage) },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/shell').then((m) => m.Shell),
    children: [
      { path: '', loadComponent: () => import('./pages/levels').then((m) => m.LevelsPage) },
      { path: 'play/:id', loadComponent: () => import('./pages/play').then((m) => m.PlayPage) },
      {
        path: 'admin',
        canActivate: [adminGuard],
        children: [
          { path: '', loadComponent: () => import('./admin/level-list').then((m) => m.LevelListPage) },
          { path: 'levels/new', loadComponent: () => import('./admin/level-editor').then((m) => m.LevelEditorPage) },
          { path: 'levels/:id', loadComponent: () => import('./admin/level-editor').then((m) => m.LevelEditorPage) },
          { path: 'users', loadComponent: () => import('./admin/users').then((m) => m.UsersPage) },
          { path: 'settings', loadComponent: () => import('./admin/settings').then((m) => m.SettingsPage) },
          { path: 'enemies', loadComponent: () => import('./admin/bestiary').then((m) => m.BestiaryPage) },
          { path: 'enemies/new', loadComponent: () => import('./admin/enemy-editor').then((m) => m.EnemyEditorPage) },
          { path: 'enemies/:id', loadComponent: () => import('./admin/enemy-editor').then((m) => m.EnemyEditorPage) },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
