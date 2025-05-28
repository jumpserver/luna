import {BrowserModule} from '@angular/platform-browser';
import {NgModule} from '@angular/core';
import {HttpClient, provideHttpClient} from '@angular/common/http';
import {CommonModule} from '@angular/common';
import {FormsModule, ReactiveFormsModule} from '@angular/forms'; // <-- NgModel lives here
import {NGXLogger} from 'ngx-logger';
import {CookieService} from 'ngx-cookie-service';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {TranslateLoader, TranslateModule} from '@ngx-translate/core';
import {TranslateHttpLoader} from '@ngx-translate/http-loader';
import {DragDropModule} from '@angular/cdk/drag-drop';
import {CodemirrorModule} from '@ctrl/ngx-codemirror';
import {AngularSplitModule} from 'angular-split';

// service
import {AllServices} from '@app/services';

// Angular split
import {AppRouterModule} from './router.module';
import {SharedPipeModule} from './pipes/pipes';
import {AppComponent} from './pages/app.component';
import {ElementComponents} from './elements/elements.component';
import {PluginModules} from './plugins/plugins';
import {ClipboardService} from 'ngx-clipboard';
import {version} from '../environments/environment';
import {BehaviorSubject, forkJoin, Observable, of} from 'rxjs';
import {FileInputAccessorModule} from 'file-input-accessor';
import {catchError, mergeMap} from 'rxjs/operators';
import {PagesComponents} from './pages/pages.component';

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
        catchError(() => of({}))
      ),
      this.http.get(local).pipe(
        catchError(() => of({}))
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
    CommonModule,
    FormsModule,
    AppRouterModule,
    CodemirrorModule,
    SharedPipeModule,
    AngularSplitModule,
    ReactiveFormsModule,
    FileInputAccessorModule,
    BrowserAnimationsModule,
    TranslateModule.forRoot({
      loader: {
        provide: TranslateLoader,
        useClass: CustomLoader,
        deps: [HttpClient]
      }
    }),
    ...PluginModules,
  ],
  declarations: [
    AppComponent,
    ...ElementComponents,
    ...PagesComponents,
  ],
  bootstrap: [AppComponent],
  providers: [
    ...AllServices,
    CookieService,
    NGXLogger,
    ClipboardService,
    provideHttpClient()
  ]
})
export class AppModule {
}
