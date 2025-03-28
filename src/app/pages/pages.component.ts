import { PageSftpComponent } from "./sftp/sftp.component";
import { PageMainComponent } from "./main/main.component";
import { PagesBlankComponent } from "./blank/blank.component";
import { PageDirectComponent } from "./direct/direct.component";
import { PagesReplayComponent } from "./replay/replay.component";
import { PagesConnectComponent } from "./connect/connect.component";
import { PagesMonitorComponent } from "./monitor/monitor.component";
import { PagesNotFoundComponent } from "./not-found/not-found.component";
import { PagesKubernetesComponent } from "./Kubernetes/kubernetes.component";

export const PagesComponents = [
  PageMainComponent,
  PageSftpComponent,
  PagesBlankComponent,
  PageDirectComponent,
  PagesReplayComponent,
  PagesConnectComponent,
  PagesMonitorComponent,
  PagesNotFoundComponent,
  PagesKubernetesComponent,
];
