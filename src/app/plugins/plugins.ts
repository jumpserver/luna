import {SplitModule} from '@app/plugins/split/split.module';
import {FlexLayoutModule} from '@angular/flex-layout';
import {NgZorroAntdModule} from './ZorroModule.component';
import {LoggerModule, NgxLoggerLevel} from 'ngx-logger';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {ClipboardModule} from 'ngx-clipboard';


export const PluginModules = [
  BrowserAnimationsModule,
  NgZorroAntdModule,
  FlexLayoutModule,
  SplitModule,
  ClipboardModule,
  LoggerModule.forRoot({level: NgxLoggerLevel.DEBUG, serverLogLevel: NgxLoggerLevel.ERROR}),
];


