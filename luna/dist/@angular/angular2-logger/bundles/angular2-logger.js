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
System.register("angular2-logger/app/core/level", [], function(exports_1, context_1) {
    "use strict";
    var __moduleName = context_1 && context_1.id;
    var Level;
    return {
        setters:[],
        execute: function() {
            (function (Level) {
                Level[Level["OFF"] = 0] = "OFF";
                Level[Level["ERROR"] = 1] = "ERROR";
                Level[Level["WARN"] = 2] = "WARN";
                Level[Level["INFO"] = 3] = "INFO";
                Level[Level["DEBUG"] = 4] = "DEBUG";
                Level[Level["LOG"] = 5] = "LOG";
            })(Level || (Level = {}));
            exports_1("Level", Level);
        }
    }
});
System.register("angular2-logger/app/core/logger", ["@angular/core", "angular2-logger/app/core/level"], function(exports_2, context_2) {
    "use strict";
    var __moduleName = context_2 && context_2.id;
    var core_1, level_1;
    var Options, DEFAULT_OPTIONS, Logger;
    return {
        setters:[
            function (core_1_1) {
                core_1 = core_1_1;
            },
            function (level_1_1) {
                level_1 = level_1_1;
            }],
        execute: function() {
            Options = (function () {
                function Options() {
                }
                return Options;
            }());
            exports_2("Options", Options);
            DEFAULT_OPTIONS = {
                level: level_1.Level.WARN,
                global: true,
                globalAs: "logger",
                store: false,
                storeAs: "angular2.logger.level"
            };
            Logger = (function () {
                function Logger(options) {
                    var _this = this;
                    this.Level = level_1.Level;
                    this._loadLevel = function () { return localStorage.getItem(_this._storeAs); };
                    this.global = function () { return window[_this._globalAs] = _this; };
                    this.isErrorEnabled = function () { return _this.level >= level_1.Level.ERROR; };
                    this.isWarnEnabled = function () { return _this.level >= level_1.Level.WARN; };
                    this.isInfoEnabled = function () { return _this.level >= level_1.Level.INFO; };
                    this.isDebugEnabled = function () { return _this.level >= level_1.Level.DEBUG; };
                    this.isLogEnabled = function () { return _this.level >= level_1.Level.LOG; };
                    var _a = Object.assign({}, DEFAULT_OPTIONS, options), level = _a.level, global = _a.global, globalAs = _a.globalAs, store = _a.store, storeAs = _a.storeAs;
                    this._level = level;
                    this._globalAs = globalAs;
                    this._storeAs = storeAs;
                    global && this.global();
                    if (store || this._loadLevel())
                        this.store();
                }
                Logger.prototype._storeLevel = function (level) { localStorage[this._storeAs] = level; };
                Logger.prototype.error = function (message) {
                    var optionalParams = [];
                    for (var _i = 1; _i < arguments.length; _i++) {
                        optionalParams[_i - 1] = arguments[_i];
                    }
                    this.isErrorEnabled() && console.error.apply(console, arguments);
                };
                Logger.prototype.warn = function (message) {
                    var optionalParams = [];
                    for (var _i = 1; _i < arguments.length; _i++) {
                        optionalParams[_i - 1] = arguments[_i];
                    }
                    this.isWarnEnabled() && console.warn.apply(console, arguments);
                };
                Logger.prototype.info = function (message) {
                    var optionalParams = [];
                    for (var _i = 1; _i < arguments.length; _i++) {
                        optionalParams[_i - 1] = arguments[_i];
                    }
                    this.isInfoEnabled() && console.info.apply(console, arguments);
                };
                Logger.prototype.debug = function (message) {
                    var optionalParams = [];
                    for (var _i = 1; _i < arguments.length; _i++) {
                        optionalParams[_i - 1] = arguments[_i];
                    }
                    this.isDebugEnabled() && console.debug.apply(console, arguments);
                };
                Logger.prototype.log = function (message) {
                    var optionalParams = [];
                    for (var _i = 1; _i < arguments.length; _i++) {
                        optionalParams[_i - 1] = arguments[_i];
                    }
                    this.isLogEnabled() && console.log.apply(console, arguments);
                };
                Logger.prototype.store = function () {
                    this._store = true;
                    var storedLevel = this._loadLevel();
                    if (storedLevel) {
                        this._level = storedLevel;
                    }
                    else {
                        this._storeLevel(this.level);
                    }
                    return this;
                };
                Logger.prototype.unstore = function () {
                    this._store = false;
                    localStorage.removeItem(this._storeAs);
                    return this;
                };
                Object.defineProperty(Logger.prototype, "level", {
                    get: function () { return this._level; },
                    set: function (level) {
                        this._store && this._storeLevel(level);
                        this._level = level;
                    },
                    enumerable: true,
                    configurable: true
                });
                Logger = __decorate([
                    core_1.Injectable(),
                    __param(0, core_1.Optional()), 
                    __metadata('design:paramtypes', [Options])
                ], Logger);
                return Logger;
            }());
            exports_2("Logger", Logger);
        }
    }
});
System.register("angular2-logger/core", ["@angular/core", "angular2-logger/app/core/logger", "angular2-logger/app/core/level"], function(exports_3, context_3) {
    "use strict";
    var __moduleName = context_3 && context_3.id;
    var core_2, logger_1, level_2;
    var OFF_LOGGER_PROVIDERS, ERROR_LOGGER_PROVIDERS, WARN_LOGGER_PROVIDERS, INFO_LOGGER_PROVIDERS, DEBUG_LOGGER_PROVIDERS, LOG_LOGGER_PROVIDERS;
    var exportedNames_1 = {
        'OFF_LOGGER_PROVIDERS': true,
        'ERROR_LOGGER_PROVIDERS': true,
        'WARN_LOGGER_PROVIDERS': true,
        'INFO_LOGGER_PROVIDERS': true,
        'DEBUG_LOGGER_PROVIDERS': true,
        'LOG_LOGGER_PROVIDERS': true
    };
    function exportStar_1(m) {
        var exports = {};
        for(var n in m) {
            if (n !== "default"&& !exportedNames_1.hasOwnProperty(n)) exports[n] = m[n];
        }
        exports_3(exports);
    }
    return {
        setters:[
            function (core_2_1) {
                core_2 = core_2_1;
            },
            function (logger_1_1) {
                logger_1 = logger_1_1;
                exportStar_1(logger_1_1);
            },
            function (level_2_1) {
                level_2 = level_2_1;
                exportStar_1(level_2_1);
            }],
        execute: function() {
            exports_3("OFF_LOGGER_PROVIDERS", OFF_LOGGER_PROVIDERS = [core_2.provide(logger_1.Options, { useValue: { level: level_2.Level.OFF } }), logger_1.Logger]);
            exports_3("ERROR_LOGGER_PROVIDERS", ERROR_LOGGER_PROVIDERS = [core_2.provide(logger_1.Options, { useValue: { level: level_2.Level.ERROR } }), logger_1.Logger]);
            exports_3("WARN_LOGGER_PROVIDERS", WARN_LOGGER_PROVIDERS = [core_2.provide(logger_1.Options, { useValue: { level: level_2.Level.WARN } }), logger_1.Logger]);
            exports_3("INFO_LOGGER_PROVIDERS", INFO_LOGGER_PROVIDERS = [core_2.provide(logger_1.Options, { useValue: { level: level_2.Level.INFO } }), logger_1.Logger]);
            exports_3("DEBUG_LOGGER_PROVIDERS", DEBUG_LOGGER_PROVIDERS = [core_2.provide(logger_1.Options, { useValue: { level: level_2.Level.DEBUG } }), logger_1.Logger]);
            exports_3("LOG_LOGGER_PROVIDERS", LOG_LOGGER_PROVIDERS = [core_2.provide(logger_1.Options, { useValue: { level: level_2.Level.LOG } }), logger_1.Logger]);
        }
    }
});
//# sourceMappingURL=angular2-logger.js.map