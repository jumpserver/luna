/**
 * app 模块
 *
 *
 * @date     2017-11-07
 * @author   liuzheng <liuzheng712@gmail.com>
 */
import {BrowserModule} from '@angular/platform-browser';
import {NgModule} from '@angular/core';
import {FormsModule, ReactiveFormsModule} from '@angular/forms'; // <-- NgModel lives here
import {LoggerModule, NGXLogger, NgxLoggerLevel} from 'ngx-logger';
import {HttpClientModule} from '@angular/common/http';

import {AppRoutingModule} from './app-routing.module';

import {AppComponent} from './app.component';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';

// service
import {AppService, HttpService, LocalStorageService, LogService, UUIDService} from './app.service';
import {DialogService, ElementDialogAlertComponent} from './elements/dialog/dialog.service';

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
import {CleftbarComponent, CleftbarDialogComponent} from './ControlPage/cleftbar/cleftbar.component';
import {ControlComponent} from './ControlPage/control/control.component';
import {ControlnavComponent} from './ControlPage/control/controlnav/controlnav.component';
import {ControlPageComponent} from './ControlPage/controlpage.component';
import {IndexPageComponent} from './IndexPage/index-page.component';
import {NotFoundComponent} from './BasicPage/not-found/not-found.component';
import {ReplayPageComponent} from './replay-page/replay-page.component';
import {Mp4Component} from './replay-page/mp4/mp4.component';
import {JsonComponent} from './replay-page/json/json.component';
import {UtcDatePipe} from './app.pipe';
import {MonitorPageComponent} from './monitor-page/monitor-page.component';
import {LinuxComponent} from './monitor-page/linux/linux.component';
import {WindowsComponent} from './monitor-page/windows/windows.component';
import {NgProgressModule} from 'ngx-progressbar';
import {TestPageComponent} from './test-page/test-page.component';
import {BlankPageComponent} from './blank-page/blank-page.component';
import {MaterialModule} from './MaterialModule.component';
import {CookieService} from 'ngx-cookie-service';
import {NgxDatatableModule} from '@swimlane/ngx-datatable';
import {ElementTableComponent} from './elements/table/table.component';
import {SettingPageComponent} from './setting-page/setting-page.component';
import {ElementLeftbarComponent} from './elements/leftbar/leftbar.component';
import {ElementOfooterComponent} from './elements/ofooter/ofooter.component';
import {SettingPageBasicComponent} from './setting-page/basic/basic.component';
import {SettingPageEmailComponent} from './setting-page/email/email.component';
import {SettingPageLdapComponent} from './setting-page/ldap/ldap.component';
import {SettingPageTerminalComponent} from './setting-page/terminal/terminal.component';
import {SettingPageS3Component} from './setting-page/s3/s3.component';
import {TransPipe} from './trans.pipe';
import {MAT_LABEL_GLOBAL_OPTIONS} from '@angular/material';
import {ElementGuacamoleComponent} from './elements/guacamole/guacamole.component';
import {ConnectPageComponent} from './connect-page/connect-page.component';

@NgModule({
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    FormsModule,
    AppRoutingModule,
    NgProgressModule,
    HttpClientModule,
    ReactiveFormsModule,
    MaterialModule,
    LoggerModule.forRoot({serverLoggingUrl: '/api/logs', level: NgxLoggerLevel.DEBUG, serverLogLevel: NgxLoggerLevel.ERROR}),
    NgxDatatableModule
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
    ElementDialogAlertComponent,
    ElementTableComponent,
    ElementLeftbarComponent,
    ElementOfooterComponent,
    ElementGuacamoleComponent,
    LoginComponent,
    SearchComponent,
    SearchFilter,
    IleftbarComponent,
    CleftbarComponent, CleftbarDialogComponent,
    ControlComponent,
    ControlnavComponent,
    ControlPageComponent,
    IndexPageComponent,
    NotFoundComponent,
    ReplayPageComponent,
    Mp4Component,
    JsonComponent,
    UtcDatePipe,
    MonitorPageComponent,
    LinuxComponent,
    WindowsComponent,
    TestPageComponent,
    BlankPageComponent,
    SettingPageComponent,
    SettingPageBasicComponent,
    SettingPageEmailComponent,
    SettingPageLdapComponent,
    SettingPageTerminalComponent,
    SettingPageS3Component,
    TransPipe,
    ConnectPageComponent,
  ],
  entryComponents: [
    CleftbarDialogComponent,
    ElementDialogAlertComponent,
  ],
  bootstrap: [AppComponent],
  providers: [
    // {provide: LoggerConfig, useValue: {level: LoggerLevel.WARN}},
    // {provide: BrowserXhr, useClass: NgProgressBrowserXhr},
    AppService,
    HttpService,
    LogService,
    UUIDService,
    LocalStorageService,
    DialogService,
    CookieService,
    NGXLogger,
    {provide: MAT_LABEL_GLOBAL_OPTIONS, useValue: {float: 'always'}}

  ]
})
export class AppModule {
}
