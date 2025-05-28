import {Component, Injectable, Input} from '@angular/core';
import {NzModalService} from 'ng-zorro-antd/modal';
import {I18nService} from '../i18n';


@Component({
  standalone: false,
  selector: 'elements-alert',
  templateUrl: 'alert.html',
  styleUrls: ['alert.scss']
})
export class ElementDialogAlertComponent {
  @Input() msg: string;
  @Input() title: string;
  @Input() type: string;
}

@Injectable()
export class AlertService {

  constructor(public _dialog: NzModalService,
              private _i18n: I18nService,
  ) {
  }

  error(msg: string, title: string = '') {
    this.alert(msg, title, 'error');
  }

  warning(msg: string, title: string = '') {
    this.alert(msg, title, 'warning');
  }

  alert(msg: string, title: string = '', type: string = 'info') {
    let nzTitle: string;
    switch (type) {
      case 'error':
        nzTitle = this._i18n.instant('Error');
        break;
      case 'warning':
        nzTitle = this._i18n.instant('Warning');
        break;
      default:
        nzTitle = this._i18n.instant('Info');
        break;
    }
    if (!title) {
      title = this._i18n.instant('Tips');
    }
    this._dialog.create({
      nzTitle: nzTitle,
      nzContent: ElementDialogAlertComponent,
      nzData: {
        msg: msg,
        title: title,
        type: type
      },
      nzCancelDisabled: true
    });
  }
}
