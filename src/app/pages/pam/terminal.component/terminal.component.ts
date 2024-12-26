import { EMPTY, Observable } from "rxjs";
import { ActivatedRoute } from "@angular/router";
import { ICustomFile } from "file-input-accessor";
import { MatDialog } from "@angular/material/dialog";
import { MatSidenav } from "@angular/material/sidenav";
import {
  Account,
  Asset,
  ConnectData,
  ConnectionToken,
  View,
  Protocol,
} from "@app/model";
import {
  LogService,
  AppService,
  HttpService,
  I18nService,
  DialogService,
  ConnectTokenService,
} from "@app/services";
import {
  OnInit,
  Output,
  Component,
  ViewChild,
  OnDestroy,
  ElementRef,
  EventEmitter,
} from "@angular/core";

export interface PeriodicElement {
  name: string;
  size: string;
  modificationTime: string;
  attributes: string;
  action: object;
}

@Component({
  selector: "pages-pam-terminal",
  templateUrl: "./terminal.component.html",
  styleUrls: ["./terminal.component.scss"],
})
export class PagePamTerminalComponent implements OnInit, OnDestroy {
  @ViewChild("sidenav", { static: false }) sidenav: MatSidenav;
  @ViewChild("iFrame", { static: false }) iframeRef: ElementRef;
  @Output() onNewView: EventEmitter<View> = new EventEmitter<View>();

  constructor(
    private _http: HttpService,
    private _i18n: I18nService,
    private _dialog: MatDialog,
    private _appSvc: AppService,
    private _logger: LogService,
    private route: ActivatedRoute,
    private _dialogAlert: DialogService,
    private _connectTokenSvc: ConnectTokenService
  ) {
    this.checkPageVisibility();
    this.startTime = new Date();
  }

  public isActive: boolean = true;
  public iframeWindow: Window;

  public sid: string = "";
  public assetName: string = "";
  public connectType: string = "SSH";

  baseUrl: string;
  iframeURL: string;

  private pausedElapsedTime: number = 0;
  private isTimerPaused: boolean = false;

  public totalConnectTime: string;
  private startTime: Date;
  private timerInterval: any;

  manualChangesFiles: ICustomFile[] = [];

  displayedColumns: string[] = [
    "name",
    "size",
    "modification-time",
    "attributes",
    "action",
  ];

  async ngOnInit(): Promise<any> {
    this.updateConnectTime();

    this.route.params.subscribe(async (params) => {
      this.sid = params["sid"];

      await this.getAssetDetail();
    });

    this.startTimer();

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        console.log("Page is hidden");
        this.isActive = false;
        this.stopTimer();
        const currentTime = new Date().getTime();
        this.pausedElapsedTime += currentTime - this.startTime.getTime();
      } else {
        console.log("Page is visible");
        setTimeout(() => {
          this.isActive = true;
          this.startTime = new Date();
          this.startTimer();
        }, 0);
      }
    });
  }

  ngOnDestroy(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  /**
   * @description 获取链接资产信息
   */
  public getAssetDetail() {
    this._http.getAssetDetail(this.sid).subscribe(async (asset: Asset) => {
      const specialAliases = ["@ANON", "@USER", "@INPUT"];

      let method: string = "";

      console.log(
        "🚀 ~ PagePamTerminalComponent ~ this._http.getAssetDetail ~ asset:",
        asset
      );

      this.assetName = asset.name;

      const protocol: Protocol = asset.permed_protocols[0];
      const accountToUse = asset.permed_accounts.filter((account: Account) => {
        return !specialAliases.includes(account.alias);
      });

      if (!accountToUse) {
        const msg = await this._i18n.t("No valid account found");
        await this._dialogAlert.alert(msg);
        return;
      }

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
            protocol: protocol.name,
            input_username: accountToUse[0].username,
            input_secret: "",
          },
          method
        )
        .subscribe((res) => {
          if (res) {
            const url = this.getUrl();

            this.iframeURL = `${url}/koko/connect?token=${res.id}`;
          }
        });
    });
  }

  private getUrl(): string {
    let host: string = "";

    const endpoint = window.location.host.split(":")[0];
    const protocole = window.location.protocol;
    const port = "9530";

    if (port) {
      host = `${endpoint}:${port}`;
    }

    this._logger.info(`Current host: ${protocole}//${host}`);

    return `${protocole}//${host}`;
  }

  private getToken(
    asset: Asset,
    connectInfo: ConnectData
  ): Promise<ConnectionToken> {
    return new Promise<ConnectionToken>((resolve, reject) => {
      this._http.adminConnectToken(asset, connectInfo).subscribe(
        (token: ConnectionToken) => {
          resolve(token);
        },
        async (error) => {
          this.stopTimer();
          this.isActive = false;

          const msg = await this._i18n.t("Connection failed, please try again");
          await this._dialogAlert.alert(msg);

          reject(error);
        }
      );
    });
  }

  /**
   * @description 校验信息并发起连接
   * @param asset
   */
  public async connectAsset(asset: any) {
    if (!asset) {
      const msg: string = await this._i18n.t(
        "Asset not found or You have no permission to access it, please refresh asset tree"
      );
      return await this._dialogAlert.alert(msg);
    }

    const connectInfo = {
      account: asset.permed_accounts[0],
      connectMethod: {
        value: "web_cli",
      },
      manualAuthInfo: {
        alias: asset.permed_accounts[0].alias,
        username: asset.permed_accounts[0].username,
      },
      connectOption: {
        appletConnectMethod: "web",
        backspaceAsCtrlH: false,
        charset: "default",
        disableautohash: false,
        resolution: "auto",
        reusable: false,
      },
      downloadRDP: false,
      autoLogin: false,
      protocol: {
        name: "ssh",
      },
    } as unknown as ConnectData;

    const connToken = await this.getToken(asset, connectInfo);

    console.log(connToken);

    if (!connToken) {
      return this._logger.info("Create connection token failed");
    }

    const view = new View(asset, connectInfo, connToken, "node");
    view.smartEndpoint = await this._appSvc.getSmartEndpoint(view);

    const { protocol, smartEndpoint } = view;

    const params = {};
    params["disableautohash"] = view.getConnectOption("disableautohash");
    params["token"] = connToken.id;

    params["_"] = Date.now().toString();

    const query = Object.entries(params)
      .map(([key, value]) => {
        return `${key}=${value}`;
      })
      .reduce((a, b) => {
        return `${a}&${b}`;
      });

    const baseUrl = smartEndpoint.getUrl();

    this.iframeURL = `${baseUrl}/koko/connect?${query}`;
  }

  public closeDrawer() {
    this.sidenav.close();
  }

  public handleOpenFileManage() {
    const iframeWindow = (this.iframeRef as unknown as { iframeWindow: Window })
      .iframeWindow;

    if (iframeWindow) {
      iframeWindow.postMessage({ name: "FILE" }, "*");
      this._logger.info(`[Luna] Send FILE`);
    }
  }

  private checkPageVisibility() {
    this.isActive = !document.hidden;
  }

  private padZero(value: number): string {
    return String(value).padStart(2, "0");
  }

  /**
   * @description 计算页面打开时间
   * @private
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

  private startTimer(): void {
    if (!this.isTimerPaused) {
      this.timerInterval = setInterval(() => this.updateConnectTime(), 1000);
    }
  }

  private stopTimer(): void {
    clearInterval(this.timerInterval);
    this.isTimerPaused = true;
  }
}
