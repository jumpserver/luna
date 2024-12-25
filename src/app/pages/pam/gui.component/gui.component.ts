import { ActivatedRoute, Params } from "@angular/router";
import { Component, OnInit, OnDestroy, ViewChild } from "@angular/core";
import {
  View,
  Protocol,
  Account,
  Endpoint,
  Asset,
  ConnectData,
  ConnectionToken,
} from "@app/model";
import {
  ViewService,
  HttpService,
  AppService,
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

  public sid: string = "";
  public iframeURL: string = "";
  public endpointUrl: string = "";
  public totalConnectTime: string = "00:00:00";
  public isActive: boolean = true;

  private timerInterval: any;
  private pausedElapsedTime: number = 0;

  constructor(
    private route: ActivatedRoute,
    private viewSrv: ViewService,
    private _http: HttpService,
    private _appSvc: AppService,
    private _dialogAlert: DialogService,
    private _i18n: I18nService,
    private _logger: LogService
  ) {
    this.startTime = new Date();
  }

  ngOnInit(): void {
    this.route.params.subscribe(async (params: Params) => {
      this.sid = params["sid"];
      await this.getAssetDetail();
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
  }

  private async getAssetDetail() {
    this._http.getAssetDetail(this.sid).subscribe(async (asset: Asset) => {
      const specialAliases = ["@ANON", "@USER", "@INPUT"];

      let method: string = "";

      const protocol: Protocol = asset.permed_protocols[0];
      const accountToUse = asset.permed_accounts.filter((account: Account) => {
        return !specialAliases.includes(account.alias);
      });

      if (!accountToUse) {
        const msg = await this._i18n.t("No valid account found");
        await this._dialogAlert.alert(msg);
        return;
      }

      console.log("🚀 ~ PagePamGUIComponent ~ accountToUse:", accountToUse);

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

      this._http
        .createDirectiveConnectToken(
          {
            asset: asset.id,
            account: accountToUse[0].name,
            protocol: protocol,
            input_username: accountToUse[0].username,
            input_secret: "",
          },
          method
        )
        .subscribe((res) => {
          console.log(res);
        });
    });
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

  ngOnDestroy() {
    this.stopTimer();
  }

  public closeDrawer() {
    this.sidenav.close();
  }
}
