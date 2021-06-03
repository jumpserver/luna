import {EventEmitter, Injectable} from '@angular/core';
import {NavEvt} from '@app/model';

import {LocalStorageService} from './share';


@Injectable()
export class NavService {
  onNavClick: EventEmitter<NavEvt> = new EventEmitter<NavEvt>();

  constructor(private _localStorage: LocalStorageService) {}

  disconnectAllConnection() {
    const evt = new NavEvt('disconnectAll', '');
    this.onNavClick.emit(evt);
  }

  disconnectConnection() {
    const evt = new NavEvt('disconnect', '');
    this.onNavClick.emit(evt);
  }

  changeLang(value) {
    const evt = new NavEvt('changeLang', value);
    this.onNavClick.emit(evt);
  }
}
