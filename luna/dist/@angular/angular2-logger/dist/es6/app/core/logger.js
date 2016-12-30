var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Injectable, Optional } from "@angular/core";
import { Level } from "./level";
/**
 * Logger options.
 * See {@link Logger}.
 *
 * level - How much detail you want to see in the logs, 1 being the less detailed, 5 being the most. Defaults to WARN.
 * global - Whether you want the created logger object to be exposed in the global scope. Defaults to true.
 * globalAs - The window's property name that will hold the logger object created. Defaults to 'logger'.
 * store - Whether you want the level config to be saved in the local storage so it doesn't get lost when you refresh. Defaults to false.
 * storeAs - The local storage key that will be used to save the level config if the store setting is true. Defaults to 'angular2.logger.level'.
 *
 * Created by Langley on 3/23/2016.
 *
 */
export class Options {
}
// Temporal until https://github.com/angular/angular/issues/7344 gets fixed.
const DEFAULT_OPTIONS = {
    level: Level.WARN,
    global: true,
    globalAs: "logger",
    store: false,
    storeAs: "angular2.logger.level"
};
export let Logger = class Logger {
    constructor(options) {
        this.Level = Level;
        this._loadLevel = () => localStorage.getItem(this._storeAs);
        this.global = () => window[this._globalAs] = this;
        this.isErrorEnabled = () => this.level >= Level.ERROR;
        this.isWarnEnabled = () => this.level >= Level.WARN;
        this.isInfoEnabled = () => this.level >= Level.INFO;
        this.isDebugEnabled = () => this.level >= Level.DEBUG;
        this.isLogEnabled = () => this.level >= Level.LOG;
        // Move this to the constructor definition when optional parameters are working with @Injectable: https://github.com/angular/angular/issues/7344
        let { level, global, globalAs, store, storeAs } = Object.assign({}, DEFAULT_OPTIONS, options);
        this._level = level;
        this._globalAs = globalAs;
        this._storeAs = storeAs;
        global && this.global();
        if (store || this._loadLevel())
            this.store();
    }
    _storeLevel(level) { localStorage[this._storeAs] = level; }
    error(message, ...optionalParams) {
        this.isErrorEnabled() && console.error.apply(console, arguments);
    }
    warn(message, ...optionalParams) {
        this.isWarnEnabled() && console.warn.apply(console, arguments);
    }
    info(message, ...optionalParams) {
        this.isInfoEnabled() && console.info.apply(console, arguments);
    }
    debug(message, ...optionalParams) {
        this.isDebugEnabled() && console.debug.apply(console, arguments);
    }
    log(message, ...optionalParams) {
        this.isLogEnabled() && console.log.apply(console, arguments);
    }
    store() {
        this._store = true;
        let storedLevel = this._loadLevel();
        if (storedLevel) {
            this._level = storedLevel;
        }
        else {
            this._storeLevel(this.level);
        }
        return this;
    }
    unstore() {
        this._store = false;
        localStorage.removeItem(this._storeAs);
        return this;
    }
    get level() { return this._level; }
    set level(level) {
        this._store && this._storeLevel(level);
        this._level = level;
    }
};
Logger = __decorate([
    Injectable(),
    __param(0, Optional()), 
    __metadata('design:paramtypes', [Options])
], Logger);
//# sourceMappingURL=logger.js.map