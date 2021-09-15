import {Injectable} from '@angular/core';
import {NGXLogger} from 'ngx-logger';
import * as UUID from 'uuid-js/lib/uuid';

@Injectable()
export class LogService {
  level: number;

  constructor(private _logger: NGXLogger) {
    // 0.- Level.OFF
    // 1.- Level.ERROR
    // 2.- Level.WARN
    // 3.- Level.INFO
    // 4.- Level.DEBUG
    // 5.- Level.LOG
    this.level = 4;
  }

  log(message: any, ...additional: any[]) {
    if (this.level > 4) {
      this._logger.log(message, ...additional);
    }
  }

  debug(message: any, ...additional: any[]) {
    if (this.level > 3) {
      this._logger.debug(message, ...additional);
    }
  }

  info(message: any, ...additional: any[]) {
    if (this.level > 2) {
      this._logger.info(message, ...additional);
    }
  }

  warn(message: any, ...additional: any[]) {
    if (this.level > 1) {
      this._logger.warn(message, ...additional);
    }
  }

  error(message: any, ...additional: any[]) {
    if (this.level > 0) {
      this._logger.error(message, ...additional);
    }
  }

}

@Injectable()
export class LocalStorageService {
  constructor() {
  }

  get(key: string): any {
    let data = localStorage.getItem(key);
    if (!data) {
      return data;
    }
    try {
      data = JSON.parse(data);
      return data;
    } catch (e) {
      console.log('Error get local storage: ', e);
      return null;
    }
  }

  set(key: string, value: any) {
    try {
      const data = JSON.stringify(value);
      return localStorage.setItem(key, data);
    } catch (e) {
      console.log('Error set localstorage: ', e)
    }
  }

  delete(key: string) {
    return localStorage.removeItem(key);
  }
}



@Injectable()
export class UUIDService {
  constructor() {
  }

  gen() {
    return UUID.create()['hex'];
  }
}

