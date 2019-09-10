// Elements
import {ElementLeftBarComponent} from './left-bar/left-bar.component';
import {ElementContentComponent} from './content/content.component';
import {ElementContentViewComponent} from './content-window/content-window.component';
import {ElementContentTabComponent} from './content-tab/content-tab.component';
import {ElementAssetTreeComponent} from './asset-tree/asset-tree.component';
import {ElementTreeFilterComponent} from './tree-filter/tree-filter.component';
import {ElementTermComponent} from './term/term.component';
import {ChangLanWarningDialogComponent, ElementNavComponent} from './nav/nav.component';
import {ElementRdpComponent} from './rdp/rdp.component';
import {ElementIframeComponent} from './iframe/iframe.component';
import {ElementDialogAlertComponent} from './dialog/dialog.service';
import {ElementGuacamoleComponent} from './guacamole/guacamole.component';
import {ElementSshTermComponent} from './ssh-term/ssh-term.component';
import {ElementConnectComponent, AssetTreeDialogComponent, ManualPasswordDialogComponent} from './connect/connect.component';
import {RDPSolutionDialogComponent, FontDialogComponent} from './nav/nav.component';
import {ElementSftpComponent} from '@app/elements/sftp/sftp.component';

export const ElementComponents = [
  ElementLeftBarComponent,
  ElementContentComponent,
  ElementContentTabComponent,
  ElementContentViewComponent,
  ElementConnectComponent,
  ElementTreeFilterComponent,
  ElementTermComponent,
  ElementNavComponent,
  ElementRdpComponent,
  ElementIframeComponent,
  ElementDialogAlertComponent,
  ElementGuacamoleComponent,
  ElementAssetTreeComponent,
  ElementSshTermComponent,
  ElementConnectComponent,
  ElementSftpComponent,
  AssetTreeDialogComponent,
  ChangLanWarningDialogComponent,
  ManualPasswordDialogComponent,
  RDPSolutionDialogComponent,
  FontDialogComponent
];
