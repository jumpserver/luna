import {BrowserModule} from '@angular/platform-browser';
import {NgModule} from '@angular/core';
import {FormsModule, ReactiveFormsModule} from '@angular/forms'; // <-- NgModel lives here
import {NGXLogger} from 'ngx-logger';
import {CookieService} from 'ngx-cookie-service';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {ToastrModule} from 'ngx-toastr';
import {MAT_LABEL_GLOBAL_OPTIONS} from '@angular/material';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { TranslateModule, TranslateLoader } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';

// service
import {AllServices} from '@app/services';

// Angular split
import { AngularSplitModule } from 'angular-split';

import {AppRouterModule} from './router.module';
import {Pipes} from './pipes/pipes';
import {AppComponent} from './pages/app.component';
import {PagesComponents} from './pages/pages.component';
import {ElementComponents} from './elements/elements.component';
import {PageMainComponent} from '@app/pages/main/main.component';
import {PluginModules} from './plugins/plugins';
import {DisabledDatabaseDialogComponent} from '@app/elements/ssh-term/ssh-term.component';
import {ChangLanWarningDialogComponent} from './elements/nav/nav.component';
import {ElementSettingComponent} from '@app/elements/setting/setting.component';
import {AssetTreeDialogComponent, ManualPasswordDialogComponent} from './elements/connect/connect.component';
import {environment} from '@src/environments/environment';

export function HttpLoaderFactory(http: HttpClient) {
  return new TranslateHttpLoader(http, environment.production ? '/luna/assets/i18n/' : '/assets/i18n/');
}

@NgModule({
  imports: [
    BrowserModule,
    FormsModule,
    HttpClientModule,
    BrowserAnimationsModule,
    ReactiveFormsModule,
    AppRouterModule,
    ToastrModule.forRoot(),
    AngularSplitModule.forRoot(),
    TranslateModule.forRoot({
      loader: {
        provide: TranslateLoader,
        useFactory: HttpLoaderFactory,
        deps: [HttpClient]
      }
    }),
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
    DisabledDatabaseDialogComponent,
    ManualPasswordDialogComponent,
    ChangLanWarningDialogComponent,
    PageMainComponent,
    ElementSettingComponent,
  ],
  bootstrap: [AppComponent],
  providers: [
    // {provide: LoggerConfig, useValue: {level: LoggerLevel.WARN}},
    // {provide: BrowserXhr, useClass: NgProgressBrowserXhr},
    ...AllServices,
    CookieService,
    NGXLogger,
    {provide: MAT_LABEL_GLOBAL_OPTIONS, useValue: {float: 'always'}}
  ]
})
export class AppModule {
}
