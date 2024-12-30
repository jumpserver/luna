import { ActivatedRoute } from "@angular/router";
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
    private _logger: LogService,
    private route: ActivatedRoute
  ) {
    this.checkPageVisibility();
    this.startTime = new Date();
  }

  public isActive: boolean = true;
  public iframeWindow: Window;

  public userId: string = "";
  public username: string = "";
  public assetId: string = "";
  public assetName: string = "";

  public connectType: string = "SSH";
  public totalConnectTime: string;

  iframeURL: string;

  private pausedElapsedTime: number = 0;
  private isTimerPaused: boolean = false;

  private startTime: Date;
  private timerInterval: any;

  async ngOnInit(): Promise<any> {
    this.route.params.subscribe(async (params) => {
      this.userId = params["userId"];
      this.username = params["username"];
      this.assetId = params["assetId"];
      this.assetName = params["assetName"];

      this._http
        .getAssetDetail(this.assetId)
        .subscribe(async (asset: Asset) => {
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

                this.iframeURL = `${url}/koko/connect?token=${res.id}`;
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
  }

  public handleCloseConnect() {
    window.confirm("确定要关闭当前连接吗?");

    window.close();
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

  private checkPageVisibility() {
    this.isActive = !document.hidden;
  }

  private padZero(value: number): string {
    return String(value).padStart(2, "0");
  }

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
    this.timerInterval = setInterval(() => this.updateConnectTime(), 1000);
  }

  private stopTimer(): void {
    clearInterval(this.timerInterval);
    this.isTimerPaused = true;
  }

  ngOnDestroy(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }
}
