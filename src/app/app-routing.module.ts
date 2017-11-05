/**
 * Created by liuzheng on 2017/8/31.
 */
import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {environment} from '../environments/environment';

import {IndexPageComponent} from './IndexPage/index-page.component';
import {PageNotFoundComponent} from './BasicPage/not-found.component';
import {LoginComponent} from './BasicPage/login/login.component';
import {ConsolePageComponent} from './ConsolePage/consolepage.component';

const appRoutes: Routes = [
  // { path: 'crisis-center', component: CrisisListComponent },
  {path: 'welcome', component: IndexPageComponent}, // <-- delete this line
  {path: 'login', component: LoginComponent},
  {path: 'term', component: ConsolePageComponent},
  {path: '', redirectTo: '/welcome', pathMatch: 'full'},
  {path: '**', component: PageNotFoundComponent}
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
