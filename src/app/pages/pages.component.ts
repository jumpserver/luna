import { PageSftpComponent } from "./sftp/sftp.component";
import { PageMainComponent } from "./main/main.component";
import { PagesBlankComponent } from "./blank/blank.component";
import { PagesReplayComponent } from "./replay/replay.component";
import { PagesConnectComponent } from "./connect/connect.component";
import { PagesMonitorComponent } from "./monitor/monitor.component";
import { PagesNotFoundComponent } from "./not-found/not-found.component";
import { PagePamComponent } from "./pam/pam.component";

export const PagesComponents = [
  PageMainComponent,
  PagesBlankComponent,
  PagesConnectComponent,
  PagesReplayComponent,
  PagesNotFoundComponent,
  PageSftpComponent,
  PagesMonitorComponent,
  PagePamComponent
];
