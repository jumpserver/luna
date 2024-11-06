import {BrowserModule} from '@angular/platform-browser';
import {NgModule} from '@angular/core';
import {InfiniteScrollModule} from 'ngx-infinite-scroll';
import {FormsModule, ReactiveFormsModule} from '@angular/forms'; // <-- NgModel lives here
import {NGXLogger} from 'ngx-logger';
import {CookieService} from 'ngx-cookie-service';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {ToastrModule} from 'ngx-toastr';
import {MAT_LABEL_GLOBAL_OPTIONS} from '@angular/material';
import {HttpClient, HttpClientModule} from '@angular/common/http';
import {TranslateLoader, TranslateModule} from '@ngx-translate/core';
import {TranslateHttpLoader} from '@ngx-translate/http-loader';
import {DragDropModule} from '@angular/cdk/drag-drop';

// service
import {AllServices} from '@app/services';

// Angular split
import {AngularSplitModule} from 'angular-split';

import {AppRouterModule} from './router.module';
import {Pipes} from './pipes/pipes';
import {AppComponent} from './pages/app.component';
import {PagesComponents} from './pages/pages.component';
import {ElementComponents} from './elements/elements.component';
import {PageMainComponent} from '@app/pages/main/main.component';
import {PluginModules} from './plugins/plugins';
import {DisabledAssetsDialogComponent} from './elements/asset-tree/asset-tree.component';
import {ChangLanWarningDialogComponent} from './elements/nav/nav.component';
import {ElementSettingComponent} from '@app/elements/setting/setting.component';
import {ElementConnectDialogComponent} from './elements/connect/connect-dialog/connect-dialog.component';
import {ElementDownloadDialogComponent} from './elements/connect/download-dialog/download-dialog.component';
import {ElementACLDialogComponent} from '@app/services/connect-token/acl-dialog/acl-dialog.component';
import {ElementDialogAlertComponent} from '@app/services/dialog/dialog.service';
import {ClipboardService} from 'ngx-clipboard';
import {ElementsReplayMp4Component} from './elements/replay/mp4/mp4.component';
import {ElementCommandDialogComponent} from '@app/elements/content/command-dialog/command-dialog.component';
import {ElementSendCommandDialogComponent} from '@app/elements/content/send-command-dialog/send-command-dialog.component';
import {ElementSendCommandWithVariableDialogComponent} from '@app/elements/content/send-command-with-variable-dialog/send-command-with-variable-dialog.component';
import {DynamicFormComponent} from '@app/elements/content/variable-dynamic-form/variable-dynamic-form.component';
import {version} from '../environments/environment';
import {BehaviorSubject, forkJoin, Observable, of} from 'rxjs';
import {catchError, mergeMap} from 'rxjs/operators';


export function HttpLoaderFactory(http: HttpClient) {
  return new TranslateHttpLoader(http, '/api/v1/settings/i18n/luna/?lang=', '&v=' + version);
}

export class CustomLoader implements TranslateLoader {

  constructor(private http: HttpClient) {
  }

  public getTranslation(lang: String): Observable<any> {
    const remote = '/api/v1/settings/i18n/luna/?lang=' + lang + '&v=' + version;
    const local = '/luna/assets/i18n/' + lang + '.json';

    return forkJoin([
      this.http.get(remote).pipe(
        catchError(() => {
          return of({}); // 返回空对象或其他默认值
        })
      ),
      this.http.get(local).pipe(
        catchError(() => {
          return of({}); // 返回空对象或其他默认值
        })
      )
    ]).pipe(
      mergeMap((res) => {
        const finalRes = Object.assign({}, res[1], res[0]);
        return new BehaviorSubject(finalRes);
      })
    );
  }
}


@NgModule({
  imports: [
    DragDropModule,
    BrowserModule,
    InfiniteScrollModule,
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
        useClass: CustomLoader,
        // useFactory: HttpLoaderFactory,
        deps: [HttpClient]
      }
    }),
    ...PluginModules,
  ],
  declarations: [
    AppComponent,
    ...Pipes,
    ...ElementComponents,
    ...PagesComponents,
    ElementsReplayMp4Component,
  ],
  entryComponents: [
    ChangLanWarningDialogComponent,
    DisabledAssetsDialogComponent,
    PageMainComponent,
    ElementSettingComponent,
    ElementConnectDialogComponent,
    ElementDownloadDialogComponent,
    ElementACLDialogComponent,
    ElementDialogAlertComponent,
    ElementCommandDialogComponent,
    ElementSendCommandDialogComponent,
    DynamicFormComponent,
    ElementSendCommandWithVariableDialogComponent
  ],
  bootstrap: [AppComponent],
  providers: [
    // {provide: LoggerConfig, useValue: {level: LoggerLevel.WARN}},
    // {provide: BrowserXhr, useClass: NgProgressBrowserXhr},
    ...AllServices,
    CookieService,
    NGXLogger,
    {provide: MAT_LABEL_GLOBAL_OPTIONS, useValue: {float: 'always'}},
    ClipboardService,
  ]
})
export class AppModule {
}
