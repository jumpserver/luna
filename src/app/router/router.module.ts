/**
 * app路由
 *
 *
 * @date     2017-11-07
 * @author   liuzheng <liuzheng712@gmail.com>
 */
import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {environment} from '../../environments/environment';

import {PagesBlankComponent} from '../pages/blank/blank.component';
import {TestPageComponent} from '../test-page/test-page.component';
// import {PagesSettingComponent} from '../pages/setting/setting.component';
import {PagesConnectComponent} from '../pages/connect/connect.component';
import {PagesReplayComponent} from '../pages/replay/replay.component';
import {PagesControlComponent} from '../pages/control/control.component';
import {PagesNotFoundComponent} from '../pages/not-found/not-found.component';
import {PagesMonitorComponent} from '../pages/monitor/monitor.component';


const appRoutes: Routes = [
  // {path: 'users/login', component: LoginComponent},
  {path: 'replay/:token', component: PagesReplayComponent},
  {path: 'monitor/:token', component: PagesMonitorComponent},
  {path: 'test', component: TestPageComponent},
  {path: 'connect', component: PagesConnectComponent},
  // {path: 'setting', component: PagesSettingComponent},
  {path: 'undefined', component: PagesBlankComponent},
  {path: '', component: PagesControlComponent},
  {path: '**', component: PagesNotFoundComponent}
];

@NgModule({
  imports: [
    RouterModule.forRoot(
      appRoutes,
      {enableTracing: false} // <-- debugging purposes only
      // {enableTracing: !environment.production} // <-- debugging purposes only
    )
  ],
  exports: [
    RouterModule
  ]
})
export class AppRouterModule {
}
