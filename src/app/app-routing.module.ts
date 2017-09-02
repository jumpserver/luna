/**
 * Created by liuzheng on 2017/8/31.
 */
import {NgModule} from '@angular/core';
import {RouterModule, Routes} from '@angular/router';
import {WelcomeComponent} from './welcome.component';
import {PageNotFoundComponent} from './not-found.component';
import {environment} from '../environments/environment';

const appRoutes: Routes = [
  // { path: 'crisis-center', component: CrisisListComponent },
  {path: 'welcome', component: WelcomeComponent}, // <-- delete this line
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
