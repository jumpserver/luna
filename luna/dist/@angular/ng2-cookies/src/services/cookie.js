/**
 * Class Cookie - Holds static functions to deal with Cookies
 */
var Cookie = (function () {
    function Cookie() {
    }
    /**
     * Retrieves a single cookie by it's name
     *
     * @param  {string} name Identification of the Cookie
     * @returns The Cookie's value
     */
    Cookie.get = function (name) {
        var myWindow = window;
        name = myWindow.escape(name);
        var regexp = new RegExp('(?:^' + name + '|;\\s*' + name + ')=(.*?)(?:;|$)', 'g');
        var result = regexp.exec(document.cookie);
        return (result === null) ? null : myWindow.unescape(result[1]);
    };
    /**
     * Retrieves a a list of all cookie avaiable
     *
     * @returns Object with all Cookies
     */
    Cookie.getAll = function () {
        var cookies = {};
        if (document.cookie && document.cookie != '') {
            var split = document.cookie.split(';');
            for (var i = 0; i < split.length; i++) {
                var currCookie = split[i].split('=');
                currCookie[0] = currCookie[0].replace(/^ /, '');
                cookies[decodeURIComponent(currCookie[0])] = decodeURIComponent(currCookie[1]);
            }
        }
        return cookies;
    };
    /**
     * Save the Cookie
     *
     * @param  {string} name Cookie's identification
     * @param  {string} value Cookie's value
     * @param  {number} expires Cookie's expiration date in days from now. If it's undefined the cookie is a session Cookie
     * @param  {string} path Path relative to the domain where the cookie should be avaiable. Default /
     * @param  {string} domain Domain where the cookie should be avaiable. Default current domain
     */
    Cookie.set = function (name, value, expires, path, domain) {
        var myWindow = window;
        var cookieStr = myWindow.escape(name) + '=' + myWindow.escape(value) + ';';
        if (expires) {
            var dtExpires = new Date(new Date().getTime() + expires * 1000 * 60 * 60 * 24);
            cookieStr += 'expires=' + dtExpires.toUTCString() + ';';
        }
        if (path) {
            cookieStr += 'path=' + path + ';';
        }
        if (domain) {
            cookieStr += 'domain=' + domain + ';';
        }
        // console.log(cookieStr);
        document.cookie = cookieStr;
    };
    /**
     * Removes specified Cookie
     *
     * @param  {string} name Cookie's identification
     * @param  {string} path Path relative to the domain where the cookie should be avaiable. Default /
     * @param  {string} domain Domain where the cookie should be avaiable. Default current domain
     */
    Cookie.delete = function (name, path, domain) {
        // If the cookie exists
        if (Cookie.get(name)) {
            Cookie.set(name, '', -1, path, domain);
        }
    };
    /**
     * Delete all cookie avaiable
     */
    Cookie.deleteAll = function (path, domain) {
        var cookies = Cookie.getAll();
        for (var cookieName in cookies) {
            Cookie.delete(cookieName, path, domain);
        }
    };
    return Cookie;
})();
exports.Cookie = Cookie;
//# sourceMappingURL=cookie.js.map