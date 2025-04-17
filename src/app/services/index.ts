import {LocalStorageService, LogService, UUIDService} from './share';
import {AppService} from './app';
import {HttpService} from './http';
import {NavService} from './nav';
import {TreeFilterService} from './treeFilter';
import {SettingService} from './setting';
import {ViewService} from './view';
import {OrganizationService} from './organization';
import {I18nService} from './i18n';
import {DialogService} from './dialog/dialog.service';
import {ConnectTokenService} from './connect-token/';
import {FaceService} from '@app/services/face';
import {IframeCommunicationService} from './communication';

export {LogService, LocalStorageService, UUIDService} from './share';

export {AppService} from './app';

export {HttpService} from './http';

export {NavService} from './nav';

export {TreeFilterService} from './treeFilter';

export {SettingService} from './setting';

export {ViewService} from './view';

export {OrganizationService} from './organization';

export {I18nService};

export {DialogService};

export {ConnectTokenService};

export {IframeCommunicationService};


export const AllServices = [
  LogService,
  LocalStorageService,
  UUIDService,
  AppService,
  HttpService,
  NavService,
  TreeFilterService,
  SettingService,
  ViewService,
  OrganizationService,
  I18nService,
  DialogService,
  ConnectTokenService,
  FaceService,
  IframeCommunicationService
];

