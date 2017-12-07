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

import {IndexPageComponent} from './IndexPage/index-page.component';
import {NotFoundComponent} from './BasicPage/not-found/not-found.component';
import {LoginComponent} from './BasicPage/login/login.component';
import {ControlPageComponent} from './ControlPage/controlpage.component';
import {RdppageComponent} from './rdppage/rdppage.component';
import {TermpageComponent} from './termpage/termpage.component';
import {ReplayPageComponent} from './replay-page/replay-page.component';

const appRoutes: Routes = [
  {path: 'users/login', component: LoginComponent},
  {path: 'rdp/:token', component: RdppageComponent},
  {path: 'term/:token', component: TermpageComponent},
  {path: 'replay/:token', component: ReplayPageComponent},
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
