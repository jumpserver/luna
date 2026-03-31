import { Subscription } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { NzModalService } from 'ng-zorro-antd/modal';
import { View, Account, AuthInfo, ConnectionToken, ConnectMethod, Endpoint } from '@app/model';
import { Component, OnInit, OnDestroy, ElementRef, ViewChildren, QueryList } from '@angular/core';
import { ElementACLDialogComponent } from '@src/app/services/connect-token/acl-dialog/acl-dialog.component';
import {
  LogService,
  AppService,
  ViewService,
  I18nService,
  HttpService,
  SettingService,
  DrawerStateService,
  IframeCommunicationService
} from '@app/services';
import { CookieService } from 'ngx-cookie-service';
import { Protocol } from '@app/model';

@Component({
  standalone: false,
  selector: 'pages-connect',
  templateUrl: 'connect.component.html',
  styleUrls: ['connect.component.scss']
})
export class PagesConnectComponent implements OnInit, OnDestroy {
  @ViewChildren('contentWindow') contentWindows: QueryList<ElementRef>;

  view: View;

  public startTime: Date;
  public totalConnectTime: string = '00:00:00';
  public isActive: boolean = true;
  public isTimerStopped: boolean = false;
  public showActionIcons: boolean = false;
  public isTimerVisible: boolean = true;
  public isTimerDragging: boolean = false;
  public timerPosition: { x: number; y: number } | null = null;
  private readonly guiComponents: Set<string> = new Set(['lion', 'tinker', 'razor', 'panda']);
  private readonly terminalComponents: Set<string> = new Set(['koko', 'chen', 'magnus', 'nec']);
  private readonly timerPositionStorageKey = 'luna.connect.timer.position';
  private timerPointerId: number | null = null;
  private timerDragStart: { x: number; y: number } | null = null;
  private timerDragOffset: { x: number; y: number } | null = null;
  private timerDragSize: { width: number; height: number } | null = null;
  private timerStartRect: { left: number; top: number } | null = null;

  // 人脸在线相关
  private faceMonitorToken: string;

  // Direct 模式相关属性
  public endpoint: Endpoint;
  public assetId: string = '';
  public org_id: string = '';
  public username: string = '';
  public protocol: string = '';
  public accountId: string = '';
  public assetName: string = '';
  public isDirect: boolean = false;
  public disabledOpenFileManage: boolean = false;

  private timerInterval: any;
  private pausedElapsedTime: number = 0;
  private subscription: Subscription;

  // Direct 模式私有属性
  private permedAsset: any;
  private connectData: any;
  private account: Account;
  private connectToken: ConnectionToken;
  private connectMethod: ConnectMethod | string;
  private asset: any;
  private method: string;
  private permedProtocol: Protocol;
  public isAdminConnect: boolean = false;

  constructor(
    private _i18n: I18nService,
    private _http: HttpService,
    private _appSvc: AppService,
    private _logger: LogService,
    private _viewSrv: ViewService,
    private _route: ActivatedRoute,
    private _router: Router,
    private _cookie: CookieService,
    private _settingSvc: SettingService,
    private _dialog: NzModalService,
    private _drawerStateService: DrawerStateService,
    private _iframeCommunicationService: IframeCommunicationService
  ) {
    this.startTime = new Date();
  }

  async ngOnInit() {
    this.view = null;
    this.isTimerStopped = false;
    this.isTimerVisible = true;
    this.loadTimerPosition();

    this.checkDirectMode();

    this.subscription = this._iframeCommunicationService.message$.subscribe(message => {
      if (message.name === 'CLOSE') {
        this.stopTimer();
      }
    });

    if (this.isDirect) {
      await this.initDirectMode();
    } else {
      this.handleEventChangeTime();
    }
  }

  ngOnDestroy() {
    this.stopTimer();
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    document.removeEventListener('mousemove', this.handleMouseMove.bind(this));
  }

  /**
   * 检查是否为直连模式
   */
  private checkDirectMode() {
    if (this._route.snapshot.routeConfig?.path === 'admin-connect') {
      this.isAdminConnect = true;
    }

    const params = this._route.snapshot.queryParams;
    // 检查是否有 direct: true 参数，或者同时有 account, asset, protocol 参数
    this.isDirect =
      params['direct'] === 'true' || !!(params['account'] && params['asset'] && params['protocol']);

    if (this.isDirect) {
      this.accountId = params['account'];
      this.assetId = params['asset'];
      this.protocol = params['protocol'];
      this.org_id = params['org_id'];

      this._cookie.set('X-JMS-LUNA-ORG', this.org_id, 30, '/');

      this._logger.info('Direct mode detected', {
        accountId: this.accountId,
        assetId: this.assetId,
        protocol: this.protocol,
        fromPAM: params['direct'] === 'true'
      });
    }
  }

  /**
   * 初始化直连模式
   */
  private async initDirectMode() {
    this._logger.info('DirectComponent initialized');

    await this.getConnectData();
    this._logger.info('DirectComponent getConnectData', this.asset);

    const finish = await this.createConnectionToken();

    if (finish) {
      this.onNewView();
      this.startTimer();
      this.handleEventChangeTime();
    }
  }

  /**
   * 获取连接数据（直连模式）
   */
  async getConnectData() {
    this.asset = await this._http.getAssetDetail(this.assetId).toPromise();
    this.account = await this._http.getAccountDetail(this.accountId).toPromise();

    // const permed = await this._http.getPermedAssetDetail(this.assetId).toPromise();
    this.permedProtocol = this.asset.protocols;

    if (!this.asset) {
      alert(this._i18n.instant('NoAsset'));
      return;
    }

    this.assetName = this.asset.name;
    this.method = this.getMethodByProtocol(this.protocol);
  }

  private buildDefaultConnectOption() {
    const setting = this._settingSvc.setting || ({} as any);
    const graphics = setting.graphics || {};
    const commandLine = setting.command_line || {};

    return {
      resolution: (graphics.rdp_resolution || 'auto').toLowerCase(),
      rdp_connection_speed: 'auto',
      reusable: false,
      token_reusable: false,
      appletConnectMethod: graphics.applet_connection_method || 'web',
      virtualappConnectMethod: graphics.applet_connection_method || 'web',
      backspaceAsCtrlH: commandLine.is_backspace_as_ctrl_h ?? false,
      charset: 'default',
      disableautohash: false
    };
  }

  /**
   * 创建连接令牌（直连模式）
   */
  async createConnectionToken() {
    const asset = this.asset;

    this.permedAsset = {
      id: this.assetId,
      name: this.assetName,
      address: asset.address,
      comment: asset.comment,
      type: asset.type,
      category: asset.category,
      permed_protocols: this.permedProtocol,
      permed_accounts: asset.accounts,
      spec_info: asset.spec_info
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
      connectOption: this.buildDefaultConnectOption(),
      direct: true
    };

    this._appSvc.setPreConnectData(this.asset, this.connectData);

    const res = await this.getConnectToken(this.permedAsset, this.connectData);

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

  /**
   * 获取连接令牌
   */
  private getConnectToken(assetMessage: any, connectData: any) {
    return new Promise(async (resolve, reject) => {
      try {
        this._http.adminConnectToken(assetMessage, connectData, false, false, '').subscribe(
          res => {
            this.connectToken = res;
            resolve(true);
          },
          error => {
            const dialogRef = this._dialog.create({
              nzContent: ElementACLDialogComponent,
              nzData: {
                asset: assetMessage,
                connectData: connectData,
                code: error.error.code,
                tokenAction: 'create',
                error: error
              }
            });

            dialogRef.afterClose.subscribe(token => {
              if (token) {
                this.connectToken = token;
                this.onNewView();
                this.startTimer();

                return;
              }

              window.close();
            });
          }
        );
      } catch (error) {
        this._logger.error('Failed to get connect token:', error);
        reject(error);
      }
    });
  }

  /**
   * 根据协议确定连接方法
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
        this.connectMethod = {
          component: 'koko',
          type: 'web',
          value: 'web_cli',
          label: 'Web CLI',
          endpoint_protocol: endpointProtocol,
          disabled: false
        };
        return 'web_cli';
      case 'http':
      case 'https': {
        const connectMethods = this._appSvc.getProtocolConnectMethods(protocol) || [];
        const preferredMethod = connectMethods[0];

        if (preferredMethod) {
          this.connectMethod = {
            component: preferredMethod.component || 'lion',
            type: preferredMethod.type || 'web',
            value: preferredMethod.value || 'chrome',
            label: preferredMethod.label || 'Chrome',
            endpoint_protocol: preferredMethod.endpoint_protocol || endpointProtocol,
            disabled: preferredMethod.disabled ?? false
          };
          return this.connectMethod.value;
        }
      }
      case 'rdp':
      case 'vnc':
        this.connectMethod = {
          component: 'lion',
          type: 'web',
          value: 'web_gui',
          label: 'Web GUI',
          endpoint_protocol: endpointProtocol,
          disabled: false
        };
        return 'web_gui';
      case 'sftp':
        this.connectMethod = {
          component: 'koko',
          type: 'web',
          value: 'web_sftp',
          label: 'Web SFTP',
          endpoint_protocol: endpointProtocol,
          disabled: false
        };
        return 'web_sftp';
      default:
        this.connectMethod = {
          component: 'koko',
          type: 'web',
          value: 'web_cli',
          label: 'Web CLI',
          endpoint_protocol: endpointProtocol,
          disabled: false
        };
        return 'web_cli';
    }
  }

  onNewView(view?) {
    if (this.isDirect && !view) {
      // 直连模式创建视图
      this.view = new View(
        this.permedAsset,
        {
          ...this.connectData,
          permed_protocol: { name: this.protocol },
          connectMethod: this.connectMethod
        },
        this.connectToken,
        'node'
      );
    } else if (view) {
      this.view = view;
      this.view.active = true;
    }

    if (this.view) {
      this._viewSrv.addView(this.view);
      this._viewSrv.activeView(this.view);

      if (!this.isDirect) {
        this.startTimer();
      }

      // 发送视图变更消息
      setTimeout(
        () => {
          this._drawerStateService.sendComponentMessage({
            name: 'TAB_VIEW_CHANGE',
            data: this.view.id
          });
        },
        this.isDirect ? 100 : 500
      );
    }
  }

  /**
   * 处理关闭连接
   */
  public async handleCloseConnect() {
    if (this.isDirect) {
      if (window.confirm(`${this._i18n.instant('TurnOffReminders')}`)) {
        this.stopTimer();
        window.close();
      }
    } else {
      this.stopTimer();
      window.close();
    }
  }

  /**
   * 处理打开抽屉
   */
  public async handleOpenDrawer() {
    if (this.isDirect) {
      this._http.adminConnectToken(this.permedAsset, this.connectData, false, false, '').subscribe(
        resp => {
          const fileManagerToken = resp ? resp.id : '';
          this._drawerStateService.sendComponentMessage({
            name: 'OPEN_SETTING',
            data: {
              direct: true,
              fileManagerToken: fileManagerToken
            }
          });
          return this._logger.info(`[Luna] Send OPEN_SETTING with fileManagerToken`);
        },
        error => {
          const dialogRef = this._dialog.create({
            nzContent: ElementACLDialogComponent,
            nzData: {
              asset: this.permedAsset,
              connectData: { ...this.connectData, direct: true },
              code: error.error.code,
              tokenAction: 'create',
              error: error
            }
          });

          dialogRef.afterClose.subscribe(token => {
            if (token) {
              const fileManagerToken = token.id;

              if (!fileManagerToken) {
                alert(this._i18n.instant('VerificationFailed'));
                return;
              }

              this._drawerStateService.sendComponentMessage({
                name: 'OPEN_SETTING',
                data: {
                  direct: true,
                  fileManagerToken: fileManagerToken
                }
              });
              return;
            }

            alert(this._i18n.instant('VerificationFailed'));
          });
        }
      );
    } else {
      this._drawerStateService.sendComponentMessage({
        name: 'OPEN_SETTING',
        data: {
          direct: false
        }
      });
    }
  }

  /**
   * 处理页面可见性变化和计时器管理
   */
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

  /**
   * 处理鼠标移动事件，控制操作图标显示
   */
  private handleMouseMove(event: MouseEvent): void {
    this.showActionIcons = event.clientY <= 65;
  }

  public hideTimer(): void {
    this.isTimerVisible = false;
  }

  public getTimerContainerStyle(): Record<string, string> {
    if (!this.timerPosition) {
      return {};
    }
    return {
      left: `${this.timerPosition.x}px`,
      top: `${this.timerPosition.y}px`,
      right: 'auto',
      bottom: 'auto',
      transform: 'none'
    };
  }

  public onTimerPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) {
      return;
    }

    const timerContainer = event.currentTarget as HTMLElement | null;
    if (!timerContainer) {
      return;
    }

    const rect = timerContainer.getBoundingClientRect();

    this.timerPointerId = event.pointerId;
    this.timerDragStart = { x: event.clientX, y: event.clientY };
    this.timerDragOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    this.timerDragSize = { width: rect.width, height: rect.height };
    this.timerStartRect = { left: rect.left, top: rect.top };
    this.isTimerDragging = false;

    timerContainer.setPointerCapture(event.pointerId);
  }

  public onTimerPointerMove(event: PointerEvent): void {
    if (this.timerPointerId !== event.pointerId) {
      return;
    }
    if (
      !this.timerDragStart ||
      !this.timerDragOffset ||
      !this.timerDragSize ||
      !this.timerStartRect
    ) {
      return;
    }

    const dx = event.clientX - this.timerDragStart.x;
    const dy = event.clientY - this.timerDragStart.y;
    const dragThresholdPx = 3;

    if (!this.isTimerDragging) {
      if (Math.abs(dx) < dragThresholdPx && Math.abs(dy) < dragThresholdPx) {
        return;
      }
      this.isTimerDragging = true;

      if (!this.timerPosition) {
        this.timerPosition = { x: this.timerStartRect.left, y: this.timerStartRect.top };
      }
    }

    event.preventDefault();

    const maxX = Math.max(0, window.innerWidth - this.timerDragSize.width);
    const maxY = Math.max(0, window.innerHeight - this.timerDragSize.height);

    const unclampedX = event.clientX - this.timerDragOffset.x;
    const unclampedY = event.clientY - this.timerDragOffset.y;

    this.timerPosition = {
      x: Math.min(Math.max(0, unclampedX), maxX),
      y: Math.min(Math.max(0, unclampedY), maxY)
    };
  }

  public onTimerPointerUp(event: PointerEvent): void {
    if (this.timerPointerId !== event.pointerId) {
      return;
    }

    const timerContainer = event.currentTarget as HTMLElement | null;
    if (timerContainer) {
      try {
        timerContainer.releasePointerCapture(event.pointerId);
      } catch {}
    }

    if (this.isTimerDragging) {
      this.persistTimerPosition();
    }

    this.timerPointerId = null;
    this.timerDragStart = null;
    this.timerDragOffset = null;
    this.timerDragSize = null;
    this.timerStartRect = null;
    this.isTimerDragging = false;
  }

  private loadTimerPosition(): void {
    try {
      const raw = localStorage.getItem(this.timerPositionStorageKey);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as { x?: unknown; y?: unknown; w?: unknown; h?: unknown };
      if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') {
        return;
      }

      const width = typeof parsed.w === 'number' && parsed.w > 0 ? parsed.w : 0;
      const height = typeof parsed.h === 'number' && parsed.h > 0 ? parsed.h : 0;

      const maxX = width > 0 ? Math.max(0, window.innerWidth - width) : window.innerWidth;
      const maxY = height > 0 ? Math.max(0, window.innerHeight - height) : window.innerHeight;

      this.timerPosition = {
        x: Math.min(Math.max(0, parsed.x), maxX),
        y: Math.min(Math.max(0, parsed.y), maxY)
      };
    } catch {}
  }

  private persistTimerPosition(): void {
    if (!this.timerPosition) {
      return;
    }

    try {
      localStorage.setItem(
        this.timerPositionStorageKey,
        JSON.stringify({
          x: this.timerPosition.x,
          y: this.timerPosition.y,
          w: this.timerDragSize?.width ?? 0,
          h: this.timerDragSize?.height ?? 0
        })
      );
    } catch {}
  }

  /**
   * 开始计时器
   */
  private startTimer(): void {
    if (this.timerInterval) {
      this.stopTimer();
    }
    this.isTimerStopped = false;
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
    const elapsed = currentTime.getTime() - this.startTime.getTime() + this.pausedElapsedTime;

    const hours = Math.floor((elapsed / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((elapsed / (1000 * 60)) % 60);
    const seconds = Math.floor((elapsed / 1000) % 60);

    this.totalConnectTime = `${this.padZero(hours)}:${this.padZero(
      minutes
    )}:${this.padZero(seconds)}`;
  }

  /**
   * 获取资产信息（用于显示）
   */
  public getAssetInfo(): any {
    if (this.isDirect) {
      return {
        name: this.assetName || 'Unknown Asset',
        protocol: this.protocol || 'Unknown Protocol'
      };
    } else if (this.view && this.view.asset) {
      return {
        name: this.view.asset.name || 'Unknown Asset',
        protocol: this.view.connectData?.protocol?.name || 'Unknown Protocol'
      };
    }
    return {
      name: 'Unknown Asset',
      protocol: 'Unknown Protocol'
    };
  }

  /**
   * 判断是否为非协议连接
   */
  public isNoneProtocol(): boolean {
    if (this.isDirect) {
      const protocols = [
        'mysql',
        'mariadb',
        'postgresql',
        'redis',
        'oracle',
        'sqlserver',
        'mongodb',
        'clickhouse',
        'k8s',
        'http',
        'https'
      ];
      return protocols.includes(this.protocol);
    } else {
      const assetInfo = this.getAssetInfo();
      return ['k8s', 'website'].includes(assetInfo.protocol);
    }
  }

  /**
   * 判断当前视图是否为 GUI 组件
   */
  public isGuiComponent(): boolean {
    const componentName = this.view?.connectMethod?.component as string | undefined;
    return !!componentName && this.guiComponents.has(componentName);
  }

  /**
   * 判断当前视图是否为终端类组件
   */
  public isTerminalComponent(): boolean {
    const componentName = this.view?.connectMethod?.component as string | undefined;
    return !!componentName && this.terminalComponents.has(componentName);
  }

  /**
   * 是否为 Web SFTP
   */
  public isWebSftp(): boolean {
    return this.view?.connectMethod?.value === 'web_sftp';
  }

  /**
   * 是否为 Web CLI 或 Web GUI
   */
  public isWebCliOrGui(): boolean {
    const value = this.view?.connectMethod?.value as string | undefined;
    return (
      value === 'web_cli' ||
      value === 'web_gui' ||
      value === 'db_guide' ||
      value === 'vnc_guide' ||
      value === 'ssh_guide'
    );
  }
}
