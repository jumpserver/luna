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
export declare class Options {
    level: Level;
    global: boolean;
    globalAs: string;
    store: boolean;
    storeAs: string;
}
export declare class Logger {
    private _level;
    private _globalAs;
    private _store;
    private _storeAs;
    Level: any;
    constructor(options?: Options);
    private _loadLevel;
    private _storeLevel(level);
    error(message?: any, ...optionalParams: any[]): void;
    warn(message?: any, ...optionalParams: any[]): void;
    info(message?: any, ...optionalParams: any[]): void;
    debug(message?: any, ...optionalParams: any[]): void;
    log(message?: any, ...optionalParams: any[]): void;
    global: () => this;
    store(): Logger;
    unstore(): Logger;
    isErrorEnabled: () => boolean;
    isWarnEnabled: () => boolean;
    isInfoEnabled: () => boolean;
    isDebugEnabled: () => boolean;
    isLogEnabled: () => boolean;
    level: Level;
}
