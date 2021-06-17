import {Injectable, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {CookieService} from 'ngx-cookie-service';
import {environment} from '@src/environments/environment';
import {DataStore, User, ProtocolConnectTypes, TYPE_RDP_CLIENT} from '@app/globals';
import {HttpService} from './http';
import {LocalStorageService, LogService} from './share';
import {SettingService} from '@app/services/setting';
import {AuthInfo} from '@app/model';
import * as CryptoJS from 'crypto-js';

declare function unescape(s: string): string;

@Injectable()
export class AppService {
  // user:User = user  ;
  public lang: string;
  private protocolPreferConnectTypes: object = {};
  private assetPreferSystemUser: object = {};
  private protocolPreferKey = 'ProtocolPreferLoginType';
  private systemUserPreferKey = 'PreferSystemUser';
  private manualAuthInfoKey = 'ManualAuthInfo';
  private manualAuthInfos: object = {};

  constructor(private _http: HttpService,
              private _router: Router,
              private _cookie: CookieService,
              private _logger: LogService,
              private _settingSvc: SettingService,
              private _localStorage: LocalStorageService) {
    this.setLogLevel();
    this.checklogin();
    this.loadPreferData();
    this.loadManualAuthInfo();
  }

  setLogLevel() {
    // 设置logger level
    let logLevel = this._cookie.get('logLevel');
    if (!logLevel) {
        logLevel = environment.production ? '1' : '5';
    }
    this._logger.level = parseInt(logLevel, 10);
  }
  checklogin() {
    this._logger.debug('Check user auth');
    if (!DataStore.Path) {
      this._router.navigate(['FOF']);
    }

    if (User.logined) {
      if (document.location.pathname === '/login') {
        this._router.navigate(['']);
      } else {
        this._router.navigate([document.location.pathname]);
      }
      return;
    }
    this._http.getUserProfile().subscribe(
      user => {
        Object.assign(User, user);
        User.logined = true;
        const oldUserId = this._localStorage.get('user');
        if (oldUserId !== user.id ) {
          this._localStorage.set('guacamoleToken', null);
        }
        this._localStorage.set('user', user.id);
      },
      err => {
        // this._logger.error(err);
        User.logined = false;
        if (document.location.pathname !== '/luna/connect') {
          window.location.href = document.location.origin + '/core/auth/login/?next=' +
            encodeURI(document.location.pathname + document.location.search);
        }
        // this._router.navigate(['login']);
      },
    );
  }

  browser() {
    this._http.reportBrowser();
  }

  getQueryString(name) {
    const reg = new RegExp('(^|&)' + name + '=([^&]*)(&|$)', 'i');
    const r = window.location.search.substr(1).match(reg);
    if (r != null) {
      return unescape(r[2]);
    }
    return null;
  }

  getProtocolConnectTypes(remoteApp: Boolean) {
    const xpackEnabled = this._settingSvc.globalSetting.XPACK_LICENSE_IS_VALID;
    const validTypes = {};
    for (const [protocol, types] of Object.entries(ProtocolConnectTypes)) {
      validTypes[protocol] = types.filter((tp) => {
        if (protocol === 'rdp' && remoteApp && tp.id === TYPE_RDP_CLIENT.id ) {
          return false;
        }
        if (!xpackEnabled && tp.requireXPack) {
          return false;
        } else {
          return true;
        }
      });
    }
    return validTypes;
  }

  loadPreferData() {
    const protocolPreferData = this._localStorage.get(this.protocolPreferKey);
    if (protocolPreferData && typeof protocolPreferData === 'object') {
      this.protocolPreferConnectTypes = protocolPreferData;
    }

    const systemUserPreferData = this._localStorage.get(this.systemUserPreferKey);
    if (systemUserPreferData && typeof systemUserPreferData === 'object') {
      this.assetPreferSystemUser = systemUserPreferData;
    }
  }

  getProtocolPreferLoginType(protocol: string): string {
    return this.protocolPreferConnectTypes[protocol];
  }

  setProtocolPreferLoginType(protocol: string, type: string) {
    this.protocolPreferConnectTypes[protocol] = type;
    try {
      this._localStorage.set(this.protocolPreferKey, this.protocolPreferConnectTypes);
    } catch (e) {
      // pass
    }
  }

  getNodePreferSystemUser(nodeId: string): string {
    return this.assetPreferSystemUser[nodeId];
  }

  setNodePreferSystemUser(nodeId: string, systemUserId: string) {
    this.assetPreferSystemUser[nodeId] = systemUserId;
    try {
      this._localStorage.set(this.systemUserPreferKey, this.assetPreferSystemUser);
    } catch (e) {
      // pass
    }
  }

  loadManualAuthInfo() {
    const authInfos = this._localStorage.get(this.manualAuthInfoKey);
    if (authInfos && typeof authInfos === 'object') {
      this.manualAuthInfos = authInfos;
    }
  }

  getAssetSystemUserAuth(nodeId: string, systemUserId: string): AuthInfo {
    const localKey = `${systemUserId}_${nodeId}`;
    const auth = this.manualAuthInfos[localKey];
    if (!auth) {
      return null;
    }
    const newAuth = Object.assign({}, auth);
    const secretKey = `${User.id}_${User.username}`;
    try {
      const bytes = CryptoJS.AES.decrypt(newAuth.password, secretKey);
      newAuth.password = bytes.toString(CryptoJS.enc.Utf8);
    } catch (err) {
      newAuth.password = '';
    }
    return newAuth;
  }

  saveNodeSystemUserAuth(nodeId: string, systemUserId: string, auth: AuthInfo) {
    const newAuth = Object.assign({}, auth);
    if (!auth.password) {
      auth.password = '';
    } else {
      const secretKey = `${User.id}_${User.username}`;
      newAuth.password = CryptoJS.AES.encrypt(auth.password, secretKey).toString();
    }
    const localKey = `${systemUserId}_${nodeId}`;
    this.manualAuthInfos[localKey] = newAuth;
    try {
      this._localStorage.set(this.manualAuthInfoKey, this.manualAuthInfos);
    } catch (e) {
      this._logger.error('Error: ', e);
      // pass
    }
  }
}
