import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { PageMainComponent } from './pages/main/main.component';
import { PageSftpComponent } from './pages/sftp/sftp.component';
import { PagesBlankComponent } from './pages/blank/blank.component';
import { PagesShareComponent  } from './pages/share/share.component';
import { PageDirectComponent } from './pages/direct/direct.component';
import { PagesReplayComponent } from './pages/replay/replay.component';
import { PagesConnectComponent } from './pages/connect/connect.component';
import { PagesMonitorComponent } from './pages/monitor/monitor.component';
import { PagesKubernetesComponent } from './pages/kubernetes/kubernetes.component';

const appRoutes: Routes = [
  { path: '', component: PageMainComponent },
  { path: 'sftp', component: PageSftpComponent },
  { path: 'connect', component: PagesConnectComponent },
  { path: 'undefined', component: PagesBlankComponent },
  { path: 'share/:id', component: PagesShareComponent },
  { path: 'replay/:sid', component: PagesReplayComponent },
  { path: 'admin-connect', component: PageDirectComponent },
  { path: 'monitor/:sid', component: PagesMonitorComponent },
  { path: 'k8s/:token', component: PagesKubernetesComponent },
  // { path: '**', component: PagesNotFoundComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(appRoutes, { enableTracing: false })],
  exports: [RouterModule],
})

export class AppRouterModule {}
