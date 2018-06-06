import {Component, Input, OnInit, Inject, SimpleChanges, OnChanges, EventEmitter} from '@angular/core';
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
  nodes = [];
  setting = {
    view: {
      dblClickExpand: false,
      showLine: true
    },
    data: {
      simpleData: {
        enable: true
      }
    },
    callback: {
      onClick: this.onCzTreeOnClick.bind(this)
    },
  };
  hiddenNodes: any;

  onCzTreeOnClick(event, treeId, treeNode, clickFlag) {
    if (treeNode.isParent) {
      const zTreeObj = $.fn.zTree.getZTreeObj('ztree');
      zTreeObj.expandNode(treeNode);
    } else {
      this.Connect(treeNode);
    }
  }

  constructor(private _appService: AppService,
              public _dialog: MatDialog,
              public _logger: LogService) {
    this.searchEvt$ = new BehaviorSubject<string>(this.query);
  }

  ngOnInit() {
    if (this.Data) {
      this.draw();
    }
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
      // this.filter();
    }
  }

  draw() {
    const nodes = {};
    const assets = {};
    this.Data.forEach(node => {
      if (!nodes[node['id']]) {
        nodes[node['id']] = true;
        this.nodes.push({
          'id': node['id'],
          'key': node['key'],
          'name': node['name'],
          'value': node['value'],
          'pId': node['parent'],
          'assets_amount': node['assets_amount'],
          'isParent': true,
          'open': node['key'] === '0'
        });
      }

      node['assets_granted'].forEach(asset => {
        if (!assets[asset['id']]) {
          this.nodes.push({
            'id': asset['id'],
            'name': asset['hostname'],
            'value': asset['hostname'],
            'system_users_granted': asset['system_users_granted'],
            'platform': asset['platform'],
            'comment': asset['comment'],
            'isParent': false,
            'pId': node['id'],
            'iconSkin': asset['platform'].toLowerCase()
          });
          assets[asset['id'] + '@' + node['id']] = true;
        }
      });
    });
    this.nodes.sort(function(node1, node2) {
      if (node1.isParent && !node2.isParent) {
        return -1;
      } else if (!node1.isParent && node2.isParent) {
        return 1;
      } else {
        return node1.name < node2.name ? -1 : 1;
      }
    });
    $.fn.zTree.init($('#ztree'), this.setting, this.nodes);
  }

  Connect(host) {
    // console.log(host);
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

  login(host, user) {
    const id = NavList.List.length - 1;
    this._logger.debug(NavList);
    this._logger.debug(host);
    if (user) {
      NavList.List[id].nick = host.name;
      NavList.List[id].connected = true;
      NavList.List[id].edit = false;
      NavList.List[id].closed = false;
      NavList.List[id].host = host;
      NavList.List[id].user = user;
      if (user.protocol === 'ssh') {
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
    children.forEach((n) => {
      return [...children, ...this.recurseChildren(n)];
    });
    return [];
  }

  filter() {
    const zTreeObj = $.fn.zTree.getZTreeObj('ztree');
    if (!zTreeObj) {
      return null;
    }
    const _keywords = this.query;
    const nodes = zTreeObj.transformToArray(zTreeObj.getNodes());
    if (!_keywords) {
      zTreeObj.showNodes(nodes);
      return null;
    }
    let shouldShow = [];
    nodes.forEach((node) => {
      if (shouldShow.indexOf(node) === -1 && node.name.indexOf(_keywords) !== -1) {
        const parents = this.recurseParent(node);
        const children = this.recurseChildren(node);
        shouldShow = [...shouldShow, ...parents, ...children, node];
      }
    });
    zTreeObj.hideNodes(nodes);
    zTreeObj.showNodes(shouldShow);
    zTreeObj.expandAll(true);
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
