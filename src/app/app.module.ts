/**
 * Created by liuzheng on 2017/8/30.
 */

/**
 * app 模块
 *
 *
 * @date     2017-11-07
 * @author   liuzheng <liuzheng712@gmail.com>
 */
import {BrowserModule} from '@angular/platform-browser';
import {NgModule} from '@angular/core';
import {FormsModule} from '@angular/forms'; // <-- NgModel lives here
import {NGXLogger, LoggerConfig, NgxLoggerLevel as LoggerLevel} from 'ngx-logger';
import {HttpModule} from '@angular/http';

import {AppRoutingModule} from './app-routing.module';

import {AppComponent} from './app.component';
// service
import {AppService, HttpService} from './app.service';
import {LayerService} from './elements/layer/layer.service';

// Elements
import {ElementFooterComponent} from './elements/footer/footer.component';
import {ElementTermComponent} from './elements/term/term.component';
import {ElementInteractiveComponent} from './elements/interactive/interactive.component';
import {ElementNavComponent} from './elements/nav/nav.component';
import {ElementPopupComponent} from './elements/popup/popup.component';
import {ElementRdpComponent} from './elements/rdp/rdp.component';
import {ElementServerMenuComponent} from './elements/server-menu/server-menu.component';
import {ElementIframeComponent} from './elements/iframe/iframe.component';
// pages
import {LoginComponent} from './BasicPage/login/login.component';
import {IleftbarComponent} from './IndexPage/ileftbar/ileftbar.component';
import {SearchComponent, SearchFilter} from './ControlPage/search/search.component';
import {CleftbarComponent} from './ControlPage/cleftbar/cleftbar.component';
import {ControlComponent} from './ControlPage/control/control.component';
import {ControlnavComponent} from './ControlPage/control/controlnav/controlnav.component';
import {ControlPageComponent} from './ControlPage/controlpage.component';
import {IndexPageComponent} from './IndexPage/index-page.component';
import {NotFoundComponent} from './BasicPage/not-found/not-found.component';
import {RdpPageComponent} from './rdp-page/rdp-page.component';
import {TermPageComponent} from './term-page/term-page.component';
import {ReplayPageComponent} from './replay-page/replay-page.component';
import {Mp4Component} from './replay-page/mp4/mp4.component';
import {JsonComponent} from './replay-page/json/json.component';
import {UtcDatePipe} from './app.pipe';
import {MonitorPageComponent} from './monitor-page/monitor-page.component';
import {LinuxComponent} from './monitor-page/linux/linux.component';
import {WindowsComponent} from './monitor-page/windows/windows.component';
import {BrowserXhr} from '@angular/http';
import {NgProgressModule, NgProgressBrowserXhr} from 'ngx-progressbar';


import {NgxLayerModule} from 'ngx-layer';
import {TestPageComponent} from './test-page/test-page.component';

@NgModule({
  imports: [
    BrowserModule,
    FormsModule,
    AppRoutingModule,
    HttpModule,
    NgProgressModule,
    NgxLayerModule
  ],
  declarations: [
    AppComponent,
    ElementNavComponent,
    ElementFooterComponent,
    ElementPopupComponent,
    ElementTermComponent,
    ElementInteractiveComponent,
    ElementRdpComponent,
    ElementServerMenuComponent,
    ElementIframeComponent,
    LoginComponent,
    SearchComponent,
    SearchFilter,
    IleftbarComponent,
    CleftbarComponent,
    ControlComponent,
    ControlnavComponent,
    ControlPageComponent,
    IndexPageComponent,
    NotFoundComponent,
    RdpPageComponent,
    TermPageComponent,
    ReplayPageComponent,
    Mp4Component,
    JsonComponent,
    UtcDatePipe,
    MonitorPageComponent,
    LinuxComponent,
    WindowsComponent,
    TestPageComponent,
  ],
  bootstrap: [AppComponent],
  providers: [
    {provide: LoggerConfig, useValue: {level: LoggerLevel.WARN}},
    {provide: BrowserXhr, useClass: NgProgressBrowserXhr},
    AppService,
    HttpService,
    LayerService,
    NGXLogger,
  ]
})
export class AppModule {
}
