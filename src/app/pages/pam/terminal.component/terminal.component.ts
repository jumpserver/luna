import {
  Component,
  ElementRef,
  EventEmitter,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
} from "@angular/core";
import { MatSidenav } from "@angular/material/sidenav";
import { FormControl } from "@angular/forms";
import { EMPTY, Observable } from "rxjs";
import { ICustomFile } from "file-input-accessor";
import {
  AppService,
  ConnectTokenService,
  DialogService,
  HttpService,
  I18nService,
  LogService,
} from "@app/services";
import { ActivatedRoute } from "@angular/router";
import { Account, Asset, ConnectData, ConnectionToken, View } from "@app/model";
import { MatDialog } from "@angular/material/dialog";

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
  }
  @ViewChild("sidenav", { static: false }) sidenav: MatSidenav;
  @ViewChild("iFrame", { static: false }) iframeRef: ElementRef;
  @Output() onNewView: EventEmitter<View> = new EventEmitter<View>();

  public isActive: boolean = true;
  public iframeWindow: Window;
  public connectType: string = "SSH";
  public sid: string = "";

  baseUrl: string;
  iframeURL: string;

  private pausedElapsedTime: number = 0;
  private isTimerPaused: boolean = false;

  public totalConnectTime: string;
  private startTime: Date;
  private timerInterval: any;
  hasLoginTo = false;

  fileControl = new FormControl();
  manualChangesFiles: ICustomFile[] = [];

  displayedColumns: string[] = [
    "name",
    "size",
    "modification-time",
    "attributes",
    "action",
  ];

  async ngOnInit(): Promise<any> {
    this.baseUrl = `http:localhost:9530/koko`;
    this.startTime = new Date();
    this.updateConnectTime();

    this.startTimer();

    this.route.params.subscribe((params) => {
      this.sid = params["sid"];
    });

    await this.getAssetDetail();

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

  private uploadFiles(files: ICustomFile[]): Observable<Object> {
    if (!files || files.length === 0) {
      return EMPTY;
    }

    const data = new FormData();

    for (const file of files) {
      data.append("file", file.slice(), file.name);
    }
    return this._http.post("/api/files", data);
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

  private padZero(value: number): string {
    return String(value).padStart(2, "0");
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

    // todo)) 有些默认数据可能不对
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

  /**
   * @description 获取链接资产信息
   */
  public getAssetDetail() {
    this._http.getAssetDetail(this.sid).subscribe(async (asset) => {
      this._appSvc.setPreConnectData(asset, {
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
      } as unknown as ConnectData);

      await this.connectAsset(asset);
    });
  }

  public submitFiles() {
    this.uploadFiles(this.manualChangesFiles).subscribe(
      () => (this.manualChangesFiles = [])
    );
  }

  public closeDrawer() {
    this.sidenav.close();
  }

  public onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;

    if (input.files) {
      this.manualChangesFiles = Array.from(input.files);
      console.log(this.manualChangesFiles);

      this.submitFiles();
    }
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
}
