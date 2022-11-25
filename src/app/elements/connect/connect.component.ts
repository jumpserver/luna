import {Component, OnInit, Output, OnDestroy, EventEmitter} from '@angular/core';
import 'rxjs/add/operator/toPromise';
import {connectEvt} from '@app/globals';
import {AppService, HttpService, LogService, SettingService} from '@app/services';
import {MatDialog} from '@angular/material';
import {Account, TreeNode, ConnectData, Asset} from '@app/model';
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
              private _http: HttpService,
              private _settingSvc: SettingService,
  ) {
  }

  ngOnInit(): void {
    this.subscribeConnectEvent();
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
    const view = new View(node, null, 'token');
    view.token = token;

    switch (protocol) {
      case 'mysql':
      case 'sqlserver':
      case 'oracle':
      case 'postgresql':
      case 'mariadb':
        if (this._settingSvc.hasXPack()) {
          // view.connectMethod = TYPE_DB_GUI;
        } else {
          // view.connectMethod = TYPE_WEB_GUI;
        }
        break;
      case 'rdp':
      case 'vnc':
        // view.connectMethod = TYPE_WEB_GUI;
        break;
      default:
        // view.connectMethod = TYPE_WEB_CLI;
    }
    this.onNewView.emit(view);
  }

  connectDirectIfNeed() {
    let loginTo = this._appSvc.getQueryString('login_to');
    const tp = this._appSvc.getQueryString('type') || 'asset';
    const assetId = this._appSvc.getQueryString('asset');

    if (assetId) {
      loginTo = assetId;
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

  subscribeConnectEvent() {
    connectEvt.asObservable().subscribe(evt => {
      switch (evt.action) {
        case 'sftp': {
          this.connectFileManager(evt.node);
          break;
        }
        case 'connect': {
          this._appSvc.delPreLoginSelect(evt.node.id);
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
    const id = node.meta.data.id;
    const asset = await this._http.getAssetDetail(id).toPromise();
    const accounts = await this._http.getMyAssetAccounts(id).toPromise();
    const connectInfo = await this.getConnectData(accounts, asset);
    if (!connectInfo) {
      this._logger.info('Just close the dialog');
      return;
    }
    this._logger.debug('Connect info: ', connectInfo);
    const { type } = connectInfo.connectMethod;

    if (type === 'native') {
      this.callLocalClient(connectInfo, node).then();
    } else if (type === 'applet') {
      this.downloadRDPFile(connectInfo, node).then();
    } else {
      this.createWebView(connectInfo, node);
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
    const data = { accountId: account.id, assetId: node.id };
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

  createWebView(connectInfo: ConnectData, node: TreeNode) {
    const view = new View(node, connectInfo);
    this.onNewView.emit(view);
  }

  checkPreConnectData(asset: Asset, accounts: Account[], preData: ConnectData): Boolean {
    if (!preData || !preData.account || preData.asset) {
      this._logger.debug('No account or node');
      return false;
    }
    // 验证系统用户是否有效
    const preAccount = preData.account;
    const inAccounts = accounts.filter(item => {
      return item.username === preAccount.username;
    });
    if (inAccounts.length !== 1) {
      this._logger.debug('System user may be not valid');
      return false;
    }
    // 验证登录
    const account = inAccounts[0];
    const preAuth = preData.manualAuthInfo;
    if (!account.has_secret && !preAuth.secret) {
      this._logger.debug('Account no manual auth');
      return false;
    }
    // 验证连接方式
    const connectMethods = this._appSvc.getProtocolConnectMethods(preData.protocol.name);
    if (!connectMethods) {
      this._logger.debug('No matched connect types');
      return false;
    }
    const inConnectMethod = connectMethods.filter(item => {
      return item.id === preData.connectMethod.value;
    });
    if (inConnectMethod.length !== 1) {
      this._logger.error('No matched connect type, may be changed');
      return false;
    }
    return true;
  }

  getConnectData(accounts: Account[], asset: Asset): Promise<ConnectData> {
    const preConnectData = this._appSvc.getPreLoginSelect(asset);
    const isValid = this.checkPreConnectData(asset, accounts, preConnectData);
    if (isValid) {
      return new Promise<ConnectData>(resolve => {
        resolve(preConnectData);
      });
    }

    const dialogRef = this._dialog.open(ElementConnectDialogComponent, {
      minHeight: '300px',
      height: 'auto',
      width: '600px',
      data: {accounts, asset}
    });

    return new Promise<ConnectData>(resolve => {
      dialogRef.afterClosed().subscribe(outputData  => {
        resolve(outputData);
      });
    });
  }

  connectFileManager(node: TreeNode) {
    const view = new View(node, null, 'fileManager');
    view.name = '[FILE] ' + node.name;
    this.onNewView.emit(view);
  }
}
