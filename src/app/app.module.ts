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
<<<<<<< HEAD
import {WelcomeComponent} from './welcome.component';
import {NavComponent} from './nav.component';
import {FooterComponent} from './footer.component';
import {LeftbarComponent} from './leftbar.component';
import {PageNotFoundComponent} from './not-found.component';
import {LoginComponent} from './login.component';

=======

import {NavComponent} from './BasicPage/nav.component';
import {PageNotFoundComponent} from './BasicPage/not-found.component';
import {FooterComponent} from './BasicPage/footer.component';

import {WelcomeComponent} from './IndexPage/welcome.component';
import {LeftbarComponent} from './IndexPage/leftbar.component';
>>>>>>> master

@NgModule({
  imports: [
    BrowserModule,
    FormsModule,
    AppRoutingModule,
    HttpModule,
  ],
  declarations: [
    AppComponent,
    WelcomeComponent,
    NavComponent,
    LeftbarComponent,
    FooterComponent,
    PageNotFoundComponent,
    LoginComponent
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
