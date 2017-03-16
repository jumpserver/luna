/**
 * Created by liuzheng on 4/11/16.
 */
console.log('Welcome to use Jumpserver, and we are welcome to you to join us make it perfect. Github:https://github.com/jumpserver');
console.log('if you want to debug, please setloglevel in the console. e.g. setloglevel(5)');
function setloglevel(i) {
    loglevel = {
        "0": "OFF",
        "1": "ERROR",
        "2": "WARN",
        "3": "INFO",
        "4": "DEBUG",
        "5": "LOG"
    };
    document.cookie = 'loglevel=' + i + ';domain=.' + document.domain;
    return 'Log level is ' + loglevel[i]
}