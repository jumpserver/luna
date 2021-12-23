import {Component, OnInit, Output, OnDestroy, EventEmitter} from '@angular/core';
import 'rxjs/add/operator/toPromise';
import {connectEvt, TYPE_RDP_CLIENT, TYPE_WEB_CLI, TYPE_RDP_FILE, TYPE_WEB_GUI, TYPE_DB_GUI} from '@app/globals';
import {AppService, HttpService, I18nService, LogService, SettingService} from '@app/services';
import {MatDialog} from '@angular/material';
import {SystemUser, TreeNode, ConnectData} from '@app/model';
import {View} from '@app/model';
import {ElementConnectDialogComponent} from './connect-dialog/connect-dialog.component';
import {launchLocalApp} from '@app/utils/common';


@Component({
  selector: 'elements-connect',
  templateUrl: './connect.component.html',
})
export class ElementConnectComponent implements OnInit, OnDestroy {
  @Output() onNewView: EventEmitter<View> = new EventEmitter<View>();

  hasLoginTo = false;

  constructor(private _appSvc: AppService,
              private _dialog: MatDialog,
              private _logger: LogService,
              private _settingSvc: SettingService,
              private _http: HttpService,
              private _i18n: I18nService,
  ) {
  }

  ngOnInit(): void {
    this.keepSubscribeConnectEvent();
    this.connectDirectIfNeed();
    this.connectTokenIfNeed();
  }

  connectTokenIfNeed() {
    const token = this._appSvc.getQueryString('token');
    if (!token) {
      return;
    }
    const system = this._appSvc.getQueryString('system');
    const type = this._appSvc.getQueryString('type') || 'asset';
    let protocol = this._appSvc.getQueryString('protocol') || 'ssh';

    if (system) {
      switch (system) {
        case 'linux':
          protocol = 'ssh';
          break;
        case 'window':
        case 'windows':
          protocol = 'rdp';
          break;
      }
    }
    const node = new TreeNode();
    node.name = 'Token';
    const view = new View(node, null, 'token', type, protocol);
    view.token = token;

    switch (protocol) {
      case 'mysql':
      case 'sqlserver':
      case 'oracle':
      case 'postgresql':
      case 'mariadb':
        if (this._settingSvc.hasXPack()) {
          view.connectType = TYPE_DB_GUI;
        } else {
          view.connectType = TYPE_WEB_GUI;
        }
        break;
      case 'rdp':
      case 'vnc':
        view.connectType = TYPE_WEB_GUI;
        break;
      default:
        view.connectType = TYPE_WEB_CLI;
    }
    this.onNewView.emit(view);
  }

  connectDirectIfNeed() {
    let loginTo = this._appSvc.getQueryString('login_to');
    let tp = this._appSvc.getQueryString('type') || 'asset';
    const assetId = this._appSvc.getQueryString('asset');
    const remoteAppId = this._appSvc.getQueryString('remote_app');
    const databaseAppId = this._appSvc.getQueryString('database_app');
    const k8sId = this._appSvc.getQueryString('k8s_app');

    if (tp !== 'asset') {
      tp = 'application';
    }
    if (assetId) {
      loginTo = assetId;
    } else if (remoteAppId) {
      loginTo = remoteAppId;
    } else if (databaseAppId) {
      loginTo = databaseAppId;
    } else if (k8sId) {
      loginTo = k8sId;
    }
    if (this.hasLoginTo || !loginTo) {
      return;
    }
    const getTreeNodeHandlerMapper = {
      asset: 'filterMyGrantedAssetsById',
      application: 'getMyGrantedAppNodesDetail',
    };

    const handlerName = getTreeNodeHandlerMapper[tp];
    if (!handlerName) {
      alert('未知的类型: ' + tp);
      return;
    }
    this.hasLoginTo = true;
    this._http[handlerName](loginTo).subscribe(nodes => {
      let node;
      if (nodes.length === 1) {
        node = nodes[0];
      } else {
        node = nodes[1];
      }
      this.connectNode(node).then();
    });
  }

  keepSubscribeConnectEvent() {
    connectEvt.asObservable().subscribe(evt => {
      switch (evt.action) {
        case 'sftp': {
          this.connectFileManager(evt.node);
          break;
        }
        case 'connect': {
          this._appSvc.delPreLoginSelect(evt.node);
          this.connectNode(evt.node).then();
          break;
        }
        default: {
          this.connectNode(evt.node).then();
        }
      }
    });
  }

  ngOnDestroy(): void {
    connectEvt.unsubscribe();
  }

  async connectNode(node) {
    if (!node) {
      return;
    }
    const tp = node.meta.type;
    const grantedSystemUsersHandlerMapper = {
      asset: 'getMyAssetSystemUsers',
      application: 'getMyAppSystemUsers',
    };
    const handleName = grantedSystemUsersHandlerMapper[tp];
    if (!handleName) {
      alert('未知的类型: ' + tp);
      return;
    }
    const systemUsers = await this._http[handleName](node.id).toPromise();
    const connectInfo = await this.selectLoginSystemUsers(systemUsers, node);
    if (!connectInfo) {
      this._logger.info('Just close the dialog');
      return;
    }
    await this.createTempAuthIfNeed(node, connectInfo);
    this._logger.debug('Connect info: ', connectInfo);
    if (connectInfo.connectType.id === TYPE_RDP_CLIENT.id) {
      this.callLocalClient(connectInfo, node).then();
    } else if (connectInfo.connectType.id === TYPE_RDP_FILE.id) {
      this.downloadRDPFile(connectInfo, node).then();
    } else {
      this.createNodeView(connectInfo, node);
    }
  }

  async downloadRDPFile(connectInfo: ConnectData, node: TreeNode) {
    const { systemUser } = connectInfo;
    const data = { systemUserId: systemUser.id, appId: '', assetId: '' };
    if (node.meta.type === 'application' && node.meta.data.category === 'remote_app') {
      data['appId'] = node.id;
    } else {
      data['assetId'] = node.id;
    }
    await this._http.downloadRDPFile(data, this._settingSvc.setting);
  }

  async callLocalClient(connectInfo: ConnectData, node: TreeNode) {
    this._logger.debug('Call local client');
    const { systemUser } = connectInfo;
    const data = { systemUserId: systemUser.id, appId: '', assetId: '' };
    if (node.meta.type === 'application' && node.meta.data.category === 'remote_app') {
      data['appId'] = node.id;
    } else {
      data['assetId'] = node.id;
    }
    const response = await this._http.getRDPClientUrl(data, this._settingSvc.setting);
    const url = response['url'];
    launchLocalApp(url, () => {
      const downLoadStatus = localStorage.getItem('hasDownLoadApp');
      if (!downLoadStatus) {
        const msg = this._i18n.instant('InstallClientMsg');
        if (window.confirm(msg)) {
          window.open('/core/download/', '_blank');
          localStorage.setItem('hasDownLoadApp', '1');
        }
      }
    });
  }

  createNodeView(connectInfo: ConnectData, node: TreeNode) {
    const {systemUser} = connectInfo;
    const view = new View(node, systemUser, 'node', node.meta.type, systemUser.protocol);
    view.connectType = connectInfo.connectType;
    this.onNewView.emit(view);
  }

  validatePreConnectData(node: TreeNode, systemUsers: SystemUser[], preData: ConnectData): Boolean {
    if (!preData || !preData.systemUser || preData.node) {
      this._logger.debug('No system user or node');
      return false;
    }
    // 验证系统用户是否有效
    const preSystemUser = preData.systemUser;
    const inSystemUsers = systemUsers.filter(item => {
      return item.id === preSystemUser.id;
    });
    if (inSystemUsers.length !== 1) {
      this._logger.debug('System user may be not valid');
      return false;
    }
    // 验证登录
    const systemUser = inSystemUsers[0];
    const preAuth = preData.manualAuthInfo;
    if (systemUser['login_mode'] === 'manual' && !preAuth.password) {
      this._logger.debug('System user no manual auth');
      return false;
    }
    // 验证连接方式
    const isRemoteApp = node.meta.type === 'application';
    const connectTypes = this._appSvc.getProtocolConnectTypes(isRemoteApp)[systemUser.protocol];
    if (!connectTypes) {
      this._logger.debug('No matched connect types');
      return false;
    }
    const inConnectType = connectTypes.filter(item => {
      return item.id === preData.connectType.id;
    });
    if (inConnectType.length !== 1) {
      this._logger.error('No matched connect type, may be changed');
      return false;
    }
    return true;
  }

  getConnectData(systemUserMaxPriority: SystemUser[], node: TreeNode): Promise<ConnectData> {
    const preConnectData = this._appSvc.getPreLoginSelect(node);
    const isValid = this.validatePreConnectData(node, systemUserMaxPriority, preConnectData);
    if (isValid) {
      return new Promise<ConnectData>(resolve => {
        resolve(preConnectData);
      });
    }

    const dialogRef = this._dialog.open(ElementConnectDialogComponent, {
      minHeight: '300px',
      height: 'auto',
      width: '500px',
      disableClose: true,
      data: {systemUsers: systemUserMaxPriority, node: node}
    });

    return new Promise<ConnectData>(resolve => {
      dialogRef.afterClosed().subscribe(outputData  => {
        resolve(outputData);
      });
    });
  }

  selectLoginSystemUsers(systemUsers: Array<SystemUser>, node: TreeNode): Promise<ConnectData> {
    let systemUserMaxPriority = this.filterHighestPrioritySystemUsers(systemUsers);
    const systemUserId = this._appSvc.getQueryString('system_user');
    if (systemUserId) {
      systemUserMaxPriority = systemUserMaxPriority.filter(s => {
        s.id = systemUserId;
      });
    }
    if (systemUserMaxPriority.length === 0) {
      alert('没有系统用户');
      return new Promise<ConnectData>((resolve, reject) => {
        reject('没有系统用户');
      });
    } else if (systemUserMaxPriority.length > 1) {
      return this.getConnectData(systemUserMaxPriority, node);
    }
    // 系统用户等于 1 个的情况
    const systemUser = systemUserMaxPriority[0];
    const isRemoteApp = node.meta.type === 'application';
    const connectTypes = this._appSvc.getProtocolConnectTypes(isRemoteApp)[systemUser.protocol];
    if (!connectTypes) {
      alert('没有匹配的连接方式');
      return new Promise<ConnectData>((resolve, reject) => {
        reject('没有匹配的连接方式');
      });
    }
    let connectType = null;
    if (connectTypes && connectTypes.length === 1) {
      connectType = connectTypes[0];
    }
    if (systemUser && connectType && systemUser.login_mode === 'auto') {
      return new Promise<ConnectData>(resolve => {
        const outputData = new ConnectData();
        outputData.systemUser = systemUser;
        outputData.connectType = connectType;
        resolve(outputData);
      });
    } else {
      return this.getConnectData(systemUserMaxPriority, node);
    }
  }

  createTempAuthIfNeed(node: TreeNode, outputData: ConnectData) {
    const auth = outputData.manualAuthInfo;
    if (!auth) {
      return;
    }
    if (auth.password) {
      return this._http.createSystemUserTempAuth(outputData.systemUser, node, auth);
    }
  }

  connectFileManager(node: TreeNode) {
    const view = new View(node, null, 'fileManager', 'asset', 'sftp');
    view.nick = '[FILE] ' + node.name;
    this.onNewView.emit(view);
  }

  filterHighestPrioritySystemUsers(sysUsers: Array<SystemUser>): Array<SystemUser> {
    const priorityAll: Array<number> = sysUsers.map(s => s.priority);
    const HighestPriority = Math.min(...priorityAll);
    return sysUsers.filter(s => s.priority === HighestPriority);
  }
}
