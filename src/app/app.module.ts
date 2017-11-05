/**
 * Created by liuzheng on 2017/8/30.
 */

import {BrowserModule} from '@angular/platform-browser';
import {NgModule} from '@angular/core';
import {FormsModule} from '@angular/forms'; // <-- NgModel lives here
import {Logger, Options, Level as LoggerLevel} from 'angular2-logger/core';
import {HttpModule} from '@angular/http';

import {AppRoutingModule} from './app-routing.module';

import {AppComponent} from './app.component';

import {NavComponent} from './BasicPage/nav/nav.component';
import {LoginComponent} from './BasicPage/login/login.component';
import {FooterComponent} from './BasicPage/footer/footer.component';
import {PageNotFoundComponent} from './BasicPage/not-found.component';

import {SearchComponent} from './ConsolePage/search/search.component';
import {IleftbarComponent} from './IndexPage/ileftbar/ileftbar.component';
import {CleftbarComponent} from './ConsolePage/cleftbar/cleftbar.component';
import {ConsoleComponent} from './ConsolePage/console/console.component';
import {ConsolenavComponent} from './ConsolePage/console/consolenav/consolenav.component';
import {RdpComponent} from './ConsolePage/console/rdp/rdp.component';
import {SshComponent} from './ConsolePage/console/ssh/ssh.component';
import {ConsolePageComponent} from './ConsolePage/consolepage.component';
import {IndexPageComponent} from './IndexPage/index-page.component';


@NgModule({
  imports: [
    BrowserModule,
    FormsModule,
    AppRoutingModule,
    HttpModule,
  ],
  declarations: [
    AppComponent,
    PageNotFoundComponent,
    NavComponent,
    LoginComponent,
    FooterComponent,

    RdpComponent,
    SshComponent,
    SearchComponent,
    IleftbarComponent,
    CleftbarComponent,
    ConsoleComponent,
    ConsolenavComponent,
    ConsolePageComponent,
    IndexPageComponent
    // HeroListComponent,
    // CrisisListComponent,
  ],
  bootstrap: [AppComponent],
  providers: [
    {provide: Options, useValue: {store: false, level: LoggerLevel.WARN}},
    Logger
  ]
})
export class AppModule {
}
