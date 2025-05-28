import {Component, Input, OnInit} from '@angular/core';
import {ConnectionToken} from '@app/model';
import {ConnectTokenService, HttpService, I18nService} from '@app/services';
import {NzNotificationService} from 'ng-zorro-antd/notification';
import {Command, InfoItem} from './model';


@Component({
  standalone: false,
  selector: 'elements-connector-guide',
  templateUrl: 'guide.component.html',
  styleUrls: ['guide.component.scss']
})

export class ElementConnectorGuideComponent implements OnInit {
  @Input() assetType: string;
  @Input() canReuse: boolean;
  @Input() token: ConnectionToken;
  @Input() infoItems: Array<InfoItem>;
  @Input() commands: Array<Command>;
  passwordMask = '******';
  passwordShow = '******';
  hoverClipTip: string = this._i18n.instant('Click to copy');
  showClient = false;
  reusable = false;

  constructor(private _http: HttpService,
              private _i18n: I18nService,
              private _toastr: NzNotificationService,
              private _connectTokenSvc: ConnectTokenService,
  ) {
  }

  async ngOnInit() {
  }

  setReusable() {
    this._connectTokenSvc.setReusable(this.token, this.reusable).subscribe(
      res => {
        this.token = Object.assign(this.token, res);
        const tokenItem = this.infoItems.find(item => item.name === 'date_expired');
        tokenItem.value = `${this.token.date_expired}`;
      },
      error => {
        this.token.is_reusable = !this.reusable;

        let msg = '';
        if (error.status === 404) {
          msg = this._i18n.instant('Token expired');
        } else {
          msg = error.error.msg || error.error.is_reusable || error.message;
        }
        this._toastr.error(msg, '', {nzDuration: 2000});
      }
    );
  }

  startClient(cmd) {
    this._http.getLocalClientUrlAndSetCommand(this.token, cmd.value)
      .then((res: any) => {
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
    const msg = await this._i18n.t('Copied');
    this._toastr.success(msg, '');
  }

  onHoverClipRef(evt) {
    this.hoverClipTip = this._i18n.instant('Click to copy');
  }
}
