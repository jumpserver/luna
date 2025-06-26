import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { APP_BASE_HREF, CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms'; // <-- NgModel lives here
import { NGXLogger } from 'ngx-logger';
import { CookieService } from 'ngx-cookie-service';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { CodeEditorModule } from '@acrodata/code-editor';

// service
import { AllServices } from '@app/services';

// Angular split
import { AppRouterModule } from './router.module';
import { SharedPipeModule } from './pipes/pipes';
import { AppComponent } from './pages/app.component';
import { ElementComponents } from './elements/elements.component';
import { PluginModules } from './plugins/plugins';
import { ClipboardService } from 'ngx-clipboard';
import { environment, version } from '../environments/environment';
import { BehaviorSubject, forkJoin, Observable, of } from 'rxjs';
import { FileInputAccessorModule } from 'file-input-accessor';
import { catchError, mergeMap } from 'rxjs/operators';
import { PagesComponents } from './pages/pages.component';

export class CustomLoader implements TranslateLoader {
  constructor(private http: HttpClient) {}

  public getTranslation(lang: String): Observable<any> {
    const remote = '/api/v1/settings/i18n/luna/?lang=' + lang + '&v=' + version;
    let local = '/assets/i18n/' + lang + '.json';
    const isProd = environment.production;
    if (isProd) {
      local = '/luna' + local;
    }

    return forkJoin([
      this.http.get(remote).pipe(catchError(() => of({}))),
      this.http.get(local).pipe(catchError(() => of({})))
    ]).pipe(
      mergeMap(res => {
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
    SharedPipeModule,
    ReactiveFormsModule,
    FileInputAccessorModule,
    BrowserAnimationsModule,
    CodeEditorModule,
    TranslateModule.forRoot({
      loader: {
        provide: TranslateLoader,
        useClass: CustomLoader,
        deps: [HttpClient]
      }
    }),
    ...PluginModules
  ],
  declarations: [AppComponent, ...ElementComponents, ...PagesComponents] as any[],
  bootstrap: [AppComponent],
  providers: [
    ...AllServices,
    { provide: APP_BASE_HREF, useValue: '/luna/' },
    CookieService,
    NGXLogger,
    ClipboardService,
    provideHttpClient()
  ]
})
export class AppModule {}
