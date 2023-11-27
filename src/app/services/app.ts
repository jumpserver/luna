import {Injectable} from '@angular/core';
import {Router} from '@angular/router';
import {CookieService} from 'ngx-cookie-service';
import {environment} from '@src/environments/environment';
import {DataStore, User} from '@app/globals';
import {HttpService} from './http';
import {LocalStorageService, LogService} from './share';
import {SettingService} from '@app/services/setting';
import {Account, Asset, AuthInfo, ConnectData, Endpoint, Organization, View} from '@app/model';
import * as CryptoJS from 'crypto-js';
import {getCookie, setCookie} from '@app/utils/common';
import {OrganizationService} from './organization';
import {I18nService} from '@app/services/i18n';

declare function unescape(s: string): string;

function gotoLogin() {
  const currentPath = encodeURI(document.location.pathname + document.location.search);
  setTimeout(() => {
    window.location.href = document.location.origin + '/core/auth/login/?next=' + currentPath;
  }, 500);
}

@Injectable()
export class AppService {
  // user:User = user  ;
  public lang: string;
  public connectDialogShown = false;
  private protocolPreferConnectTypes: object = {};
  private assetPreferAccount: object = {};
  private protocolPreferKey = 'ProtocolPreferLoginType';
  private accountPreferKey = 'PreferAccount';
  private protocolConnectTypesMap: object = {};
  private checkIntervalId: number;
  private newLoginHasOpen = false; // 避免多次打开新登录页
  private isCheckingProfile = false; // 是否在检查中

  constructor(private _http: HttpService,
              private _router: Router,
              private _cookie: CookieService,
              private _i18n: I18nService,
              private _logger: LogService,
              private _settingSvc: SettingService,
              private _localStorage: LocalStorageService,
              private _orgSvc: OrganizationService) {
    this.setLogLevel();
    this.setOrgFromQueryString();
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

  setOrgFromQueryString() {
    const oid = this.getQueryString('oid');
    if (oid) {
      const currentOrg: Organization = {id: oid, name: ''};
      this._orgSvc.switchOrg(currentOrg);
    }
  }

  doCheckProfile() {
    if (this.isCheckingProfile) {
      return;
    }
    this.isCheckingProfile = true;
    User.logined = false;
    this._http.get(`/api/v1/users/profile/?fields_size=mini`).subscribe(
      (res) => {
        User.logined = true;
        this.newLoginHasOpen = false;
        this.isCheckingProfile = false;
      },
      (err) => {
        const ok = confirm(this._i18n.instant('LoginExpireMsg'));
        if (ok && !this.newLoginHasOpen) {
          window.open('/core/auth/login/?next=/luna/');
          this.newLoginHasOpen = true;
        }
        this.isCheckingProfile = false;
        setTimeout(() => {
          this.doCheckProfile();
        }, 5000);
      },
    );
  }

  intervalCheckLogin(second: number = 60 * 2, clear: boolean = false) {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
    }
    this.checkIntervalId = setInterval(() => {
      this.doCheckProfile();
    }, second * 1000);
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
      setCookie('jms_session_expire', 'close', 120);
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
        this.intervalCheckLogin();
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

  setPreConnectData(asset: Asset, connectData: ConnectData) {
    const {account, protocol, connectMethod, manualAuthInfo, connectOption} = connectData;
    const key = `JMS_PRE_${asset.id}`;

    const saveData = {
      account: {alias: account.alias, username: account.username, has_secret: account.has_secret},
      connectMethod: {value: connectMethod.value},
      protocol: {name: protocol.name},
      downloadRDP: connectData.downloadRDP,
      autoLogin: connectData.autoLogin,
      connectOption,
    };
    this.setAccountLocalAuth(asset, account, manualAuthInfo);
    this._localStorage.set(key, saveData);
  }

  getPreConnectData(asset: Asset): ConnectData {
    const key = `JMS_PRE_${asset.id}`;
    const connectData = this._localStorage.get(key) as ConnectData;
    if (!connectData) {
      return null;
    }
    connectData.manualAuthInfo = new AuthInfo();
    if (connectData.account.has_secret) {
      return connectData;
    }
    if (connectData.account) {
      const auths = this.getAccountLocalAuth(asset.id);
      const matched = auths.find(item => item.alias === connectData.account.alias);
      if (matched) {
        connectData.manualAuthInfo = matched;
      }
    }
    return connectData;
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

  disableAutoConnect(assetId) {
    const key = 'JMS_PRE_' + assetId;
    const connectData = this._localStorage.get(key);
    if (connectData) {
      connectData.autoLogin = false;
      this._localStorage.set(key, connectData);
    }
  }

  getAccountLocalAuth(assetId: string, decrypt = true): AuthInfo[] {
    const localKey = `JMS_MA_${assetId}`;
    const auths = this._localStorage.get(localKey);

    if (!auths || !Array.isArray(auths)) {
      return [];
    }
    if (!decrypt) {
      return auths;
    }

    const newAuths: AuthInfo[] = [];
    for (const auth of auths) {
      const newAuth = Object.assign({}, auth);
      newAuth.secret = this.decrypt(newAuth.secret);
      newAuths.push(newAuth);
    }
    return newAuths;
  }

  setAccountLocalAuth(asset: Asset, account: Account, auth: AuthInfo) {
    const assetId = asset.id;
    const newAuth = Object.assign({alias: account.alias, username: account.username}, auth);
    if (!auth.secret || !auth.rememberAuth) {
      newAuth.secret = '';
    } else {
      newAuth.secret = this.encrypt(auth.secret);
    }

    let auths = this.getAccountLocalAuth(assetId, false);
    const localKey = `JMS_MA_${assetId}`;

    auths = auths.filter((item) => item.username !== newAuth.username);
    auths.splice(0, 0, newAuth);
    this._localStorage.set(localKey, auths);
  }

  getSmartEndpoint(view: View): Promise<Endpoint> {
    let protocol = view.connectMethod.endpoint_protocol || view.protocol;
    if (protocol === 'http') {
      protocol = window.location.protocol.replace(':', '');
    }
    const data = {'assetId': '', 'sessionId': '', 'token': ''};
    if (view.connectToken) {
      data['token'] = view.connectToken.id;
    } else {
      data['assetId'] = view.asset.id;
    }
    if (view.connectMethod && view.connectMethod.type === 'applet') {
      if (view.connectOption && view.connectOption['appletConnectMethod'] === 'client') {
        protocol = 'rdp';
      } else {
        protocol = 'http';
      }
    }
    const res = this._http.getSmartEndpoint(data, protocol);
    res.catch((err) => {
      alert(err.error.detail);
    });
    return res;
  }
}
