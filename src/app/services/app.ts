import {Injectable, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {CookieService} from 'ngx-cookie-service';
import {environment} from '@src/environments/environment';
import {DataStore, User, ProtocolConnectTypes, TYPE_RDP_CLIENT, TYPE_RDP_FILE, TYPE_DB_CLIENT, TYPE_WEB_CLI, TYPE_SSH_CLIENT} from '@app/globals';
import {HttpService} from './http';
import {LocalStorageService, LogService} from './share';
import {SettingService} from '@app/services/setting';
import {AuthInfo, ConnectData, SystemUser, TreeNode, Endpoint, Protocol, View} from '@app/model';
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
  private assetPreferSystemUser: object = {};
  private protocolPreferKey = 'ProtocolPreferLoginType';
  private systemUserPreferKey = 'PreferSystemUser';
  private endpoints: Endpoint[] = [];

  constructor(private _http: HttpService,
              private _router: Router,
              private _cookie: CookieService,
              private _logger: LogService,
              private _settingSvc: SettingService,
              private _localStorage: LocalStorageService,
              private _organizationSvc: OrganizationService) {
    this.setLogLevel();
    this.checkLogin();
    this.loadPreferData();
    this.loadOriManualAuthInfo();
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

    // Determine whether the user has logged in
    const sessionExpire = getCookie('jms_session_expire');
    if (!sessionExpire) {
      gotoLogin();
      return;
    } else if (sessionExpire === 'close') {
      setInterval(() => {
        setCookie('jms_session_expire', sessionExpire, 120);
      }, 10 * 1000);
    }

    this._http.getUserProfile().subscribe(
      user => {
        this._organizationSvc.user.emit(user);
        Object.assign(User, user);
        User.logined = true;
        this._localStorage.set('user', user.id);
      },
      err => {
        // this._logger.error(err);
        User.logined = false;
        const token = this.getQueryString('token');
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

  getProtocolConnectTypes(remoteApp: Boolean) {
    const xpackEnabled = this._settingSvc.globalSetting.XPACK_LICENSE_IS_VALID;
    const razorEnabled = this._settingSvc.globalSetting.TERMINAL_RAZOR_ENABLED;
    const magnusEnabled = this._settingSvc.globalSetting.TERMINAL_MAGNUS_ENABLED;
    const sshClientEnabled = this._settingSvc.globalSetting.TERMINAL_KOKO_SSH_ENABLED;
    const validTypes = {};
    for (const [protocol, types] of Object.entries(ProtocolConnectTypes)) {
      validTypes[protocol] = types.filter((tp) => {
        // 没开启 xpack
        if (tp.requireXPack && !xpackEnabled) {
          return false;
        }
        // 没有开启 razor 不支持 连接 razor
        if ([TYPE_RDP_CLIENT.id, TYPE_RDP_FILE.id].indexOf(tp.id) > -1 && !razorEnabled) {
          return false;
        }
        if (tp.id === TYPE_DB_CLIENT.id && !magnusEnabled) {
          return false;
        }
        if (tp.id === TYPE_SSH_CLIENT.id && !sshClientEnabled) {
          return false;
        }
        return true;
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

  getNodePreferSystemUser(nodeId: string): string {
    return this.assetPreferSystemUser[nodeId];
  }

  // 根据当前节点信息判断是不是k8s类型，解析id格式
  getNodeTypeID(node: TreeNode): string {
    let nodeID = node.id || '';
    const nodeType = node.meta.data.type || '';
    if (nodeType === 'k8s') {
      const curAppID = nodeID.split('&')[0] || '';
      nodeID = curAppID.substr(curAppID.lastIndexOf('=') + 1) || '';
    }
    return nodeID;
  }

  setNodePreferSystemUser(nodeId: string, systemUserId: string) {
    this.assetPreferSystemUser[nodeId] = systemUserId;

    try {
      this._localStorage.set(this.systemUserPreferKey, this.assetPreferSystemUser);
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

  setPreLoginSelect(node: TreeNode, outputData: ConnectData) {
    const tmp = JSON.parse(JSON.stringify(outputData)) as ConnectData;
    if (tmp.manualAuthInfo) {
      tmp.manualAuthInfo.password = '';
    }
    if (tmp.systemUser.actions) {
      tmp.systemUser.actions = [];
    }
    const key = 'JMS_PL_' + node.id;
    this._localStorage.set(key, tmp);
  }

  getPreLoginSelect(node: TreeNode): ConnectData {
    const key = 'JMS_PL_' + node.id;
    const connectData = this._localStorage.get(key) as ConnectData;
    if (!connectData || !connectData.manualAuthInfo) {
      return null;
    }
    if (connectData.systemUser.login_mode !== 'manual') {
      return connectData;
    }
    // 获取手动的密码
    const manualAuth = connectData.manualAuthInfo;
    if (manualAuth.username) {
      const auths = this.getNodeSystemUserAuth(node.id, connectData.systemUser.id);
      const matched = auths.filter(item => item.username === manualAuth.username);
      if (matched.length === 1) {
        manualAuth.password = matched[0].password;
      }
    }
    return connectData;
  }

  delPreLoginSelect(node: TreeNode) {
    const key = 'JMS_PL_' + node.id;
    this._localStorage.delete(key);
  }

  getNodeSystemUserAuth(nodeId: string, systemUserId: string, decrypt= true): AuthInfo[] {
    const localKey = `JMS_MA_${systemUserId}_${nodeId}`;
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

  saveNodeSystemUserAuth(nodeId: string, systemUserId: string, auth: AuthInfo) {
    const newAuth = Object.assign({}, auth);
    if (!auth.password) {
      auth.password = '';
    } else {
      newAuth.password = this.encrypt(auth.password);
    }

    let auths = this.getNodeSystemUserAuth(nodeId, systemUserId, false);
    const localKey = `JMS_MA_${systemUserId}_${nodeId}`;

    auths = auths.filter((item) => item.username !== newAuth.username);
    auths.splice(0, 0, newAuth);
    this._localStorage.set(localKey, auths);
  }

  analysisId(idStr) {
    const idObject = {};
    idStr = idStr.split('&');
    for (let i = 0; i < idStr.length; i++) {
      idObject[idStr[i].split('=')[0]] = (idStr[i].split('=')[1]);
    }
    return idObject;
  }

  getSmartEndpoint(view: View): Promise<Endpoint> {
    let protocol = (view.connectType && view.connectType.protocol);
    if (protocol === TYPE_DB_CLIENT.protocol) {
      protocol = view.protocol;
    } else if (protocol === TYPE_WEB_CLI.protocol) {
      protocol = window.location.protocol.replace(':', '');
    }
    const data = { 'assetId': '', 'appId': '', 'sessionId': '', 'token': '' };
    if (view.token) {
      data['token'] = view.token;
    } else if (view.node.meta.type === 'application') {
      if (view.node.meta.data.type === 'k8s') {
        data['appId'] = this.analysisId(view.node.id)['app_id'];
      } else {
        data['appId'] = view.node.id;
      }
    } else {
      data['assetId'] = view.node.id;
    }
    return this._http.getSmartEndpoint(data, protocol);
  }
}
