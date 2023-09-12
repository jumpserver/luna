import {Component, EventEmitter, OnDestroy, OnInit, Output} from '@angular/core';
import 'rxjs/add/operator/toPromise';
import {connectEvt} from '@app/globals';
import {MatDialog} from '@angular/material';
import {AppService, ConnectTokenService, DialogService, HttpService, I18nService, LogService, SettingService} from '@app/services';
import {Account, Asset, ConnectData, ConnectionToken, K8sInfo, View} from '@app/model';
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
    for (let i = 0; i < idList.length; i++) {
      idObject[idList[i].split('=')[0]] = (idList[i].split('=')[1]);
    }
    return idObject;
  }

  connectK8sAsset(id) {
    const idObject = this.analysisId(id);
    const token = this._route.snapshot.queryParams.token;
    this._http.getConnectToken(token).subscribe(connToken => {
      this._http.getMyAssetAccounts(connToken.asset.id).subscribe(accountList => {
        let account = new Account();
        if (['@INPUT', '@USER'].includes(connToken.account)) {
          account.name = connToken.input_username;
          account.username = connToken.input_username;
          account.alias = connToken.account;
        } else {
          const accounts = accountList.filter(item => item.name === connToken.account);
          if (accounts.length === 0) {
            return;
          }
          account = accounts[0];
        }
        const type = 'k8s';
        const connectInfo = new ConnectData();
        connToken.asset['type'] = {'value': type};
        connectInfo.asset = connToken.asset;
        connectInfo.account = account;
        connectInfo.protocol = {
          'name': type,
          'port': 443,
          'public': true,
          'setting': {}
        };
        connectInfo.manualAuthInfo = {
          alias: account.alias,
          username: account.username,
          secret: undefined,
          rememberAuth: false
        };
        connectInfo.connectMethod = {
          type: type,
          value: 'web_cli',
          component: 'koko',
          label: type,
          endpoint_protocol: 'http',
          disabled: false,
        };
        const kInfo = new K8sInfo();
        kInfo.pod = idObject['pod'];
        kInfo.namespace = idObject['namespace'];
        kInfo.container = idObject['container'];

        this._logger.debug('Connect info: ', connectInfo);
        this.createWebView(connToken.asset, connectInfo, connToken, kInfo);
      });
    });
  }

  subscribeConnectEvent() {
    connectEvt.asObservable().subscribe(evt => {
      if (!evt.node) {
        return;
      }
      if (evt.action === 'k8s') {
        if (['asset', 'container'].indexOf(evt.node.meta.data.identity) !== -1) {
          this.connectK8sAsset(evt.node.id);
          return;
        }
      }

      this._http.getAssetDetail(evt.node.id).subscribe(asset => {
        switch (evt.action) {
          case 'connect': {
            this._appSvc.disableAutoConnect(asset.id);
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
      const msg = await this._i18n.t('Asset not found or You have no permission to access it, please refresh asset tree');
      await this._dialogAlert.alert(msg);
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
    const connectOption = connectInfo.connectOption;
    const connToken = await this._connectTokenSvc.create(asset, connectInfo);

    if (!connToken) {
      this._logger.info('Create connection token failed');
      return;
    }

    if (connToken.protocol === 'k8s') {
      window.open(`/luna/k8s?token=${connToken.id}`);
      return;
    }

    // 特殊处理
    if (connectMethod.value.endsWith('_guide')) {
      return this.createWebView(asset, connectInfo, connToken);
    }

    if (connectInfo.downloadRDP) {
      return this._http.downloadRDPFile(connToken, this._settingSvc.setting);
    } else if (connectMethod.type === 'native') {
      this.callLocalClient(connToken).then();
    } else if (connectMethod.type === 'applet' && connectOption['applet_connection_method'] !== 'web') {
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


  createWebView(asset: Asset, connectInfo: any, connToken: ConnectionToken, k8sInfo?: K8sInfo) {
    const view = new View(asset, connectInfo, connToken, 'node', k8sInfo);
    this.onNewView.emit(view);
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
      return new Promise<ConnectData>(resolve => {
        resolve(preConnectData);
      });
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
