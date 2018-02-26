/**
 * app路由
 *
 *
 * @date     2017-11-07
 * @author   liuzheng <liuzheng712@gmail.com>
 */
import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {environment} from '../environments/environment';

import {NotFoundComponent} from './BasicPage/not-found/not-found.component';
import {LoginComponent} from './BasicPage/login/login.component';
import {ControlPageComponent} from './ControlPage/controlpage.component';
import {ReplayPageComponent} from './replay-page/replay-page.component';
import {MonitorPageComponent} from './monitor-page/monitor-page.component';
import {RdpPageComponent} from './rdp-page/rdp-page.component';
import {TermPageComponent} from './term-page/term-page.component';
import {ElementServerMenuComponent} from './elements/server-menu/server-menu.component';
import {BlankPageComponent} from './blank-page/blank-page.component';
import {TestPageComponent} from './test-page/test-page.component';
import {SettingPageComponent} from './setting-page/setting-page.component';

const appRoutes: Routes = [
  // {path: 'users/login', component: LoginComponent},
  {path: 'rdp/:token', component: RdpPageComponent},
  {path: 'term/:token', component: TermPageComponent},
  {path: 'replay/:token', component: ReplayPageComponent},
  {path: 'monitor/:token', component: MonitorPageComponent},
  {path: 'test', component: TestPageComponent},
  {path: 'setting', component: SettingPageComponent},
  {path: 'undefined', component: BlankPageComponent},
  {path: '', component: ControlPageComponent},
  {path: '**', component: NotFoundComponent}
];

@NgModule({
  imports: [
    RouterModule.forRoot(
      appRoutes,
      {enableTracing: !environment.production} // <-- debugging purposes only
    )
  ],
  exports: [
    RouterModule
  ]
})
export class AppRoutingModule {
}
