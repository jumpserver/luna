import {Component, OnInit, Output, OnDestroy, EventEmitter} from '@angular/core';
import 'rxjs/add/operator/toPromise';
import {connectEvt} from '@app/globals';
import {AppService, HttpService, LogService, SettingService} from '@app/services';
import {MatDialog} from '@angular/material';
import {Account, TreeNode, ConnectData, Asset, ConnectionToken, k8sInfo} from '@app/model';
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
    this.hasLoginTo = true;
    this._http.filterMyGrantedAssetsById(loginTo).subscribe(nodes => {
      let node;
      if (nodes.length === 1) {
        node = nodes[0];
      } else {
        node = nodes[1];
      }
      this.connectAsset(node).then();
    });
  }

  analysisId(id: string) {
    const idObject = {};
    const idList = id.split('&');
    for (let i = 0; i < idList.length; i++) {
      idObject[idList[i].split('=')[0]] = (idList[i].split('=')[1]);
    }
    return idObject;
  }

  connectK8sAsset(asset) {
      const idObject = this.analysisId(asset.id);
      const assetId = idObject['asset_id'];
      this._http.getAssetDetail(assetId).subscribe(async asset => {
        const accounts = await this._http.getMyAssetAccounts(asset.id).toPromise();
        var account = accounts.filter(item => item.username === idObject['account'])
        if (account.length === 0) {
          console.log('account is not exist')
          return;
        }
        account = account[0];
        const connectInfo = new ConnectData();
        connectInfo.asset = asset
        connectInfo.account = account,
        connectInfo.protocol = asset.protocols[0]
        connectInfo.manualAuthInfo = {
            'username': account.username,
            'secret': undefined,
          }
        connectInfo.connectMethod = {
          'type': 'k8s',
          'value': 'web_cli',
          'component': 'web_cli',
          'label': 'k8s'

        }

        const kInfo = new k8sInfo();
        kInfo.namespace = idObject['namespace'];
        kInfo.pod = idObject['pod'];
        kInfo.container = idObject['container'];

        this._logger.debug('Connect info: ', connectInfo);
        const connToken = await this._http.createConnectToken(asset, connectInfo).toPromise();
        this.createWebView(asset, connectInfo, connToken, kInfo);
      });
  }

  subscribeConnectEvent() {
    connectEvt.asObservable().subscribe(evt => {
      if (!evt.node) {
        return;
      }
      const data = evt.node.meta.data
      if (data.type === 'k8s' && ['container', 'account'].indexOf(data.identity) !== -1) {
        this.connectK8sAsset(evt.node)
        return;
      }
      evt.node.id = evt.node.id.replace('asset_id=', '')
      this._http.getAssetDetail(evt.node.id).subscribe(asset => {
        switch (evt.action) {
          case 'connect': {
            this._appSvc.delPreLoginSelect(asset.id);
            this.connectAsset(asset).then();
            break;
          }
          default: {
            this.connectAsset(asset).then();
          }
        }
      });
    });
  }

  ngOnDestroy(): void {
    connectEvt.unsubscribe();
  }

  async connectAsset(asset) {
    if (!asset) {
      return;
    }
    const accounts = await this._http.getMyAssetAccounts(asset.id).toPromise();
    const connectInfo = await this.getConnectData(accounts, asset);
    if (!connectInfo) {
      this._logger.info('Just close the dialog');
      return;
    }
    this._logger.debug('Connect info: ', connectInfo);
    const connectMethod = connectInfo.connectMethod;
    const connToken = await this._http.createConnectToken(asset, connectInfo).toPromise();

    // 特殊处理
    if (connectMethod.value === 'db_client') {
      return this.createWebView(asset, connectInfo, connToken);
    }

    if (connectInfo.downloadRDP) {
      return this._http.downloadRDPFile(connToken);
    } else if (connectMethod.type === 'native') {
      this.callLocalClient(connToken).then();
    } else {
      this.createWebView(asset, connectInfo, connToken);
    }
  }

  async callLocalClient(connToken: ConnectionToken) {
    this._logger.debug('Call local client');
    const response = await this._http.getLocalClientUrl(connToken).toPromise();
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

  createWebView(asset: Asset, connectInfo: any, connToken: ConnectionToken, k8sInfo?: k8sInfo) {
    const view = new View(asset, connectInfo, connToken, 'node', k8sInfo);
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

  connectFileManager(asset: Asset) {
    const view = new View(asset, null, null, 'fileManager');
    view.name = '[SFTP] ' + asset.name;
    this.onNewView.emit(view);
  }
}
