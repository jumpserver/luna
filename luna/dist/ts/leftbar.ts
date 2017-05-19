/**
 * Created by liuzheng on 7/12/16.
 */

import {Component, OnChanges, OnInit, Input} from '@angular/core';
import {NgClass}    from '@angular/common';
import {ROUTER_DIRECTIVES} from '@angular/router-deprecated';
import {Logger} from "angular2-logger/core";

import  'rxjs/Rx';
declare var jQuery:any;

import {AppService, DataStore} from './service'

@Component({
    selector: 'search-bar',
    template: `<input class="left-search" placeholder=" Search ..." maxlength="2048" name="q" autocomplete="off" title="Search"
       type="text" tabindex="1" spellcheck="false" autofocus [(ngModel)]="q" (keyup.enter)="search()"
       (ngModelChange)="modelChange($event)">`
})
class SearchBar implements OnChanges {
    @Input() input;
    q:string;

    constructor(private _appService:AppService,
                private _logger:Logger) {
        this._logger.log('LeftbarComponent.ts:SearchBar');
    }

    ngOnChanges(changes) {
        this.q = changes.input.currentValue;
    }

    modelChange($event) {
        this._appService.Search(this.q)
    }
}
@Component({
    selector: 'select-user-panel',
    template: `<div class="select-user-panel" *ngIf="DataStore.loguserlist.length"><h2>选择要登录的账户</h2>
        <div class="log-user" *ngFor="let user of DataStore.loguserlist; let i = index" (click)="selectUser(DataStore.loguserInfo, i)">
            {{i+1}}: {{user.name}}
        </div></div>`
})

class UserList implements OnInit {
  DataStore = DataStore;
  users: Object[];
  selectedUser: Object;
  constructor(private _appService:AppService,
                private _logger:Logger) {
        this._logger.log('LeftbarComponent.ts:UserList');
  }

  ngOnInit() {
  }
  selectUser(serverInfo, index) {

    this.selectedUser = serverInfo.system_users[index];
    let param = {
        'assetId': serverInfo.id,
        'sysUserId': this.selectedUser['id'],
    };
    DataStore.termlist.push(param);
    DataStore.loguserlist = [];
    DataStore.loguserInfo = {};
  }
}




@Component({
    selector: 'div',
    template: `<div style="height:30px;width:100%;background-color: #00b3ee">
    <search-bar></search-bar><select-user-panel></select-user-panel></div>`,
    directives: [SearchBar, UserList],
})


export class LeftbarComponent {
    DataStore = DataStore;

    constructor(private _appService:AppService,
                private _logger:Logger) {
        this._logger.log('LeftbarComponent.ts:LeftbarComponent');
        this._logger.debug("check DataStroe.leftbar", DataStore.leftbar);
    }

    ngOnInit() {
        this._logger.log('LeftbarComponent.ts:LeftbarComponent,ngOnInit');

    }

    ngAfterViewInit() {
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
            source: {url: DataStore.leftbar},
            activeVisible: true, // Make sure, active nodes are visible (expanded).
            aria: true, // Enable WAI-ARIA support.
            autoActivate: true, // Automatically activate a node when it is focused (using keys).
            autoCollapse: true, // Automatically collapse all siblings, when a node is expanded.
            autoScroll: true, // Automatically scroll nodes into visible area.
            clickFolderMode: 3, // 1:activate, 2:expand, 3:activate and expand, 4:activate (dblclick expands)
            checkbox: false, // Show checkboxes.
            debugLevel: 0, // 0:quiet, 1:normal, 2:debug
            disabled: false, // Disable control
            focusOnSelect: true, // Set focus when node is checked by a mouse click
            escapeTitles: false, // Escape `node.title` content for display
            generateIds: true, // Generate id attributes like <span id='fancytree-id-KEY'>
            idPrefix: "ft_", // Used to generate node id´s like <span id='fancytree-id-<key>'>.
            icon: true, // Display node icons.

            // icon: function (event, data) {
            //     if (data.node.isFolder()) {
            //         return "glyphicon glyphicon-book";
            //     }
            // },
            keyboard: false, // Support keyboard navigation.
            keyPathSeparator: "/", // Used by node.getKeyPath() and tree.loadKeyPath().
            minExpandLevel: 1, // 1: root node is not collapsible
            quicksearch: true, // Navigate to next node by typing the first letters.
            selectMode: 3, // 1:single, 2:multi, 3:multi-hier
            tabindex: "0", // Whole tree behaves as one single control
            titlesTabbable: false, // Node titles can receive keyboard focus
            dblclick: function (event, data) {
                console.log('leftbar dbclick', event, data);
                if (!data.node.folder) {
                    if (data.node.data.system_users && data.node.data.system_users.length > 1) {
                        DataStore.loguserlist = data.node.data.system_users;
                        DataStore.loguserInfo = data.node.data;
                    } else {
                        if (data.node.data.system_users && data.node.data.system_users.length > 0) {
                            let param = {
                                'assetId': data.node.data.id,
                                'sysUserId': data.node.data.system_users[0].id,
                            };
                            DataStore.termlist.push(param);
                        }
                        
                    }
                    
                    // DataStore.termActive = DataStore.term.push({
                    //         "machine": data.node.data.machine,
                    //         "nick": data.node.title
                    //     }) - 1;
                }

            },
        });

        jQuery("#left-bar").contextmenu({
            delegate: "span.fancytree-title",
            hide: {effect: "basic", duration: "slow"},
            menu: [
                {
                    "title": "Cut",
                    "cmd": "cut",
                    "uiIcon": "fa fa-cut fa-size-1p3em"
                },
                {
                    "title": "Copy",
                    "cmd": "copy",
                    "uiIcon": "fa fa-copy fa-size-1p3em"
                },
                {
                    "title": "Paste",
                    "cmd": "paste",
                    "uiIcon": "fa fa-paste fa-size-1p3em",
                    "disabled": false
                },
                {
                    "title": "----"
                },
                {
                    "title": "Edit",
                    "cmd": "edit",
                    "uiIcon": "fa fa-edit fa-size-1p3em",
                    "disabled": true
                },
                {
                    "title": "Delete",
                    "cmd": "delete",
                    "uiIcon": "fa fa-trash fa-size-1p3em",
                    "disabled": true
                },
                {
                    "title": "More",
                    "uiIcon": "fa fa-caret-right fa-size-1p3em",
                    "children": [
                        {
                            "title": "Sub 1",
                            "cmd": "sub1"
                        },
                        {
                            "title": "Sub 2",
                            "cmd": "sub1"
                        }
                    ]
                }
            ],
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
    }

    getSelect() {
        jQuery('#left-bar').fancytree('getTree').getSelectedNodes();
    }

    Hide() {
        this._appService.HideLeft()
    }


}
