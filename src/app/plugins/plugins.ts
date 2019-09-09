import {MaterialModule} from './MaterialModule.component';
import {NgxUIModule, SplitModule} from '@swimlane/ngx-ui';
import {LoggerModule, NgxLoggerLevel} from 'ngx-logger';
import {NgxDatatableModule} from '@swimlane/ngx-datatable';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {NgProgressModule} from 'ngx-progressbar';
import {FlexLayoutModule} from '@angular/flex-layout';


export const PluginModules = [
  BrowserAnimationsModule,
  NgProgressModule,
  MaterialModule,
  FlexLayoutModule,
  LoggerModule.forRoot({level: NgxLoggerLevel.DEBUG, serverLogLevel: NgxLoggerLevel.ERROR}),
  NgxDatatableModule,
  NgxUIModule,
  SplitModule
];


