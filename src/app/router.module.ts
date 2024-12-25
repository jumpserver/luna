import { NgModule } from "@angular/core";
import { RouterModule, Routes } from "@angular/router";

import { PagesBlankComponent } from "./pages/blank/blank.component";
import { PagesConnectComponent } from "./pages/connect/connect.component";
import { PagesReplayComponent } from "./pages/replay/replay.component";
import { PagesMonitorComponent } from "./pages/monitor/monitor.component";
import { PageMainComponent } from "./pages/main/main.component";
import { PageSftpComponent } from "./pages/sftp/sftp.component";
import { PagePamGUIComponent } from "./pages/pam/gui.component/gui.component";
import { PagePamTerminalComponent } from "./pages/pam/terminal.component/terminal.component";

const appRoutes: Routes = [
  { path: "replay/:sid", component: PagesReplayComponent },
  { path: "monitor/:sid", component: PagesMonitorComponent },
  { path: "connect", component: PagesConnectComponent },
  { path: "sftp", component: PageSftpComponent },
  { path: "undefined", component: PagesBlankComponent },
  { path: "", component: PageMainComponent },
  { path: "pam_terminal_connect/:sid", component: PagePamTerminalComponent },
  { path: "pam_gui_connect/:sid", component: PagePamGUIComponent },
  // { path: '**', component: PagesNotFoundComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(appRoutes, { enableTracing: false })],
  exports: [RouterModule],
})
export class AppRouterModule {}
