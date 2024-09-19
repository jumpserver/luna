import {Component, ElementRef, Inject, Input, OnInit, ViewChild} from '@angular/core';
import {MAT_DIALOG_DATA, MatDialog, MatDialogRef, MatSnackBar} from '@angular/material';
import {BehaviorSubject, Subject} from 'rxjs';
import {takeUntil} from 'rxjs/operators';
import {ActivatedRoute} from '@angular/router';
import {ToastrService} from 'ngx-toastr';
import {connectOnNewPage, groupBy} from '@app/utils/common';
import {connectEvt, DEFAULT_ORG_ID, SYSTEM_ORG_ID} from '@app/globals';
import * as _ from 'lodash';
import {
  AppService,
  ConnectTokenService,
  HttpService,
  I18nService,
  LogService,
  OrganizationService,
  SettingService,
  TreeFilterService,
  ViewService
} from '@app/services';
import {ConnectEvt, InitTreeConfig, TreeNode} from '@app/model';
import {CookieService} from 'ngx-cookie-service';
import {HttpHeaders} from '@angular/common/http';

declare var $: any;

@Component({
  selector: 'elements-asset-tree-dialog',
  templateUrl: 'disabledWarning.html',
  styles: ['.mat-form-field { width: 100%; }']
})
export class DisabledAssetsDialogComponent implements OnInit {

  constructor(public dialogRef: MatDialogRef<DisabledAssetsDialogComponent>,
              @Inject(MAT_DIALOG_DATA) public data: any) {
  }

  ngOnInit() {
  }

  onNoClick() {
    this.dialogRef.close();
  }
}

class Tree {
  name: string;
  label: string;
  open: boolean;
  loading: boolean;
  search: boolean;
  checkbox: boolean;
  ztree: any;
  config: any;
  inited = false;
  complete = true;

  constructor(name, label, open, loading, search, checkbox, config = null) {
    this.name = name;
    this.label = label;
    this.open = open;
    this.loading = loading;
    this.search = search;
    this.checkbox = checkbox;
    this.config = config;
  }
}


@Component({
  selector: 'elements-asset-tree',
  templateUrl: './asset-tree.component.html',
  styleUrls: ['./asset-tree.component.scss'],
})
export class ElementAssetTreeComponent implements OnInit {
  @Input() query: string;
  @Input() searchEvt$: BehaviorSubject<string>;
  @ViewChild('rMenu', {static: false}) rMenu: ElementRef;
  setting = {
    view: {
      dblClickExpand: false,
      showLine: true,
      // 添加禁用颜色区分
      fontCss: (treeId, treeNode) => {
        if (treeNode.chkDisabled) {
          return {opacity: '0.4'};
        }
        return {};
      }
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
  isShowRMenu = false;
  rightClickSelectNode: any;
  isLoadTreeAsync: boolean;
  isOpenNewWindow: boolean;
  filterAssetCancel$: Subject<boolean> = new Subject();
  favoriteAssets = [];
  searchValue = '';
  currentOrgID = '';
  trees: Array<Tree> = [];
  assetTreeChecked = [];

  constructor(private _appSvc: AppService,
              private _treeFilterSvc: TreeFilterService,
              private _route: ActivatedRoute,
              private _http: HttpService,
              private _settingSvc: SettingService,
              private _dialog: MatDialog,
              private _logger: LogService,
              private _i18n: I18nService,
              private _toastr: ToastrService,
              private _orgSvc: OrganizationService,
              private _cookie: CookieService,
              private snackBar: MatSnackBar,
              private _connectTokenSvc: ConnectTokenService,
              private _viewSrv: ViewService
  ) {
  }

  get RMenuList() {
    if (!this.rightClickSelectNode) {
      return [];
    }
    const cnode = this.rightClickSelectNode;
    const tree = this.rightClickSelectNode.ztree;
    const checkedNodes = tree.getCheckedNodes(true);
    const checkedLeafs = checkedNodes.filter(node => !node.isParent);
    const treeChecked = (tree.setting && tree.setting.check && tree.setting.check.enable);
    const viewList = this._viewSrv.viewList;

    return [
      {
        'id': 'batch-connect',
        'name': this._i18n.instant('Connect checked') + ` (${checkedLeafs.length})`,
        'fa': 'fa-check-square-o',
        'hide': checkedLeafs.length === 0 || !treeChecked,
        'click': this.onMenuConnectChecked.bind(this)
      },
      {
        'id': 'connect',
        'name': 'Connect',
        'fa': 'fa-terminal',
        'hide': cnode.isParent,
        'click': this.onMenuConnect.bind(this)
      },
      {
        'id': 'new-connection',
        'name': 'Open in new window',
        'fa': 'fa-external-link',
        'hide': cnode.isParent,
        'click': this.onMenuConnectNewTab.bind(this)
      },
      {
        'id': 'split-connect',
        'name': 'Split connect',
        'fa': 'fa-columns',
        'hide': viewList.length <= 0 || cnode.isParent,
        'click': this.onMenuConnect.bind(this, true)
      },
      {
        'id': 'expand',
        'name': 'Expand',
        'fa': 'fa-angle-double-down',
        'hide': !cnode.isParent || cnode.open,
        'click': () => {
          tree.expandNode(cnode, true, false, true);
        }
      },
      {
        'id': 'fold',
        'name': 'Fold',
        'fa': 'fa-angle-double-up',
        'hide': !cnode.isParent || !cnode.open,
        'click': () => {
          tree.expandNode(cnode, false, false, true);
        }
      },
      {
        'id': 'expand-all',
        'name': 'Expand all',
        'fa': 'fa-expand',
        'hide': !cnode.isParent || cnode.open,
        'click': this.onMenuExpandAllChildren.bind(this)
      },
      {
        'id': 'fold-all',
        'name': 'Fold all',
        'fa': 'fa-compress',
        'hide': !cnode.isParent || !cnode.open,
        'click': () => {
          tree.expandNode(cnode, false, true, true);
        }
      },
      {
        'id': 'favorite',
        'name': 'Favorite',
        'fa': 'fa-star-o',
        'hide': this.isAssetFavorite() || cnode.isParent,
        'click': this.onMenuFavorite.bind(this)
      },
      {
        'id': 'disfavor',
        'name': 'Disfavor',
        'fa': 'fa-star',
        'hide': !this.isAssetFavorite() || cnode.isParent,
        'click': this.onMenuFavorite.bind(this)
      }
    ];
  }

  ngOnInit() {
    this.currentOrgID = this._cookie.get('X-JMS-LUNA-ORG') || this._cookie.get('X-JMS-ORG');
    this._settingSvc.afterInited().then((state) => {
      this.isLoadTreeAsync = this._settingSvc.isLoadTreeAsync();
      this.isOpenNewWindow = this._settingSvc.isOpenNewWindow();

      if (state) {
        if (!this._settingSvc.hasXPack() && this.currentOrgID === SYSTEM_ORG_ID) {
          this.currentOrgID = DEFAULT_ORG_ID;
        }
        this.initTree();
        this.trees.map((tree, index) => (index === 0 ? tree.open = true : tree.open = false));
      }
    });
    document.addEventListener('click', this.hideRMenu.bind(this), false);
  }

  initTree() {
    this.initAssetTree().then();
    this.initTypeTree().then();
  }

  onNodeClick(event, treeId, treeNode, clickFlag) {
    const ztree = this.trees.find(t => t.name === treeId).ztree;
    if (treeNode.isParent) {
      ztree.expandNode(treeNode);
      return;
    }
    if (treeNode.chkDisabled) {
      const config = {
        height: '200px',
        width: '450px'
      };
      this._dialog.open(DisabledAssetsDialogComponent, config);
      return;
    }
    if (this.isOpenNewWindow) {
      connectOnNewPage(treeNode, 'auto');
    } else {
      this.connectAsset(treeNode).then();
    }
  }

  onAssetTreeCheck(event, treeId) {
    const ztree = this.trees.find(t => t.name === treeId).ztree;
    this.assetTreeChecked = ztree.getCheckedNodes().filter(i => !i.isParent);
  }

  async initAssetTree(refresh = false) {
    const config = {
      refresh,
      showFavoriteAssets: true,
      url: '/api/v1/perms/users/self/nodes/all-with-assets/tree/',
      asyncUrl: '/api/v1/perms/users/self/nodes/children-with-assets/tree/?'
    };
    const tree = new Tree(
      'AssetTree',
      'My assets',
      false,
      true,
      true,
      true,
      config
    );
    if (!refresh) {
      this.trees.push(tree);
    }
    this.initTreeInfo(tree, config).then();
  }

  async initTypeTree(refresh = false) {
    const config = {
      refresh,
      url: '/api/v1/perms/users/self/nodes/children-with-assets/category/tree/?sync=1',
      asyncUrl: '/api/v1/perms/users/self/nodes/children-with-assets/category/tree/',
      setting: {
        async: {
          autoParam: ['type', 'category']
        }
      },
    };
    const tree = new Tree(
      'AssetTypeTree',
      this._i18n.instant('Type tree'),
      true,
      true,
      false,
      true,
      config
    );
    if (!refresh) {
      this.trees.push(tree);
    } else {
      this.initTreeInfo(tree, config).then();
    }
  }

  getOffsetTreeNodes(body, url, headers: HttpHeaders, tree) {
    const offset = headers.get('X-JMS-TREE-OFFSET');
    const options = {
      observe: 'response', params: {offset: offset}
    };
    const treeObj = tree.ztree;
    this._http.get(url, options).subscribe(
      resp => {
        const newBody = resp.body;
        const newHeaders = resp.headers;
        if (newBody.length === 0) {
          tree.complete = true;
          const parents = treeObj.getNodesByParam('isParent', true);
          for (const node of parents) {
            node.name = node.meta._name;
            treeObj.updateNode(node);
          }
          return;
        }
        const grouped = _.groupBy(newBody, 'pId');
        Object.entries(grouped).forEach(([key, value]) => {
          const parent = treeObj.getNodeByParam('id', key);
          treeObj.addNodes(parent, -1, value, true);
        });
        return this.getOffsetTreeNodes(body, url, newHeaders, tree);
      },
      error => {
        this._logger.error('Get tree error: ', error);
      }
    );
  }

  cleanupTreeSetting(config: InitTreeConfig) {
    let setting = Object.assign({}, this.setting);
    setting['callback'] = {
      onClick: _.debounce(this.onNodeClick, 300, {
        'leading': true,
        'trailing': false
      }).bind(this),
      onCheck: this.onAssetTreeCheck.bind(this),
      onRightClick: this.onRightClick.bind(this)
    };
    let url = config.url;
    if (this.isLoadTreeAsync) {
      setting['async'] = {
        enable: true,
        url: config.asyncUrl,
        autoParam: ['id=key', 'name=n', 'level=lv'],
        type: 'get',
        headers: {
          'X-JMS-ORG': this.currentOrgID
        }
      };
      url = config.asyncUrl;
    }
    setting = _.merge(setting, config.setting || {});
    return {setting, url};
  }

  async initTreeInfo(tree: Tree, config: InitTreeConfig) {
    tree.inited = true;
    if (config.refresh) {
      tree = this.trees.find(t => t.name === tree.name);
    }
    const {setting, url} = this.cleanupTreeSetting(config);

    if (config.showFavoriteAssets) {
      this._http.getFavoriteAssets().subscribe(resp => {
        this.favoriteAssets = resp.map(i => i.asset);
      });
    }
    tree.loading = true;
    const request = this._http.get(url, {observe: 'response'});
    request.subscribe(
      resp => {
        // 如果是刷新，需要先销毁原来的树, 重新初始化
        if (config.refresh) {
          tree.ztree.expandAll(false);
          tree.ztree.destroy();
        }
        const body = resp.body;
        const headers = resp.headers;
        setTimeout(() => {
          // 新的 api 支持树的分页
          const offset = headers.get('X-JMS-TREE-OFFSET');
          if (offset && offset !== '0') {
            const parents = body.filter(node => node.isParent);
            for (const node of parents) {
              node.meta._name = node.name;
              node.name = node.name.replace(/\(\d+\)$/, '(-)');
            }
            setTimeout(() => {
              tree.complete = false;
              this.getOffsetTreeNodes(body, url, resp.headers, tree);
            }, 100);
          }
          tree.ztree = $.fn.zTree.init($('#' + tree.name), setting, body);
        }, 100);
      },
      error => {
        if (error.status === 400) {
          alert(error.error.detail);
        }
        this._logger.error('Get tree error: ', error);
      },
      () => {
        tree.loading = false;
      });
  }

  isTreeCheckEnabled(tree) {
    const treeObj = tree.ztree;
    if (treeObj && treeObj.setting && treeObj.setting.check) {
      return treeObj.setting.check.enable;
    }
    return false;
  }

  toggleTreeCheckable(event, tree) {
    event.stopPropagation();
    const treeObj = tree.ztree;
    const currentChecked = treeObj.setting.check.enable;
    if (currentChecked) {
      treeObj.checkAllNodes(false);
    }
    setTimeout(() => {
      treeObj.setting.check.enable = !currentChecked;
      treeObj.refresh();
    });
  }

  onMenuConnectChecked() {
    const ztree = this.rightClickSelectNode.ztree;
    if (!ztree.setting.check.enable) {
      return;
    }
    const nodes = ztree.getCheckedNodes().filter(node => !node.isParent);
    const t = setInterval(() => {
      if (nodes.length === 0) {
        clearInterval(t);
        this.assetTreeChecked = [];
        return;
      }
      if (this._appSvc.connectDialogShown) {
        return;
      }
      const node = nodes.shift();
      this.connectAsset(node).then();
    }, 500);
  }

  async refreshTree(event, tree) {
    event.stopPropagation();
    this.searchValue = '';
    if (tree.name === 'AssetTree') {
      this.initAssetTree(true).then();
    } else if (tree.name === 'AssetTypeTree') {
      this.initTypeTree(true).then();
    }
  }

  stopOffsetTree(tree) {
    tree.complete = true;
  }

  async connectAsset(node: TreeNode) {
    const action = 'asset';
    const evt = new ConnectEvt(node, action);
    connectEvt.next(evt);
  }

  showRMenu(left, top) {
    const clientHeight = document.body.clientHeight;
    if (top + 60 > clientHeight) {
      top -= 60;
    }
    this.pos.left = left + 'px';
    this.pos.top = (top - 25) + 'px';
    this.isShowRMenu = true;
  }

  hideRMenu() {
    this.isShowRMenu = false;
  }

  isAssetFavorite() {
    const assetId = this.rightClickSelectNode.id;
    return this.favoriteAssets.indexOf(assetId) !== -1;
  }

  reAsyncChildNodes(treeId, treeNode, silent) {
    if (treeNode && treeNode.isParent && treeNode.children) {
      for (let i = 0; i < treeNode.children.length; i++) {
        const childNode = treeNode.children[i];
        const self = this;
        const targetTree = $.fn.zTree.getZTreeObj(treeId);
        targetTree.reAsyncChildNodesPromise(childNode, 'no', silent).then(() => {
          self.reAsyncChildNodes(treeId, childNode, silent);
        });
      }
    }
  }

  onMenuExpandAllChildren(event, tree) {
    const ztree = this.rightClickSelectNode.ztree;
    this.expandAllChildren(ztree.setting.treeId, this.rightClickSelectNode, true);
  }

  expandAllChildren(treeId, treeNode, expandFlag) {
    if (expandFlag === treeNode.open) {
      return;
    }
    // 异步加载时需要加载全部子节点
    const self = this;
    const ztree = $.fn.zTree.getZTreeObj(treeId);
    const treeIsAsync = ztree.setting.async.enable;
    const hasChildren = treeNode.children && treeNode.children.length > 0;
    if (!hasChildren && treeIsAsync) {
      ztree.reAsyncChildNodesPromise(treeNode, 'no', false).then(() => {
        this.reAsyncChildNodes(treeId, treeNode, false);
      });
    } else {
      // 展开时递归展开，防止用户手动展开子级折叠后无法再次展开孙子级
      if (expandFlag) {
        ztree.expandNode(treeNode, expandFlag, false, false, false);
        if (treeNode.children && treeNode.children.length > 0) {
          treeNode.children.forEach(function (childNode) {
            self.expandAllChildren(treeId, childNode, expandFlag);
          });
        }
      } else {
        ztree.expandNode(treeNode, expandFlag, true, false, false);
      }
    }
  }

  onRightClick(event, treeId, treeNode) {
    if (!treeNode) {
      return null;
    }
    const ztree = this.trees.find(t => t.name === treeId).ztree;
    this.rightClickSelectNode = treeNode;
    this.rightClickSelectNode.ztree = ztree;
    if (!treeNode && event.target.tagName.toLowerCase() !== 'button'
      && $(event.target).parents('a').length === 0) {
      ztree.cancelSelectedNode();
    } else if (treeNode && !treeNode.noR) {
      ztree.selectNode(treeNode);
    }
    this.showRMenu(event.clientX, event.clientY);
  }

  /**
   * @param splitConnect 是否分屏连接
   */
  async onMenuConnect(splitConnect = false) {
    if (splitConnect && this._viewSrv.currentView.subViews.length >= 4) {
      const msg = await this._i18n.instant('Split connect number');
      this.snackBar.open(msg, '', {
        verticalPosition: 'top',
        duration: 1600
      });
      return;
    }
    const node = this.rightClickSelectNode;
    const action = 'connect';
    const evt = splitConnect ? new ConnectEvt(node, action, true) : new ConnectEvt(node, action);
    connectEvt.next(evt);
  }

  onMenuConnectNewTab() {
    const node = this.rightClickSelectNode;
    connectOnNewPage(node, 'auto');
  }

  onMenuFavorite() {
    const assetId = this.rightClickSelectNode.id;
    if (this.isAssetFavorite()) {
      this._http.favoriteAsset(assetId, false).subscribe(() => {
        const i = this.favoriteAssets.indexOf(assetId);
        this.favoriteAssets.splice(i, 1);
        const msg = this._i18n.instant('Disfavor') + ' ' + this._i18n.instant('success');
        this._toastr.success(msg, '', {timeOut: 2000});
      });
    } else {
      this._http.favoriteAsset(assetId, true).subscribe(() => {
        this.favoriteAssets.push(assetId);
        const msg = this._i18n.instant('Favorite') + ' ' + this._i18n.instant('success');
        this._toastr.success(msg, '', {timeOut: 2000});
      });
    }
  }

  filterAssets(keyword, tree) {
    if (this.isLoadTreeAsync) {
      this._logger.debug('Filter assets server');
      this.filterAssetsServer(keyword, tree.ztree);
    } else {
      this._logger.debug('Filter assets local');
      this.filterAssetsLocal(keyword, tree.ztree);
    }
  }

  _filterZTree(keyword, tree, filterCallback) {
    const searchNode = tree.getNodesByFilter((node) => node.id === 'search');
    if (searchNode) {
      tree.removeNode(searchNode[0]);
    }

    const nodes = tree.transformToArray(tree.getNodes());
    if (!keyword) {
      if (tree.hiddenNodes) {
        tree.showNodes(tree.hiddenNodes);
        tree.hiddenNodes = null;
      }
      if (tree.expandNodes) {
        tree.expandNodes.forEach((node) => {
          if (node.id !== nodes[0].id) {
            tree.expandNode(node, false);
          }
        });
        tree.expandNodes = null;
      }
      return null;
    }
    let shouldShow = [];
    const matchedNodes = tree.getNodesByFilter(filterCallback);

    if (matchedNodes.length < 1) {
      let name = this._i18n.instant('Search');
      const assetsAmount = matchedNodes.length;
      name = `${name} (${assetsAmount})`;
      const newNode = {
        id: 'search',
        name: name,
        isParent: true,
        open: true
      };
      tree.addNodes(null, newNode);
    }

    matchedNodes.forEach((node) => {
      const parents = this.recurseParent(node);
      const children = this.recurseChildren(node);
      shouldShow = [...shouldShow, ...parents, ...children, node];
    });
    tree.hiddenNodes = nodes;
    tree.expandNodes = shouldShow;
    tree.hideNodes(nodes);
    tree.showNodes(shouldShow);
    shouldShow.forEach((node) => {
      if (node.isParent) {
        tree.expandNode(node, true);
      }
    });
  }

  filterAssetsServer(keyword, ztree) {
    if (!ztree) {
      return;
    }
    let searchNode = ztree.getNodesByFilter((node) => node.id === 'search');
    if (searchNode) {
      ztree.removeChildNodes(searchNode[0]);
      ztree.removeNode(searchNode[0]);
    }
    const treeNodes = ztree.getNodes();
    if (!keyword) {
      if (treeNodes.length !== 0) {
        ztree.showNodes(treeNodes);
      }
      return;
    }
    this.filterAssetCancel$.next(true);
    if (treeNodes.length !== 0) {
      ztree.hideNodes(treeNodes);
    }
    this._http.getMyGrantedAssets(keyword)
      .pipe(takeUntil(this.filterAssetCancel$))
      .subscribe(nodes => {
        let name = this._i18n.instant('Search');
        const assetsAmount = nodes.length;
        name = `${name} (${assetsAmount})`;
        const newNode = {id: 'search', name: name, isParent: true, open: true, zAsync: true};
        searchNode = ztree.addNodes(null, newNode)[0];
        searchNode.zAsync = true;
        const nodesGroupByOrg = groupBy(nodes, (node) => {
          return node.meta.data.org_name;
        });
        nodesGroupByOrg.forEach((item) => {
          const orgName = item[0].meta.data.org_name;
          const orgNodeData = {id: orgName, name: orgName, isParent: true, open: true, zAsync: true};
          const orgNode = ztree.addNodes(searchNode, orgNodeData)[0];
          orgNode.zAsync = true;
          ztree.addNodes(orgNode, item);
        });
        searchNode.open = true;
      });
    return;
  }

  filterAssetsLocal(keyword, ztree) {
    if (!ztree) {
      return null;
    }
    const filterAssetsCallback = (node: TreeNode) => {
      if (node.isParent) {
        return false;
      }
      const host = node.meta.data;
      return host.name.toLowerCase().indexOf(keyword.toLowerCase()) !== -1
        || host.address.indexOf(keyword.toLowerCase()) !== -1;
    };
    return this._filterZTree(keyword, ztree, filterAssetsCallback);
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
    let allChildren = [];
    children.forEach((n) => {
      allChildren = [...children, ...this.recurseChildren(n)];
    });
    return allChildren;
  }

  treeSearch(event, tree: Tree) {
    event.stopPropagation();
    const vm = this;
    const searchIcon = document.getElementById(`${tree.name}SearchIcon`);
    const searchInput = document.getElementById(`${tree.name}SearchInput`);
    searchIcon.classList.toggle('active');
    searchInput.focus();
    searchInput.onclick = (e) => {
      e.stopPropagation();
    };
    searchInput.onblur = (e: any) => {
      e.stopPropagation();
      if (!(e.target.value)) {
        searchIcon.classList.toggle('active');
      }
    };
    searchIcon.oninput = _.debounce((e) => {
      e.stopPropagation();
      const value = e.target.value || '';
      vm.searchValue = value;
      vm.filterAssets(value, tree);
    }, 450);
  }

  foldTree(tree: Tree) {
    this.trees.map(item => {
      if (!tree.inited) {
        this.initTreeInfo(tree, tree.config).then(() => {
        });
      }
      if (tree.name === item.name) {
        item.open = !item.open;
      } else {
        item.open = false;
      }
    });
  }
}
