/**
 * Created by Langley on 3/13/2016.
 */
"use strict";
/**
 * The available options to set the Level of the Logger.
 * See {@link Logger}.
 */
(function (Level) {
    Level[Level["OFF"] = 0] = "OFF";
    Level[Level["ERROR"] = 1] = "ERROR";
    Level[Level["WARN"] = 2] = "WARN";
    Level[Level["INFO"] = 3] = "INFO";
    Level[Level["DEBUG"] = 4] = "DEBUG";
    Level[Level["LOG"] = 5] = "LOG";
})(exports.Level || (exports.Level = {}));
var Level = exports.Level;
//# sourceMappingURL=level.js.map