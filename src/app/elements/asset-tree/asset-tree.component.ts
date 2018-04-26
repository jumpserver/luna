import {Component, Input, OnInit, AfterViewInit} from '@angular/core';

declare var $: any;

@Component({
  selector: 'elements-asset-tree',
  templateUrl: './asset-tree.component.html',
  styleUrls: ['./asset-tree.component.scss']
})
export class ElementAssetTreeComponent implements OnInit {
  @Input() Data: any;
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
      // onClick: this.onCzTreeOnClick
    },
  };
  timer: any;

  onCzTreeOnClick(event, treeId, treeNode, clickFlag) {
    alert(treeNode.name);
  }

  constructor() {
  }

  ngOnInit() {
    if (this.Data) {
      this.draw();
    }
    clearInterval(this.timer);

    this.timer = setInterval(() => {
      if (this.Data) {
        this.draw();
        clearInterval(this.timer);
      }
    }, 100);
  }

  draw() {
    let nodes = {};
    let assets = {};
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
}
