import {Injectable, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {CookieService} from 'ngx-cookie-service';
import {environment} from '@src/environments/environment';
import {DataStore, User, ProtocolConnectTypes, TYPE_RDP_CLIENT, TYPE_RDP_FILE} from '@app/globals';
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
    this.checkLogin();
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
  checkLogin() {
    this._logger.debug('Check user auth');
    if (!DataStore.Path) {
      this._router.navigate(['FOF']);
    }

    if (User.logined) {
      if (document.location.pathname === '/login/') {
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
        this._localStorage.set('user', user.id);
      },
      err => {
        // this._logger.error(err);
        User.logined = false;
        const currentPath = encodeURI(document.location.pathname + document.location.search);
        const token = this.getQueryString('token');
        if (!token) {
          window.location.href = document.location.origin + '/core/auth/login/?next=' + currentPath;
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
    const xrdpEnabled = this._settingSvc.globalSetting.XRDP_ENABLED;
    const validTypes = {};
    for (const [protocol, types] of Object.entries(ProtocolConnectTypes)) {
      validTypes[protocol] = types.filter((tp) => {
        if (protocol === 'rdp' && remoteApp && tp.id === TYPE_RDP_CLIENT.id ) {
          return false;
        }
        if (xrdpEnabled === false && [TYPE_RDP_CLIENT.id, TYPE_RDP_FILE.id].indexOf(tp.id) > -1) {
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

  getAssetSystemUserAuth(nodeId: string, systemUserId: string): AuthInfo[] {
    const localKey = `${systemUserId}_${nodeId}`;
    let auths = this.manualAuthInfos[localKey];
    if (!auths) {
      return [];
    }
    if (!Array.isArray(auths)) {
      auths = [auths];
    }

    const newAuths: AuthInfo[] = [];
    for (const auth of auths) {
      const newAuth = Object.assign({}, auth);
      const secretKey = `${User.id}_${User.username}`;
      try {
        const bytes = CryptoJS.AES.decrypt(newAuth.password, secretKey);
        newAuth.password = bytes.toString(CryptoJS.enc.Utf8);
      } catch (err) {
        newAuth.password = '';
      }
      newAuths.push(newAuth);
    }
    return newAuths;
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
    let auths = this.manualAuthInfos[localKey];
    if (!auths) {
      auths = [];
    } else if (!Array.isArray(auths)) {
      auths = [auths];
    }

    auths = auths.filter((item) => item.username !== newAuth.username);
    auths.splice(0, 0, newAuth);

    this.manualAuthInfos[localKey] = auths;
    try {
      this._localStorage.set(this.manualAuthInfoKey, this.manualAuthInfos);
    } catch (e) {
      this._logger.error('Error: ', e);
      // pass
    }
  }
}
