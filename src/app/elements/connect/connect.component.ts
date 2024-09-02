import {Component, EventEmitter, OnDestroy, OnInit, Output} from '@angular/core';
import 'rxjs/add/operator/toPromise';
import {connectEvt} from '@app/globals';
import {MatDialog} from '@angular/material';
import {
  AppService,
  ConnectTokenService,
  DialogService,
  HttpService,
  I18nService,
  LogService,
  SettingService,
  ViewService
} from '@app/services';
import {Account, Asset, ConnectData, ConnectionToken, View} from '@app/model';
import {ElementConnectDialogComponent} from './connect-dialog/connect-dialog.component';
import {ElementDownloadDialogComponent} from './download-dialog/download-dialog.component';
import {launchLocalApp} from '@app/utils/common';
import {ActivatedRoute} from '@angular/router';


@Component({
  selector: 'elements-connect',
  templateUrl: './connect.component.html',
})
export class ElementConnectComponent implements OnInit, OnDestroy {
  @Output() onNewView: EventEmitter<View> = new EventEmitter<View>();
  hasLoginTo = false;

  constructor(private _appSvc: AppService,
              private _dialogAlert: DialogService,
              private _dialog: MatDialog,
              private _logger: LogService,
              private _route: ActivatedRoute,
              private _http: HttpService,
              private _connectTokenSvc: ConnectTokenService,
              private _i18n: I18nService,
              private _settingSvc: SettingService,
              public viewSrv: ViewService,
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
      const titles = document.title.split(' - ');
      document.title = node.name + ' - ' + titles[titles.length - 1];
      this._http.getAssetDetail(node.id).subscribe(asset => {
        this.connectAsset(asset).then();
      });
    });
  }

  analysisId(id: string) {
    const idObject = {};
    const idList = id.split('&');
    for (const element of idList) {
      idObject[element.split('=')[0]] = (element.split('=')[1]);
    }
    return idObject;
  }

  subscribeConnectEvent() {
    connectEvt.asObservable().subscribe(evt => {
      if (!evt.node) {
        return;
      }

      this._http.getAssetDetail(evt.node.id).subscribe(asset => {
        switch (evt.action) {
          case 'connect': {
            this._appSvc.disableAutoConnect(asset.id);
            this.connectAsset(asset, evt.splitConnect).then();
            break;
          }
          default: {
            this.connectAsset(asset, evt.splitConnect).then();
          }
        }
      });
    });
  }

  ngOnDestroy(): void {
    connectEvt.unsubscribe();
  }

  /**
   * @param asset
   * @param splitConnect 是否分屏连接
   */
  async connectAsset(asset, splitConnect = false) {
    if (!asset) {
      const msg = await this._i18n.t('Asset not found or You have no permission to access it, please refresh asset tree');
      await this._dialogAlert.alert(msg);
      return;
    }
    const accounts = asset.permed_accounts;
    const connectInfo = await this.getConnectData(accounts, asset);
    if (!connectInfo) {
      this._logger.info('Just close the dialog');
      return;
    }
    this._logger.debug('Connect info: ', connectInfo);
    const connectMethod = connectInfo.connectMethod;
    const connectOption = connectInfo.connectOption;
    const connToken = await this._connectTokenSvc.create(asset, connectInfo);

    if (!connToken) {
      this._logger.info('Create connection token failed');
      return;
    }

    if (connToken.protocol === 'k8s') {
      const baseUrl = `${window.location.protocol}//${window.location.host}/`;
      const fullUrl = `${baseUrl}koko/k8s/?token=${connToken.id}`;
      window.open(fullUrl);
      return;
    }

    // 分屏连接
    if (splitConnect) {
      return this.currentWebSubView(asset, connectInfo, connToken);
    }

    // 特殊处理
    if (connectMethod.value.endsWith('_guide')) {
      return this.createWebView(asset, connectInfo, connToken);
    }
    let appletConnectMethod = connectOption ? connectOption['appletConnectMethod'] : 'web';
    if (!this._settingSvc.hasXPack()) {
      appletConnectMethod = 'web';
    }

    if (connectInfo.downloadRDP) {
      return this._http.downloadRDPFile(connToken, this._settingSvc.setting, connectInfo.connectOption);
    } else if (connectMethod.type === 'native') {
      this.callLocalClient(connToken).then();
    } else if (connectMethod.type === 'applet' && appletConnectMethod === 'client') {
      this.callLocalClient(connToken).then();
    } else {
      this.createWebView(asset, connectInfo, connToken);
    }
  }

  async callLocalClient(connToken: ConnectionToken) {
    this._logger.debug('Call local client');
    const response = await this._http.getLocalClientUrl(connToken, this._settingSvc.setting).toPromise();
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


  createWebView(asset: Asset, connectInfo: any, connToken: ConnectionToken) {
    const view = new View(asset, connectInfo, connToken, 'node');
    this.onNewView.emit(view);
  }

  currentWebSubView(asset: Asset, connectInfo: any, connToken: ConnectionToken) {
    const view = new View(asset, connectInfo, connToken, 'node');
    this.viewSrv.addSubViewToCurrentView(view);
  }

  checkPreConnectDataForAuto(asset: Asset, accounts: Account[], preData: ConnectData): Boolean {
    if (!preData || !preData.account || preData.asset) {
      this._logger.debug('No account or node');
      return false;
    }
    if (!preData.autoLogin) {
      this._logger.debug('Not auto login');
      return false;
    }
    // 验证账号是否有效
    const preAccount = preData.account;
    const account = accounts.find(item => {
      return item.alias === preAccount.alias;
    });
    if (!account) {
      this._logger.debug('Account may be not valid');
      return false;
    }
    // 验证登录信息
    const preAuth = preData.manualAuthInfo;
    if (!account.has_secret && (!preAuth || !preAuth.secret)) {
      this._logger.debug('Account no manual auth');
      return false;
    }
    // 验证连接方式
    const connectMethods = this._appSvc.getProtocolConnectMethods(preData.protocol.name);
    if (!connectMethods) {
      this._logger.debug('No matched connect types');
      return false;
    }
    const connectMethod = connectMethods.find(item => {
      return item.value === preData.connectMethod.value;
    });
    if (!connectMethod) {
      this._logger.error('No matched connect type, may be changed: ', preData.connectMethod.value);
      return false;
    }
    preData.connectMethod = connectMethod;
    return true;
  }

  getConnectData(accounts: Account[], asset: Asset): Promise<ConnectData> {
    const preConnectData = this._appSvc.getPreConnectData(asset);
    const isValid = this.checkPreConnectDataForAuto(asset, accounts, preConnectData);
    if (isValid) {
      return Promise.resolve(preConnectData);
    }

    this._appSvc.connectDialogShown = true;
    const dialogRef = this._dialog.open(ElementConnectDialogComponent, {
      minHeight: '300px',
      height: 'auto',
      width: '600px',
      data: {accounts, asset, preConnectData}
    });

    return new Promise<ConnectData>(resolve => {
      dialogRef.afterClosed().subscribe(outputData => {
        this._appSvc.connectDialogShown = false;
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
