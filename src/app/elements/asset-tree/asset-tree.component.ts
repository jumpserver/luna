import { Component, ElementRef, Input, OnInit, ViewChild } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { BehaviorSubject, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ActivatedRoute } from '@angular/router';
import { NzNotificationService } from 'ng-zorro-antd/notification';
import { connectOnNewPage, groupBy } from '@app/utils/common';
import { connectEvt, DEFAULT_ORG_ID, SYSTEM_ORG_ID } from '@app/globals';
import _ from 'lodash-es';
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
import { ConnectEvt, InitTreeConfig, TreeNode } from '@app/model';
import { CookieService } from 'ngx-cookie-service';
import { HttpHeaders } from '@angular/common/http';

declare var $: any;

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
  standalone: false,
  selector: 'elements-asset-tree',
  templateUrl: 'asset-tree.component.html',
  styleUrls: ['asset-tree.component.scss']
})
export class ElementAssetTreeComponent implements OnInit {
  @Input() query: string;
  @Input() searchEvt$: BehaviorSubject<string>;
  @ViewChild('rMenu', { static: false }) rMenu: ElementRef;
  setting = {
    view: {
      dblClickExpand: false,
      showLine: true,
      // 添加禁用颜色区分
      fontCss: (treeId, treeNode) => {
        if (treeNode.chkDisabled) {
          return { opacity: '0.4' };
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
    }
  };
  pos = { left: '100px', top: '200px' };
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
  rMenuList: any[] = [];
  maxAllowExpandAllNodeTotal = 20; // 展开节点的子节点总数小于此值时，允许展开所有子节点

  constructor(
    private _appSvc: AppService,
    private _treeFilterSvc: TreeFilterService,
    private _route: ActivatedRoute,
    private _http: HttpService,
    private _settingSvc: SettingService,
    private _logger: LogService,
    private _i18n: I18nService,
    private _toastr: NzNotificationService,
    private _orgSvc: OrganizationService,
    private _cookie: CookieService,
    private _message: NzMessageService,
    private _connectTokenSvc: ConnectTokenService,
    private _viewSrv: ViewService
  ) {}

  getRMenuList() {
    if (!this.rightClickSelectNode) {
      return [];
    }
    const cnode = this.rightClickSelectNode;
    // 当前节点下的子节点总数
    const cnodeChildrenTotal = cnode?.meta?.data?.children_count_total ?? 0;
    const tree = this.rightClickSelectNode.ztree;
    const checkedNodes = tree.getCheckedNodes(true);
    const checkedLeafs = checkedNodes.filter(node => !node.isParent);
    const treeChecked = tree.setting && tree.setting.check && tree.setting.check.enable;
    const viewList = this._viewSrv.viewList;

    const isK8s = cnode.meta.data.platform_type === 'k8s';

    return [
      {
        id: 'batch-connect',
        name: this._i18n.instant('Connect checked') + ` (${checkedLeafs.length})`,
        fa: 'fa-check-square-o',
        hide: checkedLeafs.length === 0 || !treeChecked,
        click: this.onMenuConnectChecked.bind(this)
      },
      {
        id: 'connect',
        name: 'Connect',
        fa: 'fa-terminal',
        hide: cnode.isParent || isK8s,
        click: this.onMenuConnect.bind(this)
      },
      {
        id: 'new-connection',
        name: 'Open in new window',
        fa: 'fa-external-link',
        hide: cnode.isParent,
        click: this.onMenuConnectNewTab.bind(this)
      },
      {
        id: 'split-connect',
        name: 'Split connect',
        fa: 'fa-columns',
        hide: viewList.length <= 0 || cnode.isParent || isK8s,
        click: this.onMenuConnect.bind(this, true)
      },
      {
        id: 'expand',
        name: 'Expand',
        fa: 'fa-angle-double-down',
        hide: !cnode.isParent || cnode.open,
        click: () => {
          tree.expandNode(cnode, true, false, true);
        }
      },
      {
        id: 'fold',
        name: 'Fold',
        fa: 'fa-angle-double-up',
        hide: !cnode.isParent || !cnode.open,
        click: () => {
          tree.expandNode(cnode, false, false, true);
        }
      },
      {
        id: 'expand-all',
        name: 'Expand all',
        fa: 'fa-expand',
        hide: !cnode.isParent || cnode.open || cnodeChildrenTotal > this.maxAllowExpandAllNodeTotal,
        click: this.onMenuExpandAllChildren.bind(this)
      },
      {
        id: 'fold-all',
        name: 'Fold all',
        fa: 'fa-compress',
        hide: !cnode.isParent || !cnode.open,
        click: () => {
          tree.expandNode(cnode, false, true, true);
        }
      },
      {
        id: 'favorite',
        name: 'Favorite',
        fa: 'fa-star-o',
        hide: this.isAssetFavorite() || cnode.isParent,
        click: this.onMenuFavorite.bind(this)
      },
      {
        id: 'disfavor',
        name: 'Disfavor',
        fa: 'fa-star',
        hide: !this.isAssetFavorite() || cnode.isParent,
        click: this.onMenuFavorite.bind(this)
      }
    ];
  }

  ngOnInit() {
    this.currentOrgID = this._cookie.get('X-JMS-LUNA-ORG') || this._cookie.get('X-JMS-ORG');
    this._settingSvc.afterInited().then(state => {
      this.isLoadTreeAsync = this._settingSvc.isLoadTreeAsync();
      this.isOpenNewWindow = this._settingSvc.isOpenNewWindow();

      if (state) {
        if (!this._settingSvc.hasXPack() && this.currentOrgID === SYSTEM_ORG_ID) {
          this.currentOrgID = DEFAULT_ORG_ID;
        }
        this.initTree();
        this.trees.map((tree, index) => (index === 0 ? (tree.open = true) : (tree.open = false)));
      }
    });
    document.addEventListener('click', this.hideRMenu.bind(this), false);
  }

  initTree() {
    this.initAssetTree().then();
    this.initTypeTree().then();
  }

  handleMenuClick(menu: any) {
    menu.click();
    this.hideRMenu();
  }

  onNodeClick(event, treeId, treeNode, clickFlag) {
    const ztree = this.trees.find(t => t.name === treeId).ztree;

    if (treeNode.isParent) {
      ztree.expandNode(treeNode);
      return;
    }

    if (treeNode.chkDisabled) {
      this._message.warning(this._i18n.instant('DisabledAsset'));
      return;
    }

    if (treeNode.meta.data.platform_type === 'k8s') {
      return connectOnNewPage(treeNode, 'auto');
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

  async initAssetTree(refresh = false, search = '') {
    const config = {
      refresh,
      showFavoriteAssets: true,
      url: `/api/v1/perms/users/self/nodes/children/tree/?search=${search}`,
      asyncUrl: `/api/v1/perms/users/self/nodes/children/tree/?search=${search}`,
      // url: '/api/v1/perms/users/self/nodes/all-with-assets/tree/',
      // asyncUrl: '/api/v1/perms/users/self/nodes/children-with-assets/tree/?'
    };
    const tree = new Tree('AssetTree', 'My assets', false, true, true, true, config);
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
      }
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
      observe: 'response',
      params: { offset: offset }
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
        leading: true,
        trailing: false
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
    return { setting, url };
  }

  async initTreeInfo(tree: Tree, config: InitTreeConfig) {
    tree.inited = true;

    if (config.refresh) {
      tree = this.trees.find(t => t.name === tree.name);
    }
    const { setting, url } = this.cleanupTreeSetting(config);

    if (config.showFavoriteAssets) {
      this._http.getFavoriteAssets().subscribe(resp => {
        this.favoriteAssets = resp.map(i => i.asset);
      });
    }
    tree.loading = true;
    this._http.get(url).subscribe({
      next: (next) => {
        if (config.refresh) {
          // 如果是刷新，需要先销毁原来的树, 重新初始化
          tree.ztree.expandAll(false);
          tree.ztree.destroy();
        }
        const body = next.body;
        tree.ztree = $.fn.zTree.init($('#' + tree.name), setting, body);
      },
      error: (error) => {
        if (error.status === 400) {
          alert(error.error.detail);
        }
        this._logger.error('Get tree error: ', error);
      },
      complete: () => {
        tree.loading = false;
      }
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
    this.pos.top = top - 25 + 'px';
    this.rMenuList = this.getRMenuList();
    this.isShowRMenu = true;
  }

  hideRMenu() {
    this.isShowRMenu = false;
  }

  isAssetFavorite() {
    const assetId = this.rightClickSelectNode.id;
    return this.favoriteAssets.indexOf(assetId) !== -1;
  }

  onMenuExpandAllChildren(event, tree) {
    const ztree = this.rightClickSelectNode.ztree;
    this.expandAllChildren(ztree.setting.treeId, this.rightClickSelectNode);
  }

  expandAllChildren(treeId, treeNode) {
    if (treeNode.open) {
      return;
    }
    if (!treeNode.isParent) {
      return;
    }
    const self = this;
    const ztree = $.fn.zTree.getZTreeObj(treeId);
    const loaded = treeNode.children && treeNode.children.length > 0;
    if (!loaded) {
      // 未加载过子节点，先异步加载子节点
      this.asyncLoadChildNodesPromise(treeId, treeNode);
      return
    }

    // 已加载
    // 展开当前节点
    ztree.expandNode(treeNode, true, false, false, false);
    const children = (treeNode.children || []).filter(child => child.isParent)
    children.forEach(childNode => { 
      self.expandAllChildren(treeId, childNode);
    });
  }

  asyncLoadChildNodesPromise(treeId, treeNode) {
    const self = this;
    const ztree = $.fn.zTree.getZTreeObj(treeId);
    ztree.reAsyncChildNodesPromise(treeNode, 'no', false).then(() => {
      if (treeNode && treeNode.isParent && treeNode.children) {
        let children = (treeNode.children || []).filter(child => child.isParent)
        for (const childNode of children) {
          self.asyncLoadChildNodesPromise(treeId, childNode);
        }
      };
    });
  }

  onRightClick(event, treeId, treeNode) {
    if (!treeNode) {
      return null;
    }
    const ztree = this.trees.find(t => t.name === treeId).ztree;
    this.rightClickSelectNode = treeNode;
    this.rightClickSelectNode.ztree = ztree;
    if (
      !treeNode &&
      event.target.tagName.toLowerCase() !== 'button' &&
      $(event.target).parents('a').length === 0
    ) {
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
      const msg = this._i18n.instant('Split connect number');
      this._message.info(msg);
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
        this._toastr.success(msg, '', { nzClass: 'custom-success-notification' });
      });
    } else {
      this._http.favoriteAsset(assetId, true).subscribe(() => {
        this.favoriteAssets.push(assetId);
        const msg = this._i18n.instant('Favorite') + ' ' + this._i18n.instant('success');
        this._toastr.success(msg, '', { nzClass: 'custom-success-notification' });
      });
    }
  }

  filterAssetsServer(keyword, ztree) {
    if (!ztree) {
      return;
    }
    this.filterAssetCancel$.next(true);
    this.initAssetTree(true, keyword);
  }

  treeSearch(event, tree: Tree) {
    event.stopPropagation();
    const vm = this;
    const searchIcon = document.getElementById(`${tree.name}SearchIcon`);
    const searchInput = document.getElementById(`${tree.name}SearchInput`);
    searchIcon.classList.toggle('active');
    searchInput.focus();
    searchInput.onclick = e => {
      e.stopPropagation();
    };
    searchInput.onblur = (e: any) => {
      e.stopPropagation();
      if (!e.target.value) {
        searchIcon.classList.toggle('active');
      }
    };
    searchIcon.oninput = _.debounce(e => {
      e.stopPropagation();
      const value = e.target.value || '';
      vm.searchValue = value;
      vm.filterAssetsServer(value, tree.ztree);
    }, 450);
  }

  foldTree(tree: Tree) {
    this.trees.map(item => {
      if (!tree.inited) {
        this.initTreeInfo(tree, tree.config).then(() => {});
      }
      if (tree.name === item.name) {
        item.open = !item.open;
      } else {
        item.open = false;
      }
    });
  }
}
