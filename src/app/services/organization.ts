import {EventEmitter, Injectable} from '@angular/core';
import {Subject, Observable} from 'rxjs';

@Injectable()
export class OrganizationService {
  user: EventEmitter<{}> = new EventEmitter<{}>();
  private _change: Subject<any> = new Subject<any>();

  constructor() {}

  public onSwitchOrganizationHandle(): void {
    this._change.next();
  }

  public emitSwitchOrganizationHandle(): Observable<any> {
    return this._change.asObservable();
  }
}
