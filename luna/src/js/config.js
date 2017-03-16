/**
 * Created by liuzheng on 7/9/16.
 */
/**
 * System configuration for Angular 2 samples
 * Adjust as necessary for your application needs.
 */
(function (global) {
    // map tells the System loader where to look for things
    var map = {
        'index': 'ts', // 'dist',
        '@angular': '@angular',
        // 'angular2-in-memory-web-api': 'node_modules/angular2-in-memory-web-api',
        // 'rxjs': 'node_modules/rxjs',
        'ng2-cookies': '@angular/ng2-cookies',
        'angular2-logger': '@angular/angular2-logger',
        'angular2-tree-component': 'angular2-tree-component',
        'lodash': 'lodash'

        // 'angular2-websocket': 'node_modules/angular2-websocket'
    };
    // packages tells the System loader how to load when no filename and/or no extension
    var packages = {
        'index': {main: 'index.js', defaultExtension: 'js'},
        // 'rxjs': {defaultExtension: 'js'},
        // 'angular2-in-memory-web-api': {main: 'index.js', defaultExtension: 'js'},
        'ng2-cookies': {main: 'ng2-cookies.js', defaultExtension: 'js'},
        'angular2-logger': {main: 'bundles/angular2-logger.min.js', defaultExtension: 'js'},
        'angular2-tree-component': {main: 'dist/angular2-tree-component.js', defaultExtension: 'js'},
        'lodash': {main: 'lodash.js', defaultExtension: 'js'}
        // 'angular2-websocket': {main: 'angular2-websocket.js', defaultExtension: 'js'},
    };
    var ngPackageNames = [
        'common',
        'compiler',
        'core',
        'forms',
        'http',
        'platform-browser',
        'platform-browser-dynamic',
        'router',
        'router-deprecated',
        'upgrade',
    ];
    // Individual files (~300 requests):
    function packIndex(pkgName) {
        packages['@angular/' + pkgName] = {main: 'index.js', defaultExtension: 'js'};
    }

    // Bundled (~40 requests):
    function packUmd(pkgName) {
        packages['@angular/' + pkgName] = {main: '/bundles/' + pkgName + '.umd.js', defaultExtension: 'js'};
    }

    // Most environments should use UMD; some (Karma) need the individual index files
    var setPackageConfig = System.packageWithIndex ? packIndex : packUmd;
    // Add package entries for angular packages
    ngPackageNames.forEach(setPackageConfig);
    var config = {
        map: map,
        packages: packages
    };
    System.config(config);
})(this);
System.import('index').catch(function (err) {
    console.error(err);
});