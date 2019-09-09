import {PageMainComponent} from './main/main.component';
import {PagesBlankComponent} from './blank/blank.component';
import {PagesConnectComponent} from './connect/connect.component';
import {PagesMonitorComponent} from './monitor/monitor.component';
import {PagesReplayComponent} from './replay/replay.component';
import {PagesNotFoundComponent} from './not-found/not-found.component';
import {PagesLoginComponent} from './login/login.component';
import {JsonComponent} from './replay/json/json.component';
import {PagesMonitorLinuxComponent} from './monitor/linux/linux.component';
import {PagesMonitorWindowsComponent} from './monitor/windows/windows.component';
import {ReplayGuacamoleComponent} from './replay/guacamole/guacamole.component';

export const PagesComponents = [
  PageMainComponent,
  PagesBlankComponent,
  PagesConnectComponent,
  PagesMonitorComponent,
  PagesReplayComponent, JsonComponent,
  PagesNotFoundComponent,
  PagesLoginComponent,
  PagesMonitorLinuxComponent,
  PagesMonitorWindowsComponent,
  ReplayGuacamoleComponent
];
