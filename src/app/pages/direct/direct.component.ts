import { MatDialog } from '@angular/material';
import { ActivatedRoute } from '@angular/router';
import { Account, Endpoint, View, ConnectionToken, ConnectMethod, AuthInfo } from '@app/model';
import { HttpService, I18nService, LogService, ViewService, IframeCommunicationService, AppService } from '@app/services';
import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChildren,
  QueryList,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { ElementACLDialogComponent } from '@src/app/services/connect-token/acl-dialog/acl-dialog.component';

@Component({
  selector: 'pages-direct',
  templateUrl: './direct.component.html',
  styleUrls: ['./direct.component.scss'],
})
export class PageDirectComponent implements OnInit, OnDestroy {
  @ViewChildren('contentWindow') contentWindows: QueryList<ElementRef>;

  public startTime: Date;
  public endpoint: Endpoint;

  public view: View;

  public accountId: string = '';
  public assetId: string = '';
  public username: string = '';
  public assetName: string = '';
  public protocol: string = '';

  public totalConnectTime: string = '00:00:00';
  public isTimerStopped: boolean = false;
  public isActive: boolean = true;
  public showActionIcons: boolean = false;
  public disabledOpenFileManage: boolean = false;

  private timerInterval: any;
  private pausedElapsedTime: number = 0;

  private permedAsset: any;
  private connectData: any;
  private account: Account;
  private connectToken: ConnectionToken;
  private subscription: Subscription;
  private connectMethod: ConnectMethod;
  private asset: any;
  private method: string;

  constructor(
    private _dialog: MatDialog,
    private _http: HttpService,
    private _i18n: I18nService,
    public viewSrv: ViewService,
    private _appSvc: AppService,
    private _logger: LogService,
    private _route: ActivatedRoute,
    private iframeCommunicationService: IframeCommunicationService
  ) {
    this.startTime = new Date();
  }

  async ngOnInit() {
    this._logger.info('DirectComponent initialized');
    this.isTimerStopped = false;

    await this.getConnectData();
    this._logger.info('DirectComponent getConnectData', this.asset);

    const finish = await this.createConnectionToken();

    if (finish) {
      this.onNewView();
      this.startTimer();
      this.handleEventChangeTime();
      this.subscription = this.iframeCommunicationService.message$.subscribe((message) => {
        if (message.name === 'CLOSE') {
          this.stopTimer();
        }
      });
    }
  }

  handleEventChangeTime() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.isActive = false;
        this.stopTimer();
        const currentTime = new Date().getTime();
        this.pausedElapsedTime += currentTime - this.startTime.getTime();
      } else {
        setTimeout(() => {
          this.isActive = true;
          this.startTime = new Date();
          this.startTimer();
        }, 0);
      }
    });
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
  }

  async getConnectData() {
    const params = this._route.snapshot.queryParams;
    this.accountId = params['account'];
    this.assetId = params['asset'];
    this.protocol = params['protocol'];

    this.asset = await this._http.getAssetDetail(this.assetId).toPromise();
    this.account = await this._http.getAccountDetail(this.accountId).toPromise();

    if (!this.asset) {
      alert(this._i18n.instant('NoAsset'));
      return;
    }

    this.assetName = this.asset.name;
    this.method = this.getMethodByProtocol(this.protocol);
  }

  async createConnectionToken() {
    const asset = this.asset;

    this.permedAsset = {
      id: this.assetId,
      name: this.assetName,
      address: asset.address,
      comment: asset.comment,
      type: asset.type,
      category: asset.category,
      permed_protocols: asset.protocols,
      permed_accounts: asset.accounts,
      spec_info: asset.spec_info,
    };

    this.connectData = {
      method: this.method,
      protocol: { name: this.protocol },
      asset: this.permedAsset,
      account: this.account,
      autoLogin: true,
      input_username: this.account.username,
      connectMethod: this.connectMethod,
      manualAuthInfo: new AuthInfo(),
      direct: true,
    };

    this._appSvc.setPreConnectData(this.asset, this.connectData);

    const res = await this.getConnectToken(this.permedAsset, this.connectData);

    console.log('res', res);

    if (res) {
      return res;
    }

    return new Promise((resolve, reject) => {
      if (res) {
        resolve(res);
      } else {
        reject(new Error('Failed to get connect token'));
      }
    });
  }

  ngOnDestroy() {
    this.stopTimer();
    document.removeEventListener('mousemove', this.handleMouseMove.bind(this));
  }

  public onNewView(event?: any) {
    if (event) {
      this.view = event;
    } else {
      this.view = new View(
        this.asset,
        {
          ...this.connectData,
          protocol: { name: this.protocol },
          connectMethod: this.connectMethod,
        },
        this.connectToken,
        "node"
      );
    }

    this.viewSrv.addView(this.view);
    this.viewSrv.activeView(this.view);
  }

  /**
   * 关闭当前连接
   */
  public async handleCloseConnect() {
    if (window.confirm(`${this._i18n.instant('TurnOffReminders')}`)) {
      this.stopTimer();
      window.close();
    }
  }

  public handleSocketCloseEvent(_event: any) {
    this.stopTimer();
    this.disabledOpenFileManage = true;
  }

  /**
   * 判断当前协议是否为数据库相关协议
   * @returns boolean
   */
  public isDatabaseProtocol(): boolean {
    const databaseProtocols = [
      'mysql',
      'mariadb',
      'postgresql',
      'redis',
      'oracle',
      'sqlserver',
      'mongodb',
      'clickhouse',
    ];
    return databaseProtocols.includes(this.protocol);
  }

  /**
   * @description 打开设置
   */
  public async handleOpenDrawer (type: string) {
    if (type === 'setting') {
      this.iframeCommunicationService.sendMessage({ name: 'OPEN', noFileTab: true });
      return this._logger.info(`[Luna] Send OPEN SETTING`);
    }

    if (type === 'file') {
      const res = await this._http.adminConnectToken(this.permedAsset, this.connectData, false, false, '').toPromise();

      const SFTP_Token = res ? res.id : '';
      this.iframeCommunicationService.sendMessage({ name: 'FILE', SFTP_Token });
      return this._logger.info(`[Luna] Send OPEN FILE`);
    }
  }

  /**
   * windows 的关闭按钮
   * @param event
   */
  private handleMouseMove(event: MouseEvent): void {
    this.showActionIcons = event.clientY <= 65;
  }

  /**
   * 开始计时器
   */
  private startTimer(): void {
    if (this.timerInterval) {
      this.stopTimer();
    }
    this.timerInterval = setInterval(() => this.updateConnectTime(), 1000);
  }

  /**
   * 停止计时器
   */
  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
      this.isTimerStopped = true;
    }
  }

  /**
   * 补零
   * @param value
   * @returns
   */
  private padZero(value: number): string {
    return String(value).padStart(2, '0');
  }

  /**
   * 更新连接时间
   */
  private updateConnectTime(): void {
    if (this.isTimerStopped) {
      return;
    }

    const currentTime = new Date();
    const elapsed =
      currentTime.getTime() - this.startTime.getTime() + this.pausedElapsedTime;

    const hours = Math.floor((elapsed / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((elapsed / (1000 * 60)) % 60);
    const seconds = Math.floor((elapsed / 1000) % 60);

    this.totalConnectTime = `${this.padZero(hours)}:${this.padZero(
      minutes
    )}:${this.padZero(seconds)}`;
  }

  /**
   * 获取连接令牌
   * @param assetMessage
   * @param connectData
   */
  private getConnectToken(assetMessage: any, connectData: any) {
    return new Promise(async (resolve, reject) => {
      try {
        this._http
          .adminConnectToken(assetMessage, connectData, false, false, '')
          .subscribe(res => {
              this.connectToken = res;
              resolve(true);
            },
          error => {
            const dialogRef = this._dialog.open(ElementACLDialogComponent, {
              height: 'auto',
              width: '450px',
              disableClose: true,
              data: {
                asset: assetMessage,
                connectData: connectData,
                code: error.error.code,
                tokenAction: 'create',
                error: error,
              },
            })

            dialogRef.afterClosed().subscribe(token => {
              console.log('token', token);

              this.connectToken = token
              this.onNewView();
            });
          }
        )
      } catch (error) {
        this._logger.error('Failed to get connect token:', error);
        reject(error);
      }
    });
  }

  /**
   * 根据协议确定连接方法
   * @param protocol
   * @returns
   */
  private getMethodByProtocol(protocol: string): string {
    const endpointProtocol = window.location.protocol.replace(':', '');

    switch (protocol) {
      case 'ssh':
      case 'telnet':
      case 'mysql':
      case 'mariadb':
      case 'postgresql':
      case 'redis':
      case 'oracle':
      case 'sqlserver':
      case 'mongodb':
      case 'clickhouse':
      case 'k8s':
      case 'http':
      case 'https':
        this.connectMethod = {
          component: 'koko',
          type: 'web',
          value: 'web_cli',
          label: 'Web CLI',
          endpoint_protocol: endpointProtocol,
          disabled: false,
        };
        return 'web_cli';
      case 'rdp':
      case 'vnc':
        this.connectMethod = {
          component: 'lion',
          type: 'web',
          value: 'web_gui',
          label: 'Web GUI',
          endpoint_protocol: endpointProtocol,
          disabled: false,
        };
        return 'web_gui';
      case 'sftp':
        this.connectMethod = {
          component: 'koko',
          type: 'web',
          value: 'web_sftp',
          label: 'Web SFTP',
          endpoint_protocol: endpointProtocol,
          disabled: false,
        };
        return 'web_sftp';
      default:
        return 'web_cli';
    }
  }
}
