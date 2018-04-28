import {MaterialModule} from './MaterialModule.component';
import {NgxUIModule, SplitModule} from '@swimlane/ngx-ui';
import {LoggerModule, NgxLoggerLevel} from 'ngx-logger';
import {NgxDatatableModule} from '@swimlane/ngx-datatable';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {NgProgressModule} from 'ngx-progressbar';

export const PluginModules = [
  BrowserAnimationsModule,
  NgProgressModule,
  MaterialModule,
  LoggerModule.forRoot({serverLoggingUrl: '/api/logs', level: NgxLoggerLevel.DEBUG, serverLogLevel: NgxLoggerLevel.ERROR}),
  NgxDatatableModule,
  NgxUIModule,
  SplitModule
];


