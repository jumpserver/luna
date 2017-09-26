/**
 * Created by liuzheng on 2017/8/31.
 */
import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {environment} from '../environments/environment';

import {WelcomeComponent} from './IndexPage/welcome.component';
import {PageNotFoundComponent} from './BasicPage/not-found.component';
import {LoginComponent} from './BasicPage/login.component';
import {TermPage} from './TerminalPage/main';

const appRoutes: Routes = [
  // { path: 'crisis-center', component: CrisisListComponent },
  {path: 'welcome', component: WelcomeComponent}, // <-- delete this line
  {path: 'login', component: LoginComponent},
  {path: 'term', component: TermPage},
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
