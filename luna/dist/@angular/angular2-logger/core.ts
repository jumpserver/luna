import {provide} from "@angular/core";
import {Options, Logger} from "./app/core/logger";
import {Level} from "./app/core/level";

/**
 * @module
 * @description
 * Public API.
 */
export * from "./app/core/level";
export * from "./app/core/logger";

/**
 * Custom Providers if the user wants to avoid some configuration for common scenarios.
 * @type {Provider|Logger[]}
 */
export const OFF_LOGGER_PROVIDERS: any[] = [ provide( Options, { useValue: { level: Level.OFF } } ), Logger ];
export const ERROR_LOGGER_PROVIDERS: any[] = [ provide( Options, { useValue: { level: Level.ERROR } } ), Logger ];
export const WARN_LOGGER_PROVIDERS: any[] = [ provide( Options, { useValue: { level: Level.WARN } } ), Logger ];
export const INFO_LOGGER_PROVIDERS: any[] = [ provide( Options, { useValue: { level: Level.INFO } } ), Logger ];
export const DEBUG_LOGGER_PROVIDERS: any[] = [ provide( Options, { useValue: { level: Level.DEBUG } } ), Logger ];
export const LOG_LOGGER_PROVIDERS: any[] = [ provide( Options, { useValue: { level: Level.LOG } } ), Logger ];