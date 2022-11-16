import {Component, OnInit, Output, OnDestroy, EventEmitter} from '@angular/core';
import 'rxjs/add/operator/toPromise';
import {connectEvt, TYPE_WEB_CLI, TYPE_RDP_FILE, TYPE_WEB_GUI, TYPE_DB_GUI, TYPE_WEB_SFTP} from '@app/globals';
import {AppService, HttpService, I18nService, LogService, SettingService} from '@app/services';
import {MatDialog} from '@angular/material';
import {Account, TreeNode, ConnectData} from '@app/model';
import {View} from '@app/model';
import {ElementConnectDialogComponent} from './connect-dialog/connect-dialog.component';
import {ElementDownloadDialogComponent} from './download-dialog/download-dialog.component';
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

  analysisId(idStr) {
    const idObj = new Object();
    idStr = idStr.split('&');
    for (let i = 0; i < idStr.length; i++) {
      idObj[idStr[i].split('=')[0]] = (idStr[i].split('=')[1]);
    }
    return idObj;
  }

  async connectNode(node) {
    if (!node) {
      return;
    }
    const id = node.meta.data.id;
    const accounts = await this._http.getMyAssetAccounts(id).toPromise();
    const connectInfo = await this.getConnectData(accounts, node);
    if (!connectInfo) {
      this._logger.info('Just close the dialog');
      return;
    }
    this._logger.debug('Connect info: ', connectInfo);

    if (connectInfo.connectMethod.client) {
      this.callLocalClient(connectInfo, node).then();
    } else if (connectInfo.connectMethod.id === TYPE_RDP_FILE.id) {
      this.downloadRDPFile(connectInfo, node).then();
    } else {
      this.createNodeView(connectInfo, node);
    }
  }

  async downloadRDPFile(connectInfo: ConnectData, node: TreeNode) {
    const { account } = connectInfo;
    const data = { accountId: account.id, appId: '', assetId: '' };
    if (node.meta.type === 'application' && node.meta.data.category === 'remote_app') {
      data['appId'] = node.id;
    } else {
      data['assetId'] = node.id;
    }
    await this._http.downloadRDPFile(data, this._settingSvc.setting);
  }

  async callLocalClient(connectInfo: ConnectData, node: TreeNode) {
    this._logger.debug('Call local client');
    const { account } = connectInfo;
    const data = { accountId: account.id, appId: '', assetId: '' };
    if (node.meta.type === 'application' && node.meta.data.category === 'remote_app') {
      data['appId'] = node.id;
    } else {
      data['assetId'] = node.id;
    }
    const response = await this._http.getRDPClientUrl(data, this._settingSvc.setting);
    const url = response['url'];

    launchLocalApp(url, () => {
      const downLoadStatus = localStorage.getItem('hasDownLoadApp');
        if (downLoadStatus !== '1') {
          this._dialog.open(ElementDownloadDialogComponent, {
            height: 'auto',
            width: '800px',
            disableClose: true
          });
        }
    });
  }

  createNodeView(connectInfo: ConnectData, node: TreeNode) {
    const {account, protocol, connectOptions} = connectInfo;
    const view = new View(node, account, 'node', node.meta.type, protocol.name, connectOptions);
    view.connectType = connectInfo.connectMethod;
    this.onNewView.emit(view);
  }

  checkPreConnectData(node: TreeNode, accounts: Account[], preData: ConnectData): Boolean {
    return false;
    if (!preData || !preData.account || preData.node) {
      this._logger.debug('No system user or node');
      return false;
    }
    // 验证系统用户是否有效
    const preAccount = preData.account;
    const inAccounts = accounts.filter(item => {
      return item.id === preAccount.id;
    });
    if (inAccounts.length !== 1) {
      this._logger.debug('System user may be not valid');
      return false;
    }
    // 验证登录
    const account = inAccounts[0];
    const preAuth = preData.manualAuthInfo;
    if (account['login_mode'] === 'manual' && !preAuth.secret) {
      this._logger.debug('System user no manual auth');
      return false;
    }
    // 验证连接方式
    const isRemoteApp = node.meta.type === 'application';
    const connectMethods = this._appSvc.getProtocolConnectMethods(isRemoteApp)['ssh'];
    if (!connectMethods) {
      this._logger.debug('No matched connect types');
      return false;
    }
    const inConnectType = connectMethods.filter(item => {
      return item.id === preData.connectMethod.id;
    });
    if (inConnectType.length !== 1) {
      this._logger.error('No matched connect type, may be changed');
      return false;
    }
    return true;
  }

  getConnectData(accounts: Account[], node: TreeNode): Promise<ConnectData> {
    const preConnectData = this._appSvc.getPreLoginSelect(node);
    const isValid = this.checkPreConnectData(node, accounts, preConnectData);
    if (isValid) {
      return new Promise<ConnectData>(resolve => {
        resolve(preConnectData);
      });
    }

    const dialogRef = this._dialog.open(ElementConnectDialogComponent, {
      minHeight: '300px',
      height: 'auto',
      width: '600px',
      data: {accounts: accounts, node: node}
    });

    return new Promise<ConnectData>(resolve => {
      dialogRef.afterClosed().subscribe(outputData  => {
        resolve(outputData);
      });
    });
  }

  connectFileManager(node: TreeNode) {
    const view = new View(node, null, 'fileManager', 'asset', 'sftp');
    view.nick = '[FILE] ' + node.name;
    view.connectType = TYPE_WEB_SFTP;
    this.onNewView.emit(view);
  }
}
