import {Component, Input, OnInit, Inject, SimpleChanges, OnChanges, ElementRef, ViewChild} from '@angular/core';
import {NavList, View} from '../../pages/control/control/control.component';
import {AppService, LogService} from '../../app.service';
import {MAT_DIALOG_DATA, MatDialog, MatDialogRef} from '@angular/material';
import {FormControl, Validators} from '@angular/forms';
import {BehaviorSubject} from 'rxjs/BehaviorSubject';

declare var $: any;

@Component({
  selector: 'elements-asset-tree',
  templateUrl: './asset-tree.component.html',
  styleUrls: ['./asset-tree.component.scss']
})
export class ElementAssetTreeComponent implements OnInit, OnChanges {
  @Input() Data: any;
  @Input() query: string;
  @Input() searchEvt$: BehaviorSubject<string>;
  @ViewChild('rMenu') rMenu: ElementRef;
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
      onRightClick: this.onRightClick.bind(this),
      onAsyncSuccess: this.onzTreeAsyncSuccess.bind(this)
    },
    async: {
      enable: true,
      url: '/api/perms/v1/user/nodes/children/',
      autoParam: ['node_id=id', 'name=n', 'level=lv'],
      type: 'get',
      dataFilter: this.nodeFilter
    }
  };
  pos = {left: '100px', top: '200px'};
  hiddenNodes: any;
  expandNodes: any;
  zTree: any;
  searching = false;
  isShowRMenu = false;
  rightClickSelectNode: any;

  constructor(private _appService: AppService,
              public _dialog: MatDialog,
              public _logger: LogService) {
    this.searchEvt$ = new BehaviorSubject<string>(this.query);
  }

  ngOnInit() {
    if (this.Data) {
      this.draw();
    }
    document.addEventListener('click', this.hideRMenu.bind(this), false);
    this.searchEvt$.asObservable()
      .debounceTime(300)
      .distinctUntilChanged()
      .subscribe((n) => {
        this.searchNode();
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

  nodeFilter(treeId, parentNode, childNodes) {
    $.each(childNodes, function (index, value) {
      value['node_id'] = value['id'];
      value['id'] = value['tree_id'];
      if (value['tree_id'] !== value['tree_parent']) {
        value['pId'] = value['tree_parent'];
      } else {
        value['isParent'] = true;
      }
      value['name'] = value['value'];
      if (!value['is_node']) {
        const platform = value['asset']['platform'].toLowerCase().indexOf('win') === 0 ? 'windows' : 'linux';
        value['title'] = value['asset']['ip'] || value['name'];
        value['iconSkin'] = platform;
      }
      value['isParent'] = value['is_node'];
    });
    return childNodes;
  }

  onzTreeAsyncSuccess(event, treeId, treeNode, msg) {
    // 代表第一次加载
    if (!treeNode) {
      this.zTree = $.fn.zTree.getZTreeObj(treeId);
      if (this.searching) {
        this.zTree.expandAll(true);
      } else {
        const root = this.zTree.getNodes()[0];
        this.zTree.expandNode(root, true);
      }
    }
  }

  onCzTreeOnClick(event, treeId, treeNode, clickFlag) {
    if (treeNode.isParent) {
      const zTreeObj = $.fn.zTree.getZTreeObj('ztree');
      zTreeObj.expandNode(treeNode);
    } else {
      this.Connect(treeNode.asset);
    }
  }

  draw() {
    $.fn.zTree.init($('#ztree'), this.setting, this.nodes);
    // this.zTree = $.fn.zTree.getZTreeObj('ztree');
    // const root = this.zTree.getNodes()[0];
    // this.zTree.expandNode(root, true);
  }

  showRMenu(left, top) {
    this.pos.left = left + 'px';
    this.pos.top = top + 'px';
    this.isShowRMenu = true;
  }

  hideRMenu() {
    this.isShowRMenu = false;
  }

  onRightClick(event, treeId, treeNode) {
    if (!treeNode || treeNode.isParent || treeNode.asset.platform.toLowerCase() === 'windows') {
      return null;
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

  Connect(host) {
    let user: any;
    if (host.system_users_granted.length > 1) {
      user = this.checkPriority(host.system_users_granted);
      if (user) {
        this.login(host, user);
      } else {
        const dialogRef = this._dialog.open(AssetTreeDialogComponent, {
          height: '200px',
          width: '300px',
          data: {users: host.system_users_granted}
        });

        dialogRef.afterClosed().subscribe(result => {
          if (result) {
            for (const i of host.system_users_granted) {
              if (i.id.toString() === result.toString()) {
                user = i;
                break;
              }
            }
            this.login(host, user);
          }
        });
      }
    } else if (host.system_users_granted.length === 1) {
      user = host.system_users_granted[0];
      this.login(host, user);
    } else {
      alert('该主机没有授权登录用户');
    }
  }

  connectFileManager() {
    const host = this.rightClickSelectNode.asset;
    const id = NavList.List.length - 1;
    if (host) {
      NavList.List[id].nick = '[FILE]' + host.name;
      NavList.List[id].connected = true;
      NavList.List[id].edit = false;
      NavList.List[id].closed = false;
      NavList.List[id].host = host;
      NavList.List[id].type = 'sftp';
      NavList.List.push(new View());
      NavList.Active = id;
    }
    this._logger.debug(NavList);
  }

  connectTerminal() {
    const host = this.rightClickSelectNode;
    this.Connect(host);
  }

  login(host, user) {
    const id = NavList.List.length - 1;
    if (user) {
      NavList.List[id].nick = host.name;
      NavList.List[id].connected = true;
      NavList.List[id].edit = false;
      NavList.List[id].closed = false;
      NavList.List[id].host = host;
      NavList.List[id].user = user;
      if (user.protocol === 'ssh' || user.protocol === 'telnet') {
        NavList.List[id].type = 'ssh';
      } else if (user.protocol === 'rdp') {
        NavList.List[id].type = 'rdp';
      }
      NavList.List.push(new View());
      NavList.Active = id;
    }
    this._logger.debug(NavList);
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

  searchNode() {
    const zTreeObj = $.fn.zTree.getZTreeObj('ztree');
    if (!zTreeObj) {
      return null;
    }
    const _keywords = this.query;
    if (!_keywords) {
      // 第一次刷新
      if (!this.searching) {
        return null;
      }
      // 以后搜索后回来
      this.searching = false;
      zTreeObj.setting.async.url = '/api/perms/v1/user/nodes/children/';
    } else {
      this.searching = true;
      zTreeObj.setting.async.url = `/api/perms/v1/user/nodes/children/?search=${_keywords}`;
    }
    zTreeObj.reAsyncChildNodes(null, 'refresh');
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
