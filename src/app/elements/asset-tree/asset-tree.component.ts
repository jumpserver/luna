import {Component, Input, Output, OnInit, Inject, SimpleChanges, OnChanges, ElementRef, ViewChild, EventEmitter} from '@angular/core';
import {NavList, View} from '../../pages/control/control/control.component';
import {AppService, HttpService, LogService} from '../../app.service';
import {MAT_DIALOG_DATA, MatDialog, MatDialogRef} from '@angular/material';
import {FormControl, Validators} from '@angular/forms';
import {BehaviorSubject} from 'rxjs/BehaviorSubject';
import {ActivatedRoute} from '@angular/router';
import * as jQuery from 'jquery/dist/jquery.min';

declare var $: any;

@Component({
  selector: 'elements-asset-tree',
  templateUrl: './asset-tree.component.html',
  styleUrls: ['./asset-tree.component.scss']
})
export class ElementAssetTreeComponent implements OnInit, OnChanges {
  @Input() query: string;
  @Input() searchEvt$: BehaviorSubject<string>;
  @ViewChild('rMenu') rMenu: ElementRef;
  Data = [];
  nodes = [];
  setting = {
    view: {
      dblClickExpand: false,
      showLine: true
    },
    data: {
      simpleData: {
        enable: true
      },
      key: {
        title: 'title'
      }
    },
    callback: {
      onClick: this.onCzTreeOnClick.bind(this),
      onRightClick: this.onRightClick.bind(this)
    },
  };
  pos = {left: '100px', top: '200px'};
  hiddenNodes: any;
  expandNodes: any;
  zTree: any;
  isShowRMenu = false;
  rightClickSelectNode: any;
  hasLoginTo = false;

  onCzTreeOnClick(event, treeId, treeNode, clickFlag) {
    if (treeNode.isParent) {
      const zTreeObj = $.fn.zTree.getZTreeObj('ztree');
      zTreeObj.expandNode(treeNode);
    } else {
      this._http.getUserProfile().subscribe();
      this.Connect(treeNode);
    }
  }

  constructor(private _appService: AppService,
              public _dialog: MatDialog,
              public _logger: LogService,
              private activatedRoute: ActivatedRoute,
              private _http: HttpService
  ) {
    this.searchEvt$ = new BehaviorSubject<string>(this.query);
  }

  getGrantedAssetsNodes() {
    this._http.getMyGrantedNodes()
      .subscribe(response => {
        this.Data = [...response, ...this.Data];
        this.draw();
      });
  }

  refreshGrantedAssetsNodes() {
    this._http.refreshMyGrantedNodes()
      .subscribe(response => {
        this.Data = [...response, ...this.Data];
        this.draw();
      });
  }

  getGrantedRemoteApps() {
    this._http.getMyGrantedRemoteApps()
      .subscribe(response => {
        if (response.length > 1) {
          this.Data = [...this.Data, ...response];
          this.draw();
        }
      });
  }

  ngOnInit() {
    this.getGrantedAssetsNodes();
    this.getGrantedRemoteApps();
    document.addEventListener('click', this.hideRMenu.bind(this), false);
    this.searchEvt$.asObservable()
      .debounceTime(300)
      .distinctUntilChanged()
      .subscribe((n) => {
        this.filter();
      });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['Data'] && this.Data) {
      this.draw();
    }
    if (changes['query'] && !changes['query'].firstChange) {
      this.searchEvt$.next(this.query);
    }
  }

  refreshNodes() {
    this.zTree.destroy();
    this.Data = [];
    this.refreshGrantedAssetsNodes();
    this.getGrantedRemoteApps();
  }

  draw() {
    $.fn.zTree.init($('#ztree'), this.setting, this.Data);
    this.zTree = $.fn.zTree.getZTreeObj('ztree');
    this.rootNodeAddDom(this.zTree, () => {
      this.refreshNodes();
    });

    this.activatedRoute.queryParams.subscribe(params => {
      const login_to = params['login_to'];
      if (login_to && !this.hasLoginTo) {
        this.Data.forEach(t => {
          if (login_to === t.id && t.isParent === false) {
            this.hasLoginTo = true;
            this.Connect(t);
            return;
          }
        });
      }
    });
  }

  rootNodeAddDom(ztree, callback) {
    const refreshIcon = '<a id="tree-refresh"><i class="fa fa-refresh"></i></a>';
    const rootNode = ztree.getNodes()[0];
    const $rootNodeRef = $('#' + rootNode.tId + '_a');
    $rootNodeRef.after(refreshIcon);
    const refreshIconRef = $('#tree-refresh');
    refreshIconRef.bind('click', function () {
      callback();
    });
  }

  showRMenu(left, top) {
    const clientHeight = document.body.clientHeight;
    if (top + 60 > clientHeight) {
      top -= 60;
    }
    this.pos.left = left + 'px';
    this.pos.top = top + 'px';
    this.isShowRMenu = true;
  }

  hideRMenu() {
    this.isShowRMenu = false;
  }

  onRightClick(event, treeId, treeNode) {
    if (!treeNode || treeNode.isParent) {
      return null;
    }
    const host = treeNode.meta.asset;
    let findSSHProtocol = false;
    const protocols = host.protocols || [];
    if (host.protocol) {
      protocols.push(host.protocol);
    }
    for (let i = 0; i < protocols.length; i++) {
      const protocol = protocols[i];
      if (protocol && protocol.startsWith('ssh')) {
        findSSHProtocol = true;
      }
    }
    if (!findSSHProtocol) {
      alert('Windows 请使用Ctrl+Shift+Alt呼出侧边栏上传下载');
    }

    if (!treeNode && event.target.tagName.toLowerCase() !== 'button' && $(event.target).parents('a').length === 0) {
      this.zTree.cancelSelectedNode();
      this.showRMenu(event.clientX, event.clientY);
    } else if (treeNode && !treeNode.noR) {
      this.zTree.selectNode(treeNode);
      this.showRMenu(event.clientX, event.clientY);
      this.rightClickSelectNode = treeNode;
    }
  }

  Connect(node) {
    switch (node.meta.type) {
      case 'asset':
        this.connectAsset(node);
        break;
      case 'remote_app':
        this.connectRemoteApp(node);
        break;
      default:
        alert('Unknown type: ' + node.meta.type);
    }
  }

  connectAsset(node) {
    const systemUsers = node.meta.system_users;
    const host = node.meta.asset;
    let user: any;
    if (systemUsers.length > 1) {
      user = this.checkPriority(systemUsers);
      if (user) {
        return this.manualSetUserAuthLoginIfNeed(host, user, this.login);
      } else {
        const dialogRef = this._dialog.open(AssetTreeDialogComponent, {
          height: '200px',
          width: '300px',
          data: {users: systemUsers}
        });

        dialogRef.afterClosed().subscribe(result => {
          if (result) {
            for (const i of systemUsers) {
              if (i.id.toString() === result.toString()) {
                user = i;
                break;
              }
            }
            return this.manualSetUserAuthLoginIfNeed(host, user, this.login);
          }
        });
      }
    } else if (systemUsers.length === 1) {
      user = systemUsers[0];
      this.manualSetUserAuthLoginIfNeed(host, user, this.login);
    } else {
      alert('该主机没有授权登录用户');
    }
  }

  connectRemoteApp(node) {
    const user = node.meta.user;
    return this.manualSetUserAuthLoginIfNeed(node, user, this.loginRemoteApp);
  }

  loginRemoteApp(node, user) {
    const id = NavList.List.length - 1;
    if (node) {
      NavList.List[id].nick = node.name;
      NavList.List[id].connected = true;
      NavList.List[id].edit = false;
      NavList.List[id].closed = false;
      NavList.List[id].remoteApp = node.id;
      NavList.List[id].user = user;
      NavList.List[id].type = 'rdp';
      NavList.List.push(new View());
      NavList.Active = id;
      jQuery('.tabs').animate({'scrollLeft': 150 * id}, 400);
    }
  }

  connectFileManager() {
    const host = this.rightClickSelectNode.meta.asset;
    const id = NavList.List.length - 1;
    if (host) {
      NavList.List[id].nick = '[FILE]' + host.hostname;
      NavList.List[id].connected = true;
      NavList.List[id].edit = false;
      NavList.List[id].closed = false;
      NavList.List[id].host = host;
      NavList.List[id].type = 'sftp';
      NavList.List.push(new View());
      NavList.Active = id;
      jQuery('.tabs').animate({'scrollLeft': 150 * id}, 400);
    }
  }

  connectTerminal() {
    const host = this.rightClickSelectNode;
    this.Connect(host);
  }

  manualSetUserAuthLoginIfNeed(host, user, callback) {
    if (user.login_mode !== 'manual' || user.protocol !== 'rdp') {
      return callback(host, user);
    }
    user = Object.assign({}, user);
    const dialogRef = this._dialog.open(ManualPasswordDialogComponent, {
      height: '250px',
      width: '500px',
      data: {username: user.username}
    });
    dialogRef.afterClosed().subscribe(result => {
      if (!result) {
        return;
      }
      if (result.skip) {
        return callback(host, user);
      }
      user.username = result.username;
      user.password = result.password;
      return callback(host, user);
    });
  }

  login(host, user) {
    const id = NavList.List.length - 1;

    if (user) {
      NavList.List[id].nick = host.hostname;
      NavList.List[id].connected = true;
      NavList.List[id].edit = false;
      NavList.List[id].closed = false;
      NavList.List[id].host = host;
      NavList.List[id].user = user;
      if (user.protocol === 'ssh' || user.protocol === 'telnet') {
        NavList.List[id].type = 'ssh';
      } else if (user.protocol === 'rdp' || user.protocol === 'vnc') {
        NavList.List[id].type = 'rdp';
      }
      NavList.List.push(new View());
      NavList.Active = id;
      jQuery('.tabs').animate({'scrollLeft': 150 * id}, 400);
    }
  }

  checkPriority(sysUsers) {
    let priority = -1;
    let user: any;
    for (const u of sysUsers) {
      if (u.priority > priority) {
        user = u;
        priority = u.priority;
      } else if (u.priority === priority) {
        return null;
      }
    }
    return user;
  }

  recurseParent(node) {
    const parentNode = node.getParentNode();
    if (parentNode && parentNode.pId) {
      return [parentNode, ...this.recurseParent(parentNode)];
    } else if (parentNode) {
      return [parentNode];
    } else {
      return [];
    }
  }

  recurseChildren(node) {
    if (!node.isParent) {
      return [];
    }
    const children = node.children;
    if (!children) {
      return [];
    }
    let all_children = [];
    children.forEach((n) => {
      all_children = [...children, ...this.recurseChildren(n)];
    });
    return all_children;
  }

  filter() {
    const zTreeObj = $.fn.zTree.getZTreeObj('ztree');
    if (!zTreeObj) {
      return null;
    }
    let _keywords = this.query;
    const nodes = zTreeObj.transformToArray(zTreeObj.getNodes());
    if (!_keywords) {
      if (this.hiddenNodes) {
        zTreeObj.showNodes(this.hiddenNodes);
        this.hiddenNodes = null;
      }
      if (this.expandNodes) {
        this.expandNodes.forEach((node) => {
          if (node.id !== nodes[0].id) {
            zTreeObj.expandNode(node, false);
          }
        });
        this.expandNodes = null;
      }
      return null;
    }
    _keywords = _keywords.toLowerCase();
    let shouldShow = [];
    const matchedNodes = zTreeObj.getNodesByFilter(function (node) {
      if (node.meta.type === 'asset') {
        const host = node.meta.asset;
        return host.hostname.toLowerCase().indexOf(_keywords) !== -1 || host.ip.indexOf(_keywords) !== -1;
      } else {
        return node.name.toLowerCase().indexOf(_keywords) !== -1;
      }
    });
    matchedNodes.forEach((node) => {
      const parents = this.recurseParent(node);
      const children = this.recurseChildren(node);
      shouldShow = [...shouldShow, ...parents, ...children, node];
    });
    this.hiddenNodes = nodes;
    this.expandNodes = shouldShow;
    zTreeObj.hideNodes(nodes);
    zTreeObj.showNodes(shouldShow);
    shouldShow.forEach((node) => {
      if (node.isParent) {
        zTreeObj.expandNode(node, true);
      }
    });
    // zTreeObj.expandAll(true);
  }
}


@Component({
  selector: 'elements-asset-tree-dialog',
  templateUrl: 'dialog.html',
})
export class AssetTreeDialogComponent implements OnInit {
  UserSelectControl = new FormControl('', [Validators.required]);
  selected: any;

  constructor(public dialogRef: MatDialogRef<AssetTreeDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public data: any,
              private _logger: LogService) {
  }

  ngOnInit() {
    this.selected = this.data.users[0].id;
    this.UserSelectControl.setValue(this.selected);
    // this._logger.debug(this.UserSelectControl);
  }

  onNoClick(): void {
    this.dialogRef.close();
  }

  compareFn: ((f1: any, f2: any) => boolean) | null = this.compareByValue;

  compareByValue(f1: any, f2: any) {
    return f1 && f2 && f1.value === f2.value;
  }
}

@Component({
  selector: 'elements-manual-password-dialog',
  templateUrl: 'manual-password-dialog.html',
})
export class ManualPasswordDialogComponent implements OnInit {
  PasswordControl = new FormControl('', [Validators.required]);
  constructor(@Inject(MAT_DIALOG_DATA) public data: any,
              public dialogRef: MatDialogRef<ManualPasswordDialogComponent>) {

  }

  onSkip() {
    this.data.skip = true;
    this.dialogRef.close(this.data);
  }

  onSkipAll() {
    this.data.skipAll = true;
    this.dialogRef.close(this.data);
  }

  onNoClick() {
    this.dialogRef.close();
  }

  onEnter() {
    this.dialogRef.close(this.data);
  }

  ngOnInit(): void {
  }
}
