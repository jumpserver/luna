import {Component, Input, OnInit, ViewChild} from '@angular/core';
import {ConnectionToken} from '@app/model';
import {ConnectTokenService, HttpService, I18nService, SettingService} from '@app/services';
import {ToastrService} from 'ngx-toastr';
import {MatTooltip} from '@angular/material/tooltip';
import {Command, InfoItem} from './model';


@Component({
  selector: 'elements-connector-guide',
  templateUrl: './guide.component.html',
  styleUrls: ['./guide.component.scss']
})

export class ElementConnectorGuideComponent implements OnInit {
  @Input() assetType: string;
  @Input() canReuse: boolean;
  @Input() token: ConnectionToken;
  @Input() infoItems: Array<InfoItem>;
  @Input() commands: Array<Command>;
  @ViewChild(MatTooltip, {static: false}) tooltip: MatTooltip;
  passwordMask = '******';
  passwordShow = '******';
  hoverClipTip: string = this._i18n.instant('Click to copy');

  constructor(private _http: HttpService,
              private _i18n: I18nService,
              private _toastr: ToastrService,
              private _connectTokenSvc: ConnectTokenService,
              private _settingSvc: SettingService
  ) {
  }

  async ngOnInit() {
  }

  setReusable(event) {
    this._connectTokenSvc.setReusable(this.token, event.checked).subscribe(
      res => {
        this.token = Object.assign(this.token, res);
        const tokenItem = this.infoItems.find(item => item.name === 'date_expired');
        tokenItem.value = `${this.token.date_expired}`;
      },
      error => {
        this.token.is_reusable = false;
        this._toastr.error(error.error.msg || error.error.is_reusable || error.message);
      }
    );
  }

  startClient(cmd) {
    this._http.getLocalClientUrlAndSetCommand(this.token, cmd.value).then((res: any) => {
      window.open(res.url);
    });
  }

  showPassword($event) {
    $event.stopPropagation();
    if (this.passwordShow === this.passwordMask) {
      const passwordItem = this.infoItems.find(item => item.name === 'password');
      this.passwordShow = passwordItem.value;
    } else {
      this.passwordShow = this.passwordMask;
    }
  }

  async onCopySuccess(evt) {
    this.hoverClipTip = this._i18n.instant('Copied');
  }

  onHoverClipRef(evt) {
    this.hoverClipTip = this._i18n.instant('Click to copy');
  }
}
