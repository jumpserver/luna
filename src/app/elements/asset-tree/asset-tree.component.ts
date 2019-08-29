import {Component, Input, OnInit, Inject, SimpleChanges, OnChanges, ElementRef, ViewChild} from '@angular/core';
import {NavList, View} from '../../pages/control/control/control.component';
import {AppService, HttpService, LogService, NavService} from '../../app.service';
import {connectEvt} from '../../globals';
import {MatDialog} from '@angular/material';
import {BehaviorSubject} from 'rxjs/BehaviorSubject';
import {ActivatedRoute} from '@angular/router';
import {TreeNode, ConnectEvt} from '../../model';
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
  };
  pos = {left: '100px', top: '200px'};
  hiddenNodes: any;
  expandNodes: any;
  assetsTree: any;
  remoteAppsTree: any;
  isShowRMenu = false;
  rightClickSelectNode: any;
  hasLoginTo = false;
  loadTreeAsync = false;

  onNodeClick(event, treeId, treeNode, clickFlag) {
    if (treeNode.isParent) {
      this.assetsTree.expandNode(treeNode);
    } else {
      this._http.getUserProfile().subscribe();
      this.Connect(treeNode);
    }
  }

  constructor(private _appSvc: AppService,
              public _dialog: MatDialog,
              public _logger: LogService,
              private activatedRoute: ActivatedRoute,
              private _http: HttpService,
              private _navSvc: NavService
  ) {
    this.searchEvt$ = new BehaviorSubject<string>(this.query);
  }

  ngOnInit() {
    this.initTree();
    document.addEventListener('click', this.hideRMenu.bind(this), false);
    this.loadTreeAsync = this._navSvc.treeLoadAsync;

    // Todo: 搜索
    this.searchEvt$.asObservable()
      .debounceTime(300)
      .distinctUntilChanged()
      .subscribe((n) => {
        this.filter();
      });
  }

  ngOnChanges(changes: SimpleChanges) {
    // if (changes['Data'] && this.Data) {
    //   this.draw();
    // }
    if (changes['query'] && !changes['query'].firstChange) {
      this.searchEvt$.next(this.query);
    }
  }

  refreshAssetsTree() {
    this.assetsTree.destroy();
    this.initAssetsTree(true);
  }

  initAssetsTree(refresh?: boolean) {
    const setting = Object.assign({}, this.setting);
    setting['callback'] = {
      onClick: this.onNodeClick.bind(this),
      onRightClick: this.onRightClick.bind(this)
    };
    if (this.loadTreeAsync) {
      setting['async'] = {
        enable: true,
        url: '/api/perms/v1/users/nodes/children-with-assets/tree/',
        autoParam: ['id=key', 'name=n', 'level=lv'],
        type: 'get'
      };
    }

    this._http.getMyGrantedNodes(this.loadTreeAsync, refresh).subscribe(resp => {
      const assetsTree = $.fn.zTree.init($('#assetsTree'), setting, resp);
      this.assetsTree = assetsTree;
      this.rootNodeAddDom(assetsTree, () => {
        this.refreshAssetsTree();
      });
    });
  }

  refreshRemoteAppsTree() {
    this.remoteAppsTree.destroy();
    this.initRemoteAppsTree();
  }

  initRemoteAppsTree() {
    this._http.getMyGrantedRemoteApps().subscribe(
      resp => {
        const tree = $.fn.zTree.init($('#remoteAppsTree'), this.setting, resp);
        this.remoteAppsTree = tree;
        this.rootNodeAddDom(tree, () => {
          this.refreshRemoteAppsTree();
        });
      }
    );
  }

  initTree() {
    this.initAssetsTree();
    this.initRemoteAppsTree();

    // Todo: connect to some asset, direct
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

  Connect(node: TreeNode) {
    const evt = new ConnectEvt(node, 'asset');
    connectEvt.next(evt);
  }

  rootNodeAddDom(ztree, callback) {
    const tId = ztree.setting.treeId + '_tree_refresh';
    const refreshIcon = '<a id=' + tId + ' class="tree-refresh">' +
      '<i class="fa fa-refresh" style="font-family: FontAwesome !important;" ></i></a>';
    const rootNode = ztree.getNodes()[0];
    const $rootNodeRef = $('#' + rootNode.tId + '_a');
    $rootNodeRef.after(refreshIcon);
    const refreshIconRef = $('#' + tId);
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
      this.assetsTree.cancelSelectedNode();
      this.showRMenu(event.clientX, event.clientY);
    } else if (treeNode && !treeNode.noR) {
      this.assetsTree.selectNode(treeNode);
      this.showRMenu(event.clientX, event.clientY);
      this.rightClickSelectNode = treeNode;
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

