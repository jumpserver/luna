import {Component, Input, OnInit, Inject, SimpleChanges, OnChanges} from '@angular/core';
import {NavList, View} from '../../pages/control/control/control.component';
import {AppService, LogService} from '../../app.service';
import {MAT_DIALOG_DATA, MatDialog, MatDialogRef} from '@angular/material';
import {FormControl, Validators} from '@angular/forms';
import {DataStore} from '../../globals';
import {ElementServerMenuComponent} from '../server-menu/server-menu.component';
import {DialogService} from '../dialog/dialog.service';

declare var $: any;

@Component({
  selector: 'elements-asset-tree',
  templateUrl: './asset-tree.component.html',
  styleUrls: ['./asset-tree.component.scss']
})
export class ElementAssetTreeComponent implements OnInit, OnChanges {
  @Input() Data: any;
  @Input() query: string;
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
    this.Connect(treeNode);
  }

  constructor(private _appService: AppService,
              public _dialog: MatDialog,
              public _logger: LogService) {
  }

  ngOnInit() {
    if (this.Data) {
      this.draw();
    }
    // clearInterval(this.timer);
    //
    // this.timer = setInterval(() => {
    //   if (this.Data) {
    //     this.draw();
    //     clearInterval(this.timer);
    //   }
    // }, 100);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['Data'] && this.Data) {
      this.draw();
    }
    if (changes['query'] && !changes['query'].firstChange) {
      this.filter();
    }
  }

  draw() {
    const nodes = {};
    const assets = {};
    this.Data.forEach((v, i) => {
      if (!nodes[v['id']]) {
        nodes[v['id']] = true;
        this.nodes.push({
          'id': v['id'],
          'key': v['key'],
          'name': v['name'],
          'value': v['value'],
          'pId': v['parent'],
          'assets_amount': v['assets_amount'],
          'isParent': true,
          'open': v['key'] === '0'
        });
      }

      v['assets_granted'].forEach((vv, ii) => {
        vv['nodes'].forEach((vvv, iii) => {
          if (!nodes[vvv['id']]) {
            this.nodes.push({
              'id': vvv['id'],
              'key': vvv['key'],
              'name': vvv['value'],
              'value': vvv['value'],
              'pId': vvv['parent'],
              'assets_amount': vvv['assets_amount'],
              'isParent': true,
              'open': vvv['key'] === '0'
            });
            nodes[vvv['id']] = true;
          }
          if (!assets[vv['id'] + '@' + vvv['id']]) {
            this.nodes.push({
              'id': vv['id'],
              'name': vv['hostname'],
              'value': vv['hostname'],
              'system_users_granted': vv['system_users_granted'],
              'platform': vv['platform'],
              'comment': vv['comment'],
              'isParent': false,
              'pId': vvv['id'],
              'iconSkin': vv['platform'].toLowerCase()
            });
            assets[vv['id'] + '@' + vvv['id']] = true;
          }

        });
      });
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
    }
  }

  // autologin() {
  //   const asset_id = this._appService.getQueryString('asset_id');
  //   const user_id = this._appService.getQueryString('user_id');
  //   let tag = false;
  //   if (asset_id) {
  //     for (let g of this.Data) {
  //       if (g['assets_granted']) {
  //         for (let host of g['assets_granted']) {
  //           if (host.id.toString() === asset_id) {
  //             if (user_id) {
  //               host['system_users_granted'].forEach((user, kk) => {
  //                 if (user.id.toString() === user_id.toString()) {
  //                   this.login(host, user);
  //                   tag = true;
  //                   return;
  //                 }
  //               });
  //             } else {
  //               this.Connect(host);
  //               tag = true;
  //               return;
  //             }
  //           }
  //         }
  //       }
  //     }
  //     if (!tag) {
  //       this._layer.alert('Maybe you do not have permission on that host');
  //     }
  //   }
  //   DataStore.autologin = true;
  // }

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

  filter() {
    const zTreeObj = $.fn.zTree.getZTreeObj('ztree');
    zTreeObj.showNodes(this.hiddenNodes);

    function filterFunc(node) {
      const _keywords = $('#keyword').val();
      if (node.isParent || node.name.indexOf(_keywords) !== -1) {
        return false;
      }
      return true;
    }

    this.hiddenNodes = zTreeObj.getNodesByFilter(filterFunc);

    zTreeObj.hideNodes(this.hiddenNodes);
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
