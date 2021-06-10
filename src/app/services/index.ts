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

import {I18nService} from './i18n';
export {I18nService};

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
  I18nService
];

