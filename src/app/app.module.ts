import {BrowserModule} from '@angular/platform-browser';
import {NgModule} from '@angular/core';
import {FormsModule, ReactiveFormsModule} from '@angular/forms'; // <-- NgModel lives here
import {NGXLogger} from 'ngx-logger';
import {HttpClientModule} from '@angular/common/http';
import {CookieService} from 'ngx-cookie-service';
import {MAT_LABEL_GLOBAL_OPTIONS} from '@angular/material';

// service
import {AppService, HttpService, LocalStorageService, NavService, LogService,
  UUIDService, TreeFilterService, ViewService,
} from './app.service';

import {AppRouterModule} from './router/router.module';
import {Pipes} from './pipes/pipes';
import {AppComponent} from './pages/app.component';
import {PagesComponents} from './pages/pages.component';
import {ElementComponents} from './elements/elements.component';
import {PageMainComponent} from '@app/pages/main/main.component';
import {PluginModules} from './plugins/plugins';
import {ChangLanWarningDialogComponent, RDPSolutionDialogComponent, FontDialogComponent} from './elements/nav/nav.component';
import {AssetTreeDialogComponent, ManualPasswordDialogComponent} from './elements/connect/connect.component';


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
    ...Pipes,
    ...ElementComponents,
    ...PagesComponents,
  ],
  entryComponents: [
    AssetTreeDialogComponent,
    ManualPasswordDialogComponent,
    ChangLanWarningDialogComponent,
    RDPSolutionDialogComponent,
    FontDialogComponent,
    PageMainComponent,
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
    CookieService,
    TreeFilterService,
    ViewService,
    NGXLogger,
    {provide: MAT_LABEL_GLOBAL_OPTIONS, useValue: {float: 'always'}}
  ]
})
export class AppModule {
}
