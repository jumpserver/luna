import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';

import {PagesBlankComponent} from './pages/blank/blank.component';
import {PagesConnectComponent} from './pages/connect/connect.component';
import {PagesReplayComponent} from './pages/replay/replay.component';
import {PageMainComponent} from './pages/main/main.component';
import {PagesMonitorComponent} from './pages/monitor/monitor.component';
import {ElementSftpComponent} from './elements/sftp/sftp.component';


const appRoutes: Routes = [
  {path: 'replay/:sid', component: PagesReplayComponent},
  {path: 'monitor/:token', component: PagesMonitorComponent},
  {path: 'connect', component: PagesConnectComponent},
  {path: 'sftp', component: ElementSftpComponent},
  {path: 'undefined', component: PagesBlankComponent},
  {path: '', component: PageMainComponent},
  // {path: '**', component: PagesNotFoundComponent}
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
