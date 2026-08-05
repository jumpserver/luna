import {Injectable} from '@angular/core';
import {Asset, ConnectData, ConnectionToken} from '@app/model';
import {HttpService} from '@app/services/http';
import {NzModalRef, NzModalService} from 'ng-zorro-antd/modal';
import {ElementACLDialogComponent} from './acl-dialog/acl-dialog.component';
import {ElementBatchACLDialogComponent} from './batch-acl-dialog/batch-acl-dialog.component';

@Injectable()
export class ConnectTokenService {
  private activeDialogs = new Map<string, NzModalRef<ElementBatchACLDialogComponent>>();

  constructor(private _http: HttpService,
              private _dialog: NzModalService
  ) {
  }

  handleError(data, resolve) {
    if (data.tokenAction === 'create' && data.asset) {
      const code = data.code || 'unknown';
      const activeDialog = this.activeDialogs.get(code);
      if (activeDialog) {
        const component = activeDialog.getContentComponent();
        if (component) {
          component.addItem({...data, resolve});
          return;
        }
        this.activeDialogs.delete(code);
      }
      const dialogRef = this._dialog.create({
        nzContent: ElementBatchACLDialogComponent,
        nzWidth: '680px',
        nzCentered: true,
        nzClosable: false,
        nzMaskClosable: false,
        nzData: {
          code,
          items: [{...data, resolve}]
        }
      });
      this.activeDialogs.set(code, dialogRef);
      dialogRef.afterClose.subscribe(() => {
        if (this.activeDialogs.get(code) === dialogRef) {
          this.activeDialogs.delete(code);
        }
      });
      return;
    }
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
