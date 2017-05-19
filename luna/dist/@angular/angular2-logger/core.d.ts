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
export declare const OFF_LOGGER_PROVIDERS: any[];
export declare const ERROR_LOGGER_PROVIDERS: any[];
export declare const WARN_LOGGER_PROVIDERS: any[];
export declare const INFO_LOGGER_PROVIDERS: any[];
export declare const DEBUG_LOGGER_PROVIDERS: any[];
export declare const LOG_LOGGER_PROVIDERS: any[];
