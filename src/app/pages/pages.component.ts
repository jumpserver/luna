import { PageSftpComponent } from './sftp/sftp.component';
import { PageMainComponent } from './main/main.component';
import { PagesBlankComponent } from './blank/blank.component';
import { PagesShareComponent } from './share/share.component';
import { PageDirectComponent } from './direct/direct.component';
import { PagesReplayComponent } from './replay/replay.component';
import { PagesConnectComponent } from './connect/connect.component';
import { PagesMonitorComponent } from './monitor/monitor.component';
import { PagesNotFoundComponent } from './not-found/not-found.component';
import { PagesKubernetesComponent } from './kubernetes/kubernetes.component';

export const PagesComponents = [
  PageMainComponent,
  PageSftpComponent,
  PagesBlankComponent,
  PageDirectComponent,
  PagesShareComponent,
  PagesReplayComponent,
  PagesConnectComponent,
  PagesMonitorComponent,
  PagesNotFoundComponent,
  PagesKubernetesComponent,
];
