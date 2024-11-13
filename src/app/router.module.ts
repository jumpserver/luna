import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';

import {PagesBlankComponent} from './pages/blank/blank.component';
import {PagesConnectComponent} from './pages/connect/connect.component';
import {PagesReplayComponent} from './pages/replay/replay.component';
import {PagesMonitorComponent} from './pages/monitor/monitor.component';
import {PageMainComponent} from './pages/main/main.component';
import {PageSftpComponent} from './pages/sftp/sftp.component';
import {PagePamComponent} from '@app/pages/pam/pam.component';


const appRoutes: Routes = [
  {path: 'replay/:sid', component: PagesReplayComponent},
  {path: 'monitor/:sid', component: PagesMonitorComponent},
  {path: 'connect', component: PagesConnectComponent},
  {path: 'sftp', component: PageSftpComponent},
  {path: 'undefined', component: PagesBlankComponent},
  {path: '', component: PageMainComponent},
  // {path: '**', component: PagesNotFoundComponent}
  {path: 'pamConnect/:sid', component: PagePamComponent}
];

@NgModule({
  imports: [
    RouterModule.forRoot(
      appRoutes,
      {enableTracing: false} // <-- debugging purposes only
    )
  ],
  exports: [
    RouterModule
  ]
})
export class AppRouterModule {
}
