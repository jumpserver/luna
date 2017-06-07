/**
 * Created by liuzheng on 7/12/16.
 */
"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var core_1 = require('@angular/core');
var core_2 = require("angular2-logger/core");
require('rxjs/Rx');
var service_1 = require('./service');
var SearchBar = (function () {
    function SearchBar(_appService, _logger) {
        this._appService = _appService;
        this._logger = _logger;
        this._logger.log('LeftbarComponent.ts:SearchBar');
    }
    SearchBar.prototype.ngOnChanges = function (changes) {
        this.q = changes.input.currentValue;
    };
    SearchBar.prototype.modelChange = function ($event) {
        this._appService.Search(this.q);
    };
    __decorate([
        core_1.Input(), 
        __metadata('design:type', Object)
    ], SearchBar.prototype, "input", void 0);
    SearchBar = __decorate([
        core_1.Component({
            selector: 'search-bar',
            template: "<input class=\"left-search\" placeholder=\" Search ...\" maxlength=\"2048\" name=\"q\" autocomplete=\"off\" title=\"Search\"\n       type=\"text\" tabindex=\"1\" spellcheck=\"false\" autofocus [(ngModel)]=\"q\" (keyup.enter)=\"search()\"\n       (ngModelChange)=\"modelChange($event)\">"
        }), 
        __metadata('design:paramtypes', [service_1.AppService, core_2.Logger])
    ], SearchBar);
    return SearchBar;
}());
var UserList = (function () {
    function UserList(_appService, _logger) {
        this._appService = _appService;
        this._logger = _logger;
        this.DataStore = service_1.DataStore;
        this._logger.log('LeftbarComponent.ts:UserList');
    }
    UserList.prototype.ngOnInit = function () {
        debugger;
    };
    UserList.prototype.selectUser = function (serverInfo, index) {
        debugger;
        this.selectedUser = serverInfo.system_users[index];
        var param = {
            'assetId': serverInfo.id,
            'sysUserId': this.selectedUser['id'],
            'nickName': serverInfo.nickName,
            'ip': serverInfo.ip,
            'port': serverInfo.port,
        };
        service_1.DataStore.termlist.push(param);
        service_1.DataStore.loguserlist = [];
        service_1.DataStore.loguserInfo = {};
    };
    UserList = __decorate([
        core_1.Component({
            selector: 'select-user-panel',
            template: "<div class=\"select-user-panel\" *ngIf=\"DataStore.loguserlist.length\"><h2>\u9009\u62E9\u8981\u767B\u5F55\u7684\u8D26\u6237</h2>\n        <div class=\"log-user\" *ngFor=\"let user of DataStore.loguserlist; let i = index\" (click)=\"selectUser(DataStore.loguserInfo, i)\">\n            {{i+1}}: {{user.name}}\n        </div></div>"
        }), 
        __metadata('design:paramtypes', [service_1.AppService, core_2.Logger])
    ], UserList);
    return UserList;
}());
var LeftbarComponent = (function () {
    function LeftbarComponent(_appService, _logger) {
        this._appService = _appService;
        this._logger = _logger;
        this.DataStore = service_1.DataStore;
        this._logger.log('LeftbarComponent.ts:LeftbarComponent');
        this._logger.debug("check DataStroe.leftbar", service_1.DataStore.leftbar);
    }
    LeftbarComponent.prototype.ngOnInit = function () {
        this._logger.log('LeftbarComponent.ts:LeftbarComponent,ngOnInit');
    };
    LeftbarComponent.prototype.ngAfterViewInit = function () {
        this._logger.log('LeftbarComponent.ts:LeftbarComponent,ngAfterViewInit');
        jQuery("#left-bar").fancytree({
            extensions: ["glyph"],
            glyph: {
                map: {
                    checkbox: "fa fa-square-o",
                    checkboxSelected: "fa fa-check-square-o",
                    checkboxUnknown: "fa fa-square",
                    dragHelper: "fa fa-arrow-right",
                    dropMarker: "fa fa-long-arrow-right",
                    error: "fa fa-warning",
                    expanderClosed: "fa fa-caret-right",
                    expanderLazy: "fa fa-angle-right",
                    expanderOpen: "fa fa-caret-down",
                    nodata: "fa fa-meh-o",
                    loading: "fa fa-spinner fa-pulse",
                    // Default node icons.
                    // (Use tree.options.icon callback to define custom icons based on node data)
                    doc: "fa fa-file",
                    docOpen: "fa fa-file-o",
                    folder: "fa fa-folder",
                    folderOpen: "fa fa-folder-open-o"
                }
            },
            source: {
                url: service_1.DataStore.leftbar
            },
            activeVisible: true,
            aria: true,
            autoActivate: true,
            autoCollapse: true,
            autoScroll: true,
            clickFolderMode: 3,
            checkbox: false,
            debugLevel: 0,
            disabled: false,
            focusOnSelect: true,
            escapeTitles: false,
            generateIds: true,
            idPrefix: "ft_",
            icon: true,
            // icon: function (event, data) {
            //     if (data.node.isFolder()) {
            //         return "glyphicon glyphicon-book";
            //     }
            // },
            keyboard: false,
            keyPathSeparator: "/",
            minExpandLevel: 1,
            quicksearch: true,
            selectMode: 3,
            tabindex: "0",
            titlesTabbable: false,
            dblclick: function (event, data) {
                debugger;
                console.log('leftbar dbclick', event, data);
                if (!data.node.folder) {
                    if (data.node.data.system_users && data.node.data.system_users.length > 1) {
                        service_1.DataStore.loguserlist = data.node.data.system_users;
                        service_1.DataStore.loguserInfo = jQuery.extend({}, data.node.data, {
                            'nickName': data.node.title
                        });
                        debugger;
                    }
                    else {
                        if (data.node.data.system_users && data.node.data.system_users.length > 0) {
                            var param = {
                                'assetId': data.node.data.id,
                                'sysUserId': data.node.data.system_users[0].id,
                                'nickName': data.node.title,
                                'ip': data.node.data.ip,
                                'port': data.node.data.port,
                            };
                            service_1.DataStore.termlist.push(param);
                            debugger;
                        }
                    }
                }
            }
        });
        jQuery("#left-bar").contextmenu({
            delegate: "span.fancytree-title",
            hide: {
                effect: "basic",
                duration: "slow"
            },
            menu: [{
                    "title": "Cut",
                    "cmd": "cut",
                    "uiIcon": "fa fa-cut fa-size-1p3em"
                }, {
                    "title": "Copy",
                    "cmd": "copy",
                    "uiIcon": "fa fa-copy fa-size-1p3em"
                }, {
                    "title": "Paste",
                    "cmd": "paste",
                    "uiIcon": "fa fa-paste fa-size-1p3em",
                    "disabled": false
                }, {
                    "title": "----"
                }, {
                    "title": "Edit",
                    "cmd": "edit",
                    "uiIcon": "fa fa-edit fa-size-1p3em",
                    "disabled": true
                }, {
                    "title": "Delete",
                    "cmd": "delete",
                    "uiIcon": "fa fa-trash fa-size-1p3em",
                    "disabled": true
                }, {
                    "title": "More",
                    "uiIcon": "fa fa-caret-right fa-size-1p3em",
                    "children": [{
                            "title": "Sub 1",
                            "cmd": "sub1"
                        }, {
                            "title": "Sub 2",
                            "cmd": "sub1"
                        }]
                }],
            beforeOpen: function (event, ui) {
                var node = jQuery.ui.fancytree.getNode(ui.target[0]);
                // Modify menu entries depending on node status
                jQuery("#left-bar").contextmenu("enableEntry", "paste", node.isFolder());
                // Show/hide single entries
                // Activate node on right-click
                node.setActive();
            },
            select: function (event, ui) {
                var node = jQuery.ui.fancytree.getNode(ui.target[0]);
                alert("select " + ui.cmd + " on " + node);
            }
        });
    };
    LeftbarComponent.prototype.getSelect = function () {
        jQuery('#left-bar').fancytree('getTree').getSelectedNodes();
    };
    LeftbarComponent.prototype.Hide = function () {
        this._appService.HideLeft();
    };
    LeftbarComponent = __decorate([
        core_1.Component({
            selector: 'div',
            template: "<div style=\"height:30px;width:100%;background-color: #00b3ee\">\n    <search-bar></search-bar><select-user-panel></select-user-panel></div>",
            directives: [SearchBar, UserList],
        }), 
        __metadata('design:paramtypes', [service_1.AppService, core_2.Logger])
    ], LeftbarComponent);
    return LeftbarComponent;
}());
exports.LeftbarComponent = LeftbarComponent;
//# sourceMappingURL=leftbar.js.map