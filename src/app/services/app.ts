import {Injectable} from '@angular/core';
import {Router} from '@angular/router';
import {CookieService} from 'ngx-cookie-service';
import {environment} from '@src/environments/environment';
import {DataStore, User} from '@app/globals';
import {HttpService} from './http';
import {LocalStorageService, LogService} from './share';
import {SettingService} from '@app/services/setting';
import {AuthInfo, ConnectData, TreeNode, Endpoint, View, Asset} from '@app/model';
import * as CryptoJS from 'crypto-js';
import {getCookie, setCookie} from '@app/utils/common';
import {OrganizationService} from './organization';

declare function unescape(s: string): string;

function gotoLogin() {
  const currentPath = encodeURI(document.location.pathname + document.location.search);
  window.location.href = document.location.origin + '/core/auth/login/?next=' + currentPath;
}

@Injectable()
export class AppService {
  // user:User = user  ;
  public lang: string;
  private protocolPreferConnectTypes: object = {};
  private assetPreferAccount: object = {};
  private protocolPreferKey = 'ProtocolPreferLoginType';
  private accountPreferKey = 'PreferAccount';
  private endpoints: Endpoint[] = [];
  private protocolConnectTypesMap: object = {};

  constructor(private _http: HttpService,
              private _router: Router,
              private _cookie: CookieService,
              private _logger: LogService,
              private _settingSvc: SettingService,
              private _localStorage: LocalStorageService,
              private _orgSvc: OrganizationService) {
    this.setLogLevel();
    this.checkLogin();
    this.loadPreferData();
    this.loadOriManualAuthInfo();
    this.getConnectMethods();
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

    // Connection connectToken 方式不用检查过期了
    const token = this.getQueryString('token');
    // Determine whether the user has logged in
    const sessionExpire = getCookie('jms_session_expire');
    if (!sessionExpire && !token) {
      gotoLogin();
      return;
    } else if (sessionExpire === 'close') {
      setInterval(() => {
        setCookie('jms_session_expire', sessionExpire, 120);
      }, 10 * 1000);
    }

    this._http.getUserProfile().subscribe(
      user => {
        this._orgSvc.setWorkbenchOrgs(user['workbench_orgs']);
        Object.assign(User, user);
        User.logined = true;
        this._localStorage.set('user', user.id);
      },
      err => {
        // this._logger.error(err);
        User.logined = false;
        if (!token) {
         gotoLogin();
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

  getConnectMethods() {
    const url = '/api/v1/terminal/components/connect-methods/';
    this._http.get(url).subscribe(response => {
      this.protocolConnectTypesMap = response;
    });
  }

  getProtocolConnectMethods(protocol: string) {
    return this.protocolConnectTypesMap[protocol] || [];
  }

  loadPreferData() {
    const protocolPreferData = this._localStorage.get(this.protocolPreferKey);
    if (protocolPreferData && typeof protocolPreferData === 'object') {
      this.protocolPreferConnectTypes = protocolPreferData;
    }
    const accountPreferData = this._localStorage.get(this.accountPreferKey);
    if (accountPreferData && typeof accountPreferData === 'object') {
      this.assetPreferAccount = accountPreferData;
    }
  }

  loadOriManualAuthInfo() {
    const manualAuthInfoKey = 'ManualAuthInfo';
    const authInfos = this._localStorage.get(manualAuthInfoKey);
    if (!authInfos) {
      return;
    }
    if (authInfos && typeof authInfos === 'object') {
      for (const [key, auths] of Object.entries(authInfos)) {
        const newKey = `JMS_MA_${key}`;
        this._localStorage.set(newKey, auths);
      }
    }
    this._localStorage.delete(manualAuthInfoKey);
  }

  getProtocolPreferLoginType(protocol: string): string {
    return this.protocolPreferConnectTypes[protocol];
  }

  setProtocolPreferLoginType(protocol: string, type: string) {
    this.protocolPreferConnectTypes[protocol] = type;
    this._localStorage.set(this.protocolPreferKey, this.protocolPreferConnectTypes);
  }

  getAssetPreferAccount(nodeId: string): string {
    return this.assetPreferAccount[nodeId];
  }


  setAssetPreferAccount(nodeId: string, accountId: string) {
    this.assetPreferAccount[nodeId] = accountId;

    try {
      this._localStorage.set(this.accountPreferKey, this.assetPreferAccount);
    } catch (e) {
      // pass
    }
  }

  encrypt(s) {
    const secretKey = `${User.id}_${User.username}`;
    try {
      return CryptoJS.AES.encrypt(s, secretKey).toString();
    } catch (err) {
      return '';
    }
  }

  decrypt(secret) {
    const secretKey = `${User.id}_${User.username}`;
    try {
      const bytes = CryptoJS.AES.decrypt(secret, secretKey);
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch (err) {
      return '';
    }
  }

  setPreLoginSelect(asset: Asset, outputData: ConnectData) {
    const tmp = JSON.parse(JSON.stringify(outputData)) as ConnectData;
    if (tmp.manualAuthInfo) {
      tmp.manualAuthInfo.secret = '';
    }
    if (tmp.account.actions) {
      tmp.account.actions = [];
    }
    const key = 'JMS_PL_' + asset.id;
    this._localStorage.set(key, tmp);
  }

  getPreLoginSelect(asset: Asset): ConnectData {
    const key = 'JMS_PL_' + asset.id;
    const connectData = this._localStorage.get(key) as ConnectData;
    if (!connectData || !connectData.manualAuthInfo) {
      return null;
    }
    if (connectData.account.has_secret) {
      return connectData;
    }
    // 获取手动的密码
    const manualAuth = connectData.manualAuthInfo;
    if (manualAuth.username) {
      const auths = this.getAccountLocalAuth(asset.id, connectData.account.id);
      const matched = auths.filter(item => item.username === manualAuth.username);
      if (matched.length === 1) {
        manualAuth.secret = matched[0].secret;
      }
    }
    return connectData;
  }

  delPreLoginSelect(id) {
    const key = 'JMS_PL_' + id;
    this._localStorage.delete(key);
  }

  getAccountLocalAuth(assetId: string, accountUsername: string, decrypt= true): AuthInfo[] {
    const localKey = `JMS_MA_${accountUsername}_${assetId}`;
    let auths = this._localStorage.get(localKey);

    if (!auths) {
      return [];
    }
    if (!Array.isArray(auths)) {
      auths = [auths];
    }
    if (!decrypt) {
      return auths;
    }

    const newAuths: AuthInfo[] = [];
    for (const auth of auths) {
      const newAuth = Object.assign({}, auth);
      newAuth.password = this.decrypt(newAuth.password);
      newAuths.push(newAuth);
    }
    return newAuths;
  }

  saveAssetAccountAuth(assetId: string, accountId: string, auth: AuthInfo) {
    const newAuth = Object.assign({}, auth);
    if (!auth.secret) {
      auth.secret = '';
    } else {
      newAuth.secret = this.encrypt(auth.secret);
    }

    let auths = this.getAccountLocalAuth(assetId, accountId, false);
    const localKey = `JMS_MA_${accountId}_${assetId}`;

    auths = auths.filter((item) => item.username !== newAuth.username);
    auths.splice(0, 0, newAuth);
    this._localStorage.set(localKey, auths);
  }

  getSmartEndpoint(view: View): Promise<Endpoint> {
    let protocol = view.protocol;
    if (protocol === 'http') {
      protocol = window.location.protocol.replace(':', '');
    }
    const data = { 'assetId': '', 'sessionId': '', 'token': '' };
    if (view.connectToken) {
      data['token'] = view.connectToken.id;
    } else {
      data['assetId'] = view.asset.id;
    }
    return this._http.getSmartEndpoint(data, protocol);
  }
}
