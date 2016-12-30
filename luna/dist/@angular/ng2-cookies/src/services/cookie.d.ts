/**
 * Class Cookie - Holds static functions to deal with Cookies
 */
export declare class Cookie {
    /**
     * Retrieves a single cookie by it's name
     *
     * @param  {string} name Identification of the Cookie
     * @returns The Cookie's value
     */
    static get(name: string): string;
    /**
     * Retrieves a a list of all cookie avaiable
     *
     * @returns Object with all Cookies
     */
    static getAll(): any;
    /**
     * Save the Cookie
     *
     * @param  {string} name Cookie's identification
     * @param  {string} value Cookie's value
     * @param  {number} expires Cookie's expiration date in days from now. If it's undefined the cookie is a session Cookie
     * @param  {string} path Path relative to the domain where the cookie should be avaiable. Default /
     * @param  {string} domain Domain where the cookie should be avaiable. Default current domain
     */
    static set(name: string, value: string, expires?: number, path?: string, domain?: string): void;
    /**
     * Removes specified Cookie
     *
     * @param  {string} name Cookie's identification
     * @param  {string} path Path relative to the domain where the cookie should be avaiable. Default /
     * @param  {string} domain Domain where the cookie should be avaiable. Default current domain
     */
    static delete(name: string, path?: string, domain?: string): void;
    /**
     * Delete all cookie avaiable
     */
    static deleteAll(path?: string, domain?: string): any;
}
