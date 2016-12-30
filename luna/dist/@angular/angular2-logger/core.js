"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
var core_1 = require("@angular/core");
var logger_1 = require("./app/core/logger");
var level_1 = require("./app/core/level");
/**
 * @module
 * @description
 * Public API.
 */
__export(require("./app/core/level"));
__export(require("./app/core/logger"));
/**
 * Custom Providers if the user wants to avoid some configuration for common scenarios.
 * @type {Provider|Logger[]}
 */
exports.OFF_LOGGER_PROVIDERS = [core_1.provide(logger_1.Options, { useValue: { level: level_1.Level.OFF } }), logger_1.Logger];
exports.ERROR_LOGGER_PROVIDERS = [core_1.provide(logger_1.Options, { useValue: { level: level_1.Level.ERROR } }), logger_1.Logger];
exports.WARN_LOGGER_PROVIDERS = [core_1.provide(logger_1.Options, { useValue: { level: level_1.Level.WARN } }), logger_1.Logger];
exports.INFO_LOGGER_PROVIDERS = [core_1.provide(logger_1.Options, { useValue: { level: level_1.Level.INFO } }), logger_1.Logger];
exports.DEBUG_LOGGER_PROVIDERS = [core_1.provide(logger_1.Options, { useValue: { level: level_1.Level.DEBUG } }), logger_1.Logger];
exports.LOG_LOGGER_PROVIDERS = [core_1.provide(logger_1.Options, { useValue: { level: level_1.Level.LOG } }), logger_1.Logger];
//# sourceMappingURL=core.js.map