import {MaterialModule} from './MaterialModule.component';
// import {SplitModule, NgxUIModule} from '@swimlane/ngx-ui';
import {SplitModule} from '@app/plugins/split/split.module';
import {FlexLayoutModule} from '@angular/flex-layout';
import {LoggerModule, NgxLoggerLevel} from 'ngx-logger';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {NgProgressModule} from 'ngx-progressbar';


export const PluginModules = [
  BrowserAnimationsModule,
  NgProgressModule,
  MaterialModule,
  LoggerModule.forRoot({level: NgxLoggerLevel.DEBUG, serverLogLevel: NgxLoggerLevel.ERROR}),
  FlexLayoutModule,
  SplitModule,
  // NgxUIModule,
];


