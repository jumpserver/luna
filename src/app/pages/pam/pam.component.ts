import { MatSidenav } from "@angular/material/sidenav";
import { ActivatedRoute, Params } from "@angular/router";
import { Account, Endpoint, Asset, View } from "@app/model";
import { HttpService, I18nService, LogService } from "@app/services";
import { environment } from '@src/environments/environment';
import {
  Component,
  ViewChild,
  OnInit,
  OnDestroy,
  ElementRef,
  Input,
} from "@angular/core";

@Component({
  selector: "pages-pam",
  templateUrl: "./pam.component.html",
  styleUrls: ["./pam.component.scss"],
})
export class PagePamComponent implements OnInit, OnDestroy {
  @Input() view: View;
  @ViewChild("sidenav", { static: false }) sidenav: MatSidenav;
  @ViewChild("iFrame", { static: false }) iframeRef: ElementRef;

  public startTime: Date;
  public endpoint: Endpoint;

  public userId: string = "";
  public assetId: string = "";
  public username: string = "";
  public assetName: string = "";
  public protocol: string = "";

  public iframeRDPURL: string = "";
  public iframeVNCURL: string = "";
  public iframeSFTPURL: string = "";
  public iframeTerminalURL: string = "";

  public totalConnectTime: string = "00:00:00";
  public isActive: boolean = true;
  public showActionIcons: boolean = false;
  public disabledOpenFileManage: boolean = false;

  private timerInterval: any;
  private pausedElapsedTime: number = 0;

  private assetMessage: any;
  private connectData: any;

  constructor(
    private _http: HttpService,
    private _i18n: I18nService,
    private _logger: LogService,
    private _route: ActivatedRoute
  ) {
    this.startTime = new Date();
  }

  ngOnInit() {
    this._route.params.subscribe(async (params: Params) => {
      this.userId = params["userId"];
      this.username = params["username"];
      this.assetId = params["assetId"];
      this.assetName = params["assetName"];
      this.protocol = params["protocol"];

      try {
        const res = await this._http.directiveConnect(this.assetId).toPromise();
        if (!res) return;

        const currentUserInfo = res.accounts.find(
          (item: Account) => item.id === this.userId
        );

        const method = this.getMethodByProtocol(this.protocol);

        this.assetMessage = {
          id: this.assetId,
          name: this.assetName,
          address: res.address,
          comment: res.comment,
          type: res.type,
          category: res.category,
          permed_protocols: res.protocols,
          permed_accounts: res.accounts,
          spec_info: res.spec_info,
        };

        this.connectData = {
          method,
          protocol: this.protocol,
          asset: this.assetMessage,
          account: currentUserInfo,
          input_username: this.username,
        };

        await this.getConnectToken(this.assetMessage, this.connectData);
      } catch (error) {
        this._logger.error("Failed to connect:", error);
      }
    });

    this.startTimer();

    document.addEventListener("visibilitychange", () => {
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

    document.addEventListener("mousemove", this.handleMouseMove.bind(this));
  }

  ngOnDestroy() {
    this.stopTimer();
    document.removeEventListener("mousemove", this.handleMouseMove.bind(this));
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
   * 打开文件管理器
   */
  public async handleOpenFileManage() {
    const iframeWindow = (this.iframeRef as unknown as { iframeWindow: Window })
      .iframeWindow;

      if (iframeWindow) {
      const res = await this._http
      .adminConnectToken(this.assetMessage, this.connectData, false, false, '')
      .toPromise();

      const SFTP_Token = res ? res.id : '';

      iframeWindow.postMessage({ name: "FILE", SFTP_Token }, "*");
      this._logger.info(`[Luna] Send FILE`);
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
   * @description 获取当前 host 的信息
   * @returns
   */
  private getUrl(): string {
    let host: string = "";
    let port: string = "";

    const endpoint = window.location.host.split(":")[0];
    const protocole = window.location.protocol;

    if (!environment.production) {
      switch (this.protocol) {
        case "ssh":
        case "k8s":
        case "sftp":
        case "telnet":
          port = "9530";
          break;
        default:
          port = "9529";
      }

      host = `${endpoint}:${port}`;
    } else {
      host = `${endpoint}`;
    }

    this._logger.info(`Current host: ${protocole}//${host}`);

    return `${protocole}//${host}`;
  }

  /**
   * 开始计时器
   */
  private startTimer(): void {
    this.timerInterval = setInterval(() => this.updateConnectTime(), 1000);
  }

  /**
   * 停止计时器
   */
  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  /**
   * 补零
   * @param value
   * @returns
   */
  private padZero(value: number): string {
    return String(value).padStart(2, "0");
  }

  /**
   * 更新连接时间
   */
  private updateConnectTime(): void {
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
   * 关闭抽屉
   */
  private closeDrawer(): void {
    this.sidenav.close();
  }

  /**
   * 获取连接令牌
   * @param assetMessage
   * @param connectData
   */
  private async getConnectToken(assetMessage: any, connectData: any) {
    try {
      const firstRes = await this._http
        .adminConnectToken(assetMessage, connectData, false, false, '')
        .toPromise();

      if (!firstRes) return;

      const url = this.getUrl();

      if (this.protocol === "ssh") {
        // const secondRes = await this._http
        //   .adminConnectToken(assetMessage, connectData, false, false, '')
        //   .toPromise();
        // this.iframeTerminalURL = `${url}/koko/connect?token=${firstRes.id}&sftp=${secondRes.id}`;
        this.iframeTerminalURL = `${url}/koko/connect?token=${firstRes.id}`;
        return;
      }

      switch (this.protocol) {
        case "k8s":
          this.iframeTerminalURL = `${url}/koko/k8s/?token=${firstRes.id}`;
          break;
        case "sftp":
          this.iframeSFTPURL = `${url}/koko/elfinder/sftp/`;
          break;
        case "rdp":
          this.iframeRDPURL = `${url}/lion/connect?token=${firstRes.id}`;
          break;
        case "vnc":
          this.iframeVNCURL = `${url}/lion/connect?token=${firstRes.id}`;
          break;
        case "telnet":
        case "mysql":
        case "mariadb":
        case "postgresql":
        case "redis":
        case "oracle":
        case "sqlserver":
        case "mongodb":
        case "clickhouse":
        case "http":
        case "https":
          this.iframeTerminalURL = `${url}/koko/connect?token=${firstRes.id}`;
          break;
      }
    } catch (error) {
      this._logger.error("Failed to get connect token:", error);
    }
  }

  /**
   * 根据协议确定连接方法
   * @param protocol
   * @returns
   */
  private getMethodByProtocol(protocol: string): string {
    switch (protocol) {
      case "ssh":
      case "telnet":
      case "mysql":
      case "mariadb":
      case "postgresql":
      case "redis":
      case "oracle":
      case "sqlserver":
      case "mongodb":
      case "clickhouse":
      case "k8s":
      case "http":
      case "https":
        return "web_cli";
      case "rdp":
      case "vnc":
        return "web_gui";
      case "sftp":
        return "web_sftp";
      default:
        return "web_cli";
    }
  }
}
