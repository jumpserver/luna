import { ActivatedRoute, Params } from "@angular/router";
import { Component, OnInit, OnDestroy, ViewChild } from "@angular/core";
import { Protocol, Account, Endpoint, Asset } from "@app/model";
import {
  HttpService,
  DialogService,
  I18nService,
  LogService,
} from "@app/services";
import { MatSidenav } from "@angular/material/sidenav";

@Component({
  selector: "pages-pam-gui",
  templateUrl: "./gui.component.html",
  styleUrls: ["./gui.component.scss"],
})
export class PagePamGUIComponent implements OnInit, OnDestroy {
  @ViewChild("sidenav", { static: false }) sidenav: MatSidenav;

  public startTime: Date;
  public endpoint: Endpoint;

  public userId: string = "";
  public username: string = "";
  public assetId: string = "";
  public assetName: string = "";
  public iframeURL: string = "";
  public totalConnectTime: string = "00:00:00";
  public isActive: boolean = true;

  private timerInterval: any;
  private pausedElapsedTime: number = 0;

  public showActionIcons: boolean = false;

  constructor(
    private _http: HttpService,
    private _i18n: I18nService,
    private _logger: LogService,
    private _dialogAlert: DialogService,
    private route: ActivatedRoute
  ) {
    this.startTime = new Date();
  }

  ngOnInit(): void {
    this.route.params.subscribe(async (params: Params) => {
      this.userId = params["userId"];
      this.username = params["username"];
      this.assetId = params["assetId"];
      this.assetName = params["assetName"];

      this._http.getAssetDetail(this.assetId).subscribe((asset: Asset) => {
        const currentUserInfo = asset.permed_accounts.find(
          (item: Account) => item.id === this.userId
        );

        let method: string = "";
        let protocol: Protocol = asset.permed_protocols[0];

        switch (protocol.name) {
          case "ssh":
          case "telnet":
            method = "ssh_client";
            break;
          case "rdp":
            method = "mstsc";
            break;
          case "sftp":
            method = "sftp_client";
            break;
          case "vnc":
            method = "vnc_client";
            break;
          default:
            method = "db_client";
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
          protocol,
          asset: assetMessage,
          account: currentUserInfo,
          input_username: this.username,
        };

        this._http
          .adminConnectToken(assetMessage, connectData)
          .subscribe((res) => {
            if (res) {
              const url = this.getUrl();

              this.iframeURL = `${url}/lion/connect?token=${res.id}`;
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

  public async handleCloseConnect() {
    window.confirm("确定要关闭当前连接吗?");

    window.close();
  }

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
   * 补零
   * @param value
   * @returns
   */
  private padZero(value: number): string {
    return String(value).padStart(2, "0");
  }

  private handleMouseMove(event: MouseEvent): void {
    this.showActionIcons = event.clientY <= 65;
  }

  ngOnDestroy() {
    this.stopTimer();
    document.removeEventListener("mousemove", this.handleMouseMove.bind(this));
  }

  public closeDrawer() {
    this.sidenav.close();
  }
}
