import { AppService } from './app';
import { NavService } from './nav';
import { I18nService } from './i18n';
import { HttpService } from './http';
import { ViewService } from './view';
import { SettingService } from './setting';
import { DrawerStateService } from './drawer';
import { FaceService } from '@app/services/face';
import { TreeFilterService } from './treeFilter';
import { OrganizationService } from './organization';
import { AlertService } from './dialog/alert.service';
import { ConnectTokenService } from './connect-token/';
import { LocalStorageService, LogService } from './share';
import { IframeCommunicationService } from './communication';

export { I18nService };
export { AlertService };
export { DrawerStateService };
export { ConnectTokenService };
export { IframeCommunicationService };
export { AppService } from './app';
export { NavService } from './nav';
export { HttpService } from './http';
export { ViewService } from './view';
export { SettingService } from './setting';
export { TreeFilterService } from './treeFilter';
export { OrganizationService } from './organization';
export { LogService, LocalStorageService } from './share';

export const AllServices = [
  LogService,
  AppService,
  NavService,
  FaceService,
  HttpService,
  ViewService,
  I18nService,
  AlertService,
  SettingService,
  TreeFilterService,
  DrawerStateService,
  LocalStorageService,
  OrganizationService,
  ConnectTokenService,
  IframeCommunicationService,
];
