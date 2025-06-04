// Elements
import {ElementLeftBarComponent} from './left-bar/left-bar.component';
import {ElementContentComponent} from './content/content.component';
import {ElementContentWindowComponent} from './content/content-window/content-window.component';
import {ElementContentTabComponent} from './content/content-tab/content-tab.component';
import {ElementContentFooterComponent} from './content/content-footer/content-footer.component';
import {ElementAssetTreeComponent} from './asset-tree/asset-tree.component';
import {ElementTreeFilterComponent} from '@app/elements/asset-tree/tree-filter/tree-filter.component';
import {ElementOrganizationComponent} from '@app/elements/left-bar/organization/organization.component';
import {ElementUserFileComponent} from '@app/elements/nav/profile/profile.component';
import {ElementNavComponent} from './nav/nav.component';
import {ElementIframeComponent} from './iframe/iframe.component';
import {ElementConnectComponent} from './connect/connect.component';
import {ElementConnectDialogComponent} from './connect/connect-dialog/connect-dialog.component';
import {ElementSettingComponent} from '@app/elements/nav/setting/setting.component';
import {ElementReplayGuacamoleComponent} from './replay/guacamole/guacamole.component';
import {ElementConnectorKokoComponent} from './content/content-window/koko/koko.component';
import {ElementConnectorMagnusComponent} from './content/content-window/magnus/magnus.component';
import {ElementConnectorDefaultComponent} from '@app/elements/content/content-window/default/default.component';
import {ElementContentViewComponent} from '@app/elements/content/content-window/content-view/content-view.component';
import {ElementSelectAccountComponent} from './connect/connect-dialog/select-account/select-account.component';
import {ElementReplayAsciicastComponent} from '@app/elements/replay/asciicast/asciicast.component';
import {ElementAdvancedOptionComponent} from './connect/connect-dialog/advanced-option/advanced-option.component';
import {ElementConnectMethodComponent} from './connect/connect-dialog/connect-method/connect-method.component';
import {ElementDownloadDialogComponent} from './connect/download-dialog/download-dialog.component';
import {ElementsReplayMp4Component} from './replay/mp4/mp4.component';
import {ElementConnectorGuideComponent} from '@app/elements/content/content-window/guide/guide.component';
import {ElementCommandDialogComponent} from '@app/elements/content/command-dialog/command-dialog.component';
import {
  ElementSendCommandDialogComponent
} from '@app/elements/content/content-footer/send-command-dialog/send-command-dialog.component';
import {
  ElementSendCommandWithVariableDialogComponent
} from '@app/elements/content/content-footer/send-command-with-variable-dialog/send-command-with-variable-dialog.component';
import {DynamicFormComponent} from '@app/elements/content/content-footer/variable-dynamic-form/variable-dynamic-form.component';
import {ElementChatComponent} from '@app/elements/chat/chat.component';
import {ElementsPartsComponent} from './replay/parts/parts.component';
import {ElementConnectorNecComponent} from '@app/elements/content/content-window/nec/nec.component';
import {ElementFaceMonitorComponent} from '@app/elements/connect/face-monitor/face-monitor.component';

import {ElementACLDialogComponent} from '@app/services/connect-token/acl-dialog/acl-dialog.component';
import {ElementDialogAlertComponent} from '@app/services/dialog/alert.service';
import {ElementTermComponent} from '@app/elements/replay/term/term.component';

export const ElementComponents = [
  ElementLeftBarComponent,
  ElementContentComponent,
  ElementContentTabComponent,
  ElementContentWindowComponent,
  ElementConnectComponent,
  ElementTreeFilterComponent,
  ElementOrganizationComponent,
  ElementUserFileComponent,
  ElementNavComponent,
  ElementChatComponent,
  ElementIframeComponent,
  ElementFaceMonitorComponent,
  ElementAssetTreeComponent,
  ElementConnectorKokoComponent,
  ElementConnectorMagnusComponent,
  ElementContentFooterComponent,
  ElementConnectorNecComponent,
  ElementConnectComponent,
  ElementDownloadDialogComponent,
  ElementReplayGuacamoleComponent,
  ElementSettingComponent,
  ElementConnectDialogComponent,
  ElementConnectorDefaultComponent,
  ElementContentViewComponent,
  ElementSelectAccountComponent,
  ElementReplayAsciicastComponent,
  ElementAdvancedOptionComponent,
  ElementConnectMethodComponent,
  ElementsReplayMp4Component,
  ElementConnectorGuideComponent,
  ElementCommandDialogComponent,
  ElementSendCommandDialogComponent,
  ElementSendCommandWithVariableDialogComponent,
  DynamicFormComponent,
  ElementsPartsComponent,
  ElementACLDialogComponent,
  ElementDialogAlertComponent,
  ElementTermComponent,
];
