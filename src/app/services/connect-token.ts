import {Injectable} from '@angular/core';
import {Asset, ConnectData, ConnectionToken} from '@app/model';
import {ElementACLDialogComponent} from '@app/elements/connect/acl-dialog/acl-dialog.component';
import {HttpService} from '@app/services/http';
import {MatDialog} from '@angular/material';

@Injectable()
export class ConnectTokenService {
  constructor(private _http: HttpService,
              private _dialog: MatDialog
  ) {}

  handleError(data, resolve) {
    const dialogRef = this._dialog.open(ElementACLDialogComponent, {
      height: 'auto',
      width: '450px',
      disableClose: true,
      data: data,
    });
    dialogRef.afterClosed().subscribe(token => {
      resolve(token);
    });
  }

  create(asset: Asset, connectInfo: ConnectData): Promise<ConnectionToken> {
    return new Promise<ConnectionToken>((resolve, reject) => {
      this._http.createConnectToken(asset, connectInfo).subscribe(
        (token: ConnectionToken) => {resolve(token);},
        (error) => {
          this.handleError({asset, connectInfo, code: error.error.code, tokenAction: 'create'}, resolve)
        }
      );
    });
  }

  exchange(connectToken) {
    return new Promise<ConnectionToken>((resolve, reject) => {
      this._http.exchangeConnectToken(connectToken.id).subscribe(
        (token: ConnectionToken) => { resolve(token); },
        (error) => {
          this.handleError({tokenID: connectToken.id, code: error.error.code, tokenAction: 'exchange'}, resolve)
        }
      );
    });
  }
}
