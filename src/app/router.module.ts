import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { PageMainComponent } from './pages/main/main.component';
import { PagesBlankComponent } from './pages/blank/blank.component';
import { PagesShareComponent } from './pages/share/share.component';
import { PagesConnectComponent } from './pages/connect/connect.component';
import { PageDirectComponent } from './pages/direct/direct.component';
import { PagesReplayComponent } from './pages/replay/replay.component';

const appRoutes: Routes = [
  { path: '', component: PageMainComponent },
  {
    path: 'sftp',
    loadComponent: () => import('./pages/sftp/sftp.component').then(m => m.PageSftpComponent)
  },
  {
    path: 'connect',
    loadComponent: () =>
      import('./pages/connect/connect.component').then(m => m.PagesConnectComponent)
  },
  { path: 'undefined', component: PagesBlankComponent },
  { path: 'share/:id', component: PagesShareComponent },
  {
    path: 'replay/:sid',
    loadComponent: () => import('./pages/replay/replay.component').then(m => m.PagesReplayComponent)
  },
  {
    path: 'admin-connect',
    component: PageDirectComponent
    // loadComponent: () => import('./pages/direct/direct.component').then(m => m.PageDirectComponent)
  },
  {
    path: 'monitor/:sid',
    loadComponent: () =>
      import('./pages/monitor/monitor.component').then(m => m.PagesMonitorComponent)
  },
  {
    path: 'k8s/:token',
    loadComponent: () =>
      import('./pages/kubernetes/kubernetes.component').then(m => m.PagesKubernetesComponent)
  }
  // { path: '**', component: PagesNotFoundComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(appRoutes, { enableTracing: false })],
  exports: [RouterModule]
})
export class AppRouterModule {}
