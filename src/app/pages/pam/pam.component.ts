import { MatSidenav } from "@angular/material/sidenav";
import { ActivatedRoute, Params } from "@angular/router";
import { Protocol, Account, Endpoint, Asset } from "@app/model";
import { HttpService, I18nService, LogService } from "@app/services";
import {
  Component,
  ViewChild,
  OnInit,
  OnDestroy,
  ElementRef,
} from "@angular/core";

@Component({
  selector: "pages-pam",
  templateUrl: "./pam.component.html",
  styleUrls: ["./pam.component.scss"],
})
export class PagePamComponent implements OnInit, OnDestroy {
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

  private timerInterval: any;
  private pausedElapsedTime: number = 0;

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

      this._http.getAssetDetail(this.assetId).subscribe((asset: Asset) => {
        const currentUserInfo = asset.permed_accounts.find(
          (item: Account) => item.id === this.userId
        );

        let method: string = "";

        switch (this.protocol) {
          case "ssh":
          case "telnet":
            method = "web_cli";
            break;
          case "rdp":
            method = "web_gui";
            break;
          case "sftp":
            method = "web_sftp";
            break;
          case "vnc":
            method = "web_gui";
            break;
          default:
            method = "web_cli";
        }

        const assetMessage = {
          id: this.assetId,
          name: this.assetName,
          address: asset.address,
          comment: asset.comment,
          type: asset.type,
          category: asset.category,
          permed_protocols: asset.permed_protocols,
          permed_accounts: asset.permed_accounts,
          spec_info: asset.spec_info,
        };
        const connectData = {
          method,
          protocol: this.protocol,
          asset: assetMessage,
          account: currentUserInfo,
          input_username: this.username,
        };

        this._http
          .adminConnectToken(assetMessage, connectData)
          .subscribe((res) => {
            if (res) {
              const url = this.getUrl();

              switch (this.protocol) {
                case "ssh": {
                  this.iframeTerminalURL = `${url}/koko/connect?token=${res.id}`;
                  break;
                }
                case "sftp": {
                  this.iframeSFTPURL = `${url}/koko/elfinder/sftp/`;
                  break;
                }
                case "rdp": {
                  this.iframeRDPURL = `${url}/lion/connect?token=${res.id}`;
                  break;
                }
                case "vnc": {
                  this.iframeVNCURL = `${url}/lion/connect?token=${res.id}`;
                  break;
                }
                case "telnet": {
                  this.iframeTerminalURL = `${url}/koko/connect?token=${res.id}`;
                  break;
                }
                default: {
                  break;
                }
              }
            }
          });
      });
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
    if (window.confirm("确定要关闭当前连接吗?")) {
      window.close();
    }
  }

  /**
   * 打开文件管理器
   */
  public handleOpenFileManage() {
    const iframeWindow = (this.iframeRef as unknown as { iframeWindow: Window })
      .iframeWindow;

    if (iframeWindow) {
      iframeWindow.postMessage({ name: "FILE" }, "*");
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

    const endpoint = window.location.host.split(":")[0];
    const protocole = window.location.protocol;
    const port = "9529";

    if (port) {
      host = `${endpoint}:${port}`;
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
}
