import {FlexLayoutModule} from '@angular/flex-layout';
import {NgZorroAntdModule} from './ZorroModule.component';
import {LoggerModule, NgxLoggerLevel} from 'ngx-logger';
import {BrowserAnimationsModule} from '@angular/platform-browser/animations';
import {ClipboardModule} from 'ngx-clipboard';
import {InfiniteScrollModule} from 'ngx-infinite-scroll';

export const PluginModules = [
  BrowserAnimationsModule,
  NgZorroAntdModule,
  FlexLayoutModule,
  ClipboardModule,
  InfiniteScrollModule,
  LoggerModule.forRoot({level: NgxLoggerLevel.DEBUG, serverLogLevel: NgxLoggerLevel.ERROR}),
];


