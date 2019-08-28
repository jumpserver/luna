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
import {NGXLogger} from 'ngx-logger';
import {HttpClientModule} from '@angular/common/http';

import {AppRouterModule} from './router/router.module';

import {AppComponent} from './pages/app.component';

// service
import {AppService, HttpService, LocalStorageService, NavService, LogService, UUIDService} from './app.service';


import {CookieService} from 'ngx-cookie-service';
import {MAT_LABEL_GLOBAL_OPTIONS} from '@angular/material';


import {Pipes} from './pipes/pipes';
import {PagesComponents} from './pages/pages.component';
import {ElementComponents} from './elements/elements.component';
import {ChangLanWarningDialogComponent, RDPSolutionDialogComponent, FontDialogComponent} from './elements/nav/nav.component';
import {DialogService, ElementDialogAlertComponent} from './elements/dialog/dialog.service';
import {PluginModules} from './plugins/plugins';
import {TestPageComponent} from './test-page/test-page.component';
import {AssetTreeDialogComponent, ManualPasswordDialogComponent} from './elements/asset-tree/asset-tree.component';
import {SftpComponent} from './elements/sftp/sftp.component';


@NgModule({
  imports: [
    BrowserModule,
    FormsModule,
    HttpClientModule,
    ReactiveFormsModule,
    AppRouterModule,
    ...PluginModules
  ],
  declarations: [
    AppComponent,
    TestPageComponent,
    ...Pipes,
    ...ElementComponents,
    ...PagesComponents,
    SftpComponent,
 ],
  entryComponents: [
    AssetTreeDialogComponent,
    ManualPasswordDialogComponent,
    ElementDialogAlertComponent,
    ChangLanWarningDialogComponent,
    RDPSolutionDialogComponent,
    FontDialogComponent
  ],
  bootstrap: [AppComponent],
  providers: [
    // {provide: LoggerConfig, useValue: {level: LoggerLevel.WARN}},
    // {provide: BrowserXhr, useClass: NgProgressBrowserXhr},
    AppService,
    HttpService,
    LogService,
    NavService,
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
