import {Injectable} from '@angular/core';
import {Asset, ConnectData, ConnectionToken} from '@app/model';
import {HttpService} from '@app/services/http';
import {NzModalService} from 'ng-zorro-antd/modal';
import {ElementACLDialogComponent} from './acl-dialog/acl-dialog.component';

@Injectable()
export class ConnectTokenService {
  constructor(private _http: HttpService,
              private _dialog: NzModalService
  ) {
  }

  handleError(data, resolve) {
    const dialogRef = this._dialog.create({
      nzContent: ElementACLDialogComponent,
      nzWidth: '450px',
      nzCentered: true,
      nzData: {
        ...data
      }
    });
    dialogRef.afterClose.subscribe((token) => {
      resolve(token);
    });
  }

  create(asset: Asset, connectInfo: ConnectData): Promise<ConnectionToken> {
    return new Promise<ConnectionToken>((resolve, reject) => {
      this._http.createConnectToken(asset, connectInfo).subscribe(
        (token: ConnectionToken) => {
          resolve(token);
        },
        (error) => {
          this.handleError({asset, connectInfo, code: error.error.code, tokenAction: 'create', error: error}, resolve);
        }
      );
    });
  }

  exchange(connectToken) {
    return new Promise<ConnectionToken>((resolve, reject) => {
      this._http.exchangeConnectToken(connectToken.id).subscribe(
        (token: ConnectionToken) => {
          resolve(token);
        },
        (error) => {
          this.handleError({
            tokenID: connectToken.id,
            code: error.error.code,
            tokenAction: 'exchange',
            error: error
          }, resolve);
        }
      );
    });
  }

  setReusable(connectToken: ConnectionToken, reusable: Boolean) {
    const url = `/api/v1/authentication/connection-token/${connectToken.id}/reuse/`;
    const data = {is_reusable: reusable};
    return this._http.patch(url, data);
  }
}
