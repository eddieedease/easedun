import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/auth';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login').then((m) => m.LoginPage) },
  { path: 'not-installed', loadComponent: () => import('./pages/not-installed').then((m) => m.NotInstalledPage) },
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
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
