import {EventEmitter, Injectable} from '@angular/core';
import {NavEvt} from '@app/model';

import {LocalStorageService} from './share';


@Injectable()
export class NavService {
  onNavClick: EventEmitter<NavEvt> = new EventEmitter<NavEvt>();

  constructor(private store: LocalStorageService) {}

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

  get treeLoadAsync() {
    const value = this.store.get('LoadTreeAsync');
    return value === '1';
  }

  set treeLoadAsync(v: boolean) {
    const value = v ? '1' : '0';
    this.store.set('LoadTreeAsync', value);
  }

  get skipAllManualPassword() {
    const value = this.store.get('SkipAllManualPassword');
    return value === '1';
  }

  set skipAllManualPassword(v) {
    const value = v ? '1' : '0';
    this.store.set('SkipAllManualPassword', value);
  }
}
