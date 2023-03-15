import {LogService, LocalStorageService, UUIDService} from './share';
export {LogService, LocalStorageService, UUIDService} from './share';

import {AppService} from './app';
export {AppService} from './app';

import {HttpService} from './http';
export {HttpService} from './http';

import {NavService} from './nav';
export {NavService} from './nav';

import {TreeFilterService} from './treeFilter';
export {TreeFilterService} from './treeFilter';

import {SettingService} from './setting';
export {SettingService} from './setting';

import {ViewService} from './view';
export {ViewService} from './view';

import {OrganizationService} from './organization';
export {OrganizationService} from './organization';

import {I18nService} from './i18n';
export {I18nService};

import {DialogService} from '@app/elements/dialog/dialog.service';
export {DialogService};

import {ConnectTokenService} from '@app/services/connect-token';
export {ConnectTokenService};


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
];

