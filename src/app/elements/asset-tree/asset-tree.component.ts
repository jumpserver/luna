import { Component, ElementRef, Input, OnInit, TemplateRef, ViewChild } from '@angular/core';
import { NzMessageService } from 'ng-zorro-antd/message';
import { NzModalService } from 'ng-zorro-antd/modal';
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
  // Current user's favorite folders, used to build "Favorite to xxx" menu on a normal asset
  favoriteFolders: Array<any> = [];
  // Checked favorite asset leaf nodes (for batch connect)
  favoriteChecked: Array<any> = [];
  // Input value of the create-folder dialog
  folderNameInput = '';
  @ViewChild('folderModalContent', { static: false }) folderModalContent: TemplateRef<any>;
  searchValue = '';
  currentOrgID = '';
  trees: Array<Tree> = [];
  assetTreeChecked = [];
  rMenuList: any[] = [];

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
    private _viewSrv: ViewService,
    private _modal: NzModalService
  ) {}

  getRMenuList() {
    if (!this.rightClickSelectNode) {
      return [];
    }
    const cnode = this.rightClickSelectNode;

    // Favorite tree root node: create folder + expand/fold all + batch connect
    if (cnode.isFavoriteRoot) {
      const favTree = cnode.ztree;
      const favChecked = favTree ? favTree.getCheckedNodes(true).filter(n => !n.isParent) : [];
      const favCheckEnable = favTree && favTree.setting.check && favTree.setting.check.enable;
      return [
        {
          id: 'batch-connect',
          name: this._i18n.instant('Connect checked') + ` (${favChecked.length})`,
          fa: 'fa-check-square-o',
          hide: favChecked.length === 0 || !favCheckEnable,
          click: this.onFavoriteConnectChecked.bind(this)
        },
        {
          id: 'create-folder',
          name: 'Create folder',
          fa: 'fa-folder-o',
          hide: false,
          click: this.onCreateFolder.bind(this, null)
        },
        {
          id: 'expand-all',
          name: 'Expand all',
          fa: 'fa-expand',
          hide: false,
          click: () => favTree && favTree.expandAll(true)
        },
        {
          id: 'fold-all',
          name: 'Fold all',
          fa: 'fa-compress',
          hide: false,
          click: () => favTree && favTree.expandAll(false)
        }
      ];
    }

    // Favorite folder node: create subfolder, delete folder, expand/fold
    if (cnode.isFavoriteFolder) {
      const favTree = cnode.ztree;
      return [
        {
          id: 'create-subfolder',
          name: 'Create subfolder',
          fa: 'fa-folder-o',
          hide: false,
          click: this.onCreateFolder.bind(this, cnode.favoriteFolderRealId)
        },
        {
          id: 'delete-folder',
          name: 'Delete folder',
          fa: 'fa-trash-o',
          hide: false,
          click: this.onDeleteFolder.bind(this)
        },
        {
          id: 'expand',
          name: 'Expand',
          fa: 'fa-angle-double-down',
          hide: cnode.open,
          click: () => favTree && favTree.expandNode(cnode, true, false, true)
        },
        {
          id: 'fold',
          name: 'Fold',
          fa: 'fa-angle-double-up',
          hide: !cnode.open,
          click: () => favTree && favTree.expandNode(cnode, false, false, true)
        }
      ];
    }

    // Asset node inside a favorite folder: connect / remove favorite
    if (cnode.favoriteFolderId) {
      const isK8sFav = cnode.meta.data.platform_type === 'k8s';
      const favViewList = this._viewSrv.viewList;
      return [
        {
          id: 'connect',
          name: 'Connect',
          fa: 'fa-terminal',
          hide: isK8sFav,
          click: this.onFavoriteConnect.bind(this)
        },
        {
          id: 'new-connection',
          name: 'Open in new window',
          fa: 'fa-external-link',
          hide: false,
          click: this.onFavoriteConnectNewTab.bind(this)
        },
        {
          id: 'split-connect',
          name: 'Split connect',
          fa: 'fa-columns',
          hide: favViewList.length <= 0 || isK8sFav,
          click: this.onFavoriteConnect.bind(this, true)
        },
        {
          id: 'remove-favorite',
          name: 'Remove favorite',
          fa: 'fa-star',
          hide: false,
          click: this.onRemoveFromFolder.bind(this)
        }
      ];
    }

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
        hide: !cnode.isParent || cnode.open,
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
      ...this.getFavoriteToMenus(cnode)
    ];
  }

  /**
   * Build "Favorite to xxx" menu items for a normal asset node (one flat item per folder).
   * Show a disabled hint when there is no folder yet.
   * @param cnode current right-clicked node
   */
  getFavoriteToMenus(cnode): any[] {
    if (cnode.isParent) {
      return [];
    }
    if (this.favoriteFolders.length === 0) {
      return [
        {
          id: 'no-folder',
          name: 'Please create a folder first',
          fa: 'fa-star-o',
          hide: false,
          disabled: true,
          click: () => {}
        }
      ];
    }
    return this.favoriteFolders.map(folder => ({
      id: 'favorite-to-' + folder.id,
      name: this._i18n.instant('Favorite to') + ` 「${folder.name}」`,
      fa: 'fa-star-o',
      hide: false,
      click: this.onFavoriteTo.bind(this, folder.id)
    }));
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
        // Favorite tree on top, but expand "My assets" by default
        this.trees.map(tree => (tree.open = tree.name === 'AssetTree'));
      }
    });
    document.addEventListener('click', this.hideRMenu.bind(this), false);
  }

  initTree() {
    this.initFavoriteTree().then();
    this.initAssetTree().then();
    this.initTypeTree().then();
  }

  handleMenuClick(menu: any) {
    if (menu.disabled) {
      return;
    }
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
      return connectOnNewPage(treeNode, 'new');
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
      url: '/api/v1/perms/users/self/nodes/all-with-assets/tree/',
      asyncUrl: '/api/v1/perms/users/self/nodes/children-with-assets/tree/?'
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

  /**
   * Init favorite tree: fetch folders and favorited assets, build root -> folder -> asset.
   * All data comes from backend; supports batch checking.
   */
  async initFavoriteTree(refresh = false) {
    const tree = new Tree('FavoriteTree', 'Favorites', false, false, false, true, { refresh });
    if (!refresh) {
      this.trees.push(tree);
    }
    this.buildFavoriteTree(tree);
  }

  /**
   * Fetch folders and favorited assets, render the favorite ztree
   * @param tree favorite tree object
   */
  buildFavoriteTree(tree: Tree) {
    tree.inited = true;
    tree.loading = true;
    Promise.all([
      this._http.getFavoriteFolders().toPromise(),
      this._http.getFavoriteAssets().toPromise()
    ])
      .then(([folders, favorites]) => {
        this.favoriteFolders = folders || [];
        const nodes: any[] = [];
        nodes.push({
          id: 'favorite-root',
          name: this._i18n.instant('Favorites'),
          isParent: true,
          open: true,
          isFavoriteRoot: true,
          nocheck: true,
          noR: false
        });
        // Folder nodes (nested: parent points to parent folder, top-level under favorite-root)
        this.favoriteFolders.forEach(folder => {
          nodes.push({
            id: 'folder-' + folder.id,
            pId: folder.parent ? 'folder-' + folder.parent : 'favorite-root',
            name: folder.name,
            isParent: true,
            open: false,
            isFavoriteFolder: true,
            favoriteFolderRealId: folder.id
          });
        });
        // Asset leaf nodes (an asset may be in multiple folders, so node id is folder+asset)
        (favorites || []).forEach(fav => {
          if (!fav.folder || !fav.asset_info) {
            return;
          }
          const info = fav.asset_info;
          nodes.push({
            id: 'fav-' + fav.folder + '-' + info.id,
            pId: 'folder-' + fav.folder,
            name: info.name,
            isParent: false,
            iconSkin: info.iconSkin,
            chkDisabled: info.chkDisabled,
            assetId: info.id,
            favoriteFolderId: fav.folder,
            meta: info.meta
          });
        });
        setTimeout(() => {
          if (tree.ztree) {
            tree.ztree.destroy();
          }
          const setting = {
            view: this.setting.view,
            data: this.setting.data,
            // Checking disabled by default, toggled by the top "batch" icon; parent cascades to children
            check: { enable: false, chkboxType: { Y: 'ps', N: 'ps' } },
            callback: {
              onClick: _.debounce(this.onFavoriteNodeClick, 300, {
                leading: true,
                trailing: false
              }).bind(this),
              onCheck: this.onFavoriteTreeCheck.bind(this),
              onRightClick: this.onRightClick.bind(this)
            }
          };
          tree.ztree = $.fn.zTree.init($('#' + tree.name), setting, nodes);
          tree.loading = false;
        }, 100);
      })
      .catch(error => {
        tree.loading = false;
        this._logger.error('Build favorite tree error: ', error);
      });
  }

  /**
   * Favorite tree check callback: record currently checked favorite asset leaf nodes
   */
  onFavoriteTreeCheck() {
    const tree = this.trees.find(t => t.name === 'FavoriteTree');
    if (tree && tree.ztree) {
      this.favoriteChecked = tree.ztree.getCheckedNodes(true).filter(n => !n.isParent);
    }
  }

  /**
   * Batch connect checked assets inside favorite folders
   */
  onFavoriteConnectChecked() {
    const tree = this.rightClickSelectNode.ztree;
    if (!tree || !tree.setting.check.enable) {
      return;
    }
    const nodes = tree.getCheckedNodes(true).filter(n => !n.isParent);
    const t = setInterval(() => {
      if (nodes.length === 0) {
        clearInterval(t);
        this.favoriteChecked = [];
        return;
      }
      if (this._appSvc.connectDialogShown) {
        return;
      }
      const node = this.buildConnectableNode(nodes.shift());
      this.connectAsset(node).then();
    }, 500);
  }

  /**
   * Click an asset leaf inside a favorite folder: connect directly (real asset id from assetId)
   */
  onFavoriteNodeClick(event, treeId, treeNode) {
    if (treeNode.isParent) {
      const ztree = this.trees.find(t => t.name === treeId).ztree;
      ztree.expandNode(treeNode);
      return;
    }
    const node = this.buildConnectableNode(treeNode);
    if (this.isOpenNewWindow) {
      connectOnNewPage(node, 'auto');
    } else {
      this.connectAsset(node).then();
    }
  }

  /**
   * Convert a favorite-folder asset node into a standard connectable node
   * @param treeNode favorite-folder asset ztree node
   */
  buildConnectableNode(treeNode): TreeNode {
    return {
      id: treeNode.assetId,
      name: treeNode.name,
      comment: '',
      title: treeNode.name,
      isParent: false,
      pId: treeNode.pId,
      open: false,
      iconSkin: '',
      meta: treeNode.meta
    };
  }

  /**
   * Favorite-folder asset: connect (current window or split)
   * @param splitConnect whether split connect
   */
  async onFavoriteConnect(splitConnect = false) {
    if (splitConnect && this._viewSrv.currentView.subViews.length >= 4) {
      const msg = this._i18n.instant('Split connect number');
      this._message.info(msg);
      return;
    }
    const node = this.buildConnectableNode(this.rightClickSelectNode);
    await this._appSvc.getConnectMethods();
    const evt = splitConnect
      ? new ConnectEvt(node, 'connect', true)
      : new ConnectEvt(node, 'connect');
    connectEvt.next(evt);
  }

  /**
   * Favorite-folder asset: connect in a new window
   */
  onFavoriteConnectNewTab() {
    const node = this.buildConnectableNode(this.rightClickSelectNode);
    connectOnNewPage(node, 'auto');
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

    tree.loading = true;
    const request = this._http.get(url, { observe: 'response' });
    request.subscribe(
      resp => {
        if (config.refresh) {
          tree.ztree.expandAll(false);
          tree.ztree.destroy();
        }
        let body = resp.body;
        // Remove the built-in flat Favorite node of "My assets" to avoid duplication with the favorite tree
        if (tree.name === 'AssetTree' && Array.isArray(body)) {
          body = body.filter(node => node.id !== 'favorite' && node.pId !== 'favorite');
        }
        const headers = resp.headers;
        setTimeout(() => {
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
      }
    );
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
    } else if (tree.name === 'FavoriteTree') {
      this.buildFavoriteTree(tree);
    }
  }

  stopOffsetTree(tree) {
    tree.complete = true;
  }

  async connectAsset(node: TreeNode) {
    await this._appSvc.getConnectMethods();
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
    const self = this;
    const ztree = $.fn.zTree.getZTreeObj(treeId);
    const treeIsAsync = ztree.setting.async.enable;
    const hasChildren = treeNode.children && treeNode.children.length > 0;
    if (!hasChildren && treeIsAsync) {
      ztree.reAsyncChildNodesPromise(treeNode, 'no', false).then(() => {
        this.reAsyncChildNodes(treeId, treeNode, false);
      });
    } else {
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
   * @param splitConnect whether split connect
   */
  async onMenuConnect(splitConnect = false) {
    if (splitConnect && this._viewSrv.currentView.subViews.length >= 4) {
      const msg = this._i18n.instant('Split connect number');
      this._message.info(msg);
      return;
    }
    const node = this.rightClickSelectNode;
    await this._appSvc.getConnectMethods();
    const action = 'connect';
    const evt = splitConnect ? new ConnectEvt(node, action, true) : new ConnectEvt(node, action);
    connectEvt.next(evt);
  }

  onMenuConnectNewTab() {
    const node = this.rightClickSelectNode;
    connectOnNewPage(node, 'auto');
  }

  /**
   * Create folder: pop an input, validate empty/duplicate name, then call backend
   * @param parentId parent folder id, null means top-level
   */
  onCreateFolder(parentId: string = null) {
    this.folderNameInput = '';
    this._modal.create({
      nzTitle: this._i18n.instant(parentId ? 'Create subfolder' : 'Create folder'),
      nzContent: this.folderModalContent,
      nzOnOk: () => {
        const name = (this.folderNameInput || '').trim();
        if (!name) {
          this._message.warning(this._i18n.instant('Folder name is required'));
          return false;
        }
        const exists = this.favoriteFolders.some(
          f => f.name === name && (f.parent || null) === (parentId || null)
        );
        if (exists) {
          this._message.warning(this._i18n.instant('Folder already exists'));
          return false;
        }
        return this._http
          .createFavoriteFolder(name, parentId)
          .toPromise()
          .then(() => {
            const msg = this._i18n.instant('Create folder') + ' ' + this._i18n.instant('success');
            this._toastr.success(msg, '', { nzClass: 'custom-success-notification' });
            this.refreshFavoriteTree();
          })
          .catch(() => {
            this._message.error(this._i18n.instant('Folder already exists'));
            return false;
          });
      }
    });
  }

  /**
   * Delete folder: confirm then call backend (favorite relations cascade-removed)
   */
  onDeleteFolder() {
    const folderId = this.rightClickSelectNode.favoriteFolderRealId;
    const folderName = this.rightClickSelectNode.name;
    this._modal.confirm({
      nzTitle: this._i18n.instant('Delete folder') + ` 「${folderName}」?`,
      nzContent: this._i18n.instant('Assets in this folder will be removed from favorites'),
      nzOkDanger: true,
      nzOnOk: () => {
        return this._http
          .deleteFavoriteFolder(folderId)
          .toPromise()
          .then(() => {
            const msg = this._i18n.instant('Delete folder') + ' ' + this._i18n.instant('success');
            this._toastr.success(msg, '', { nzClass: 'custom-success-notification' });
            this.refreshFavoriteTree();
          });
      }
    });
  }

  /**
   * Favorite the current right-clicked asset into a folder.
   * On success, only append one leaf node into the folder (instantly visible),
   * without rebuilding the whole tree, to avoid collapsing expanded folders.
   * @param folderId target folder id
   */
  onFavoriteTo(folderId: string) {
    const srcNode = this.rightClickSelectNode;
    const assetId = srcNode.id;
    this._http.favoriteAssetToFolder(assetId, folderId).subscribe(
      () => {
        const msg = this._i18n.instant('Favorite') + ' ' + this._i18n.instant('success');
        this._toastr.success(msg, '', { nzClass: 'custom-success-notification' });
        this.appendFavoriteLeaf(folderId, srcNode);
      },
      error => {
        if (error && error.status === 400) {
          this._message.warning(this._i18n.instant('Already in this folder'));
        }
      }
    );
  }

  /**
   * After favoriting, append one asset leaf node into the target folder locally
   * @param folderId target folder id
   * @param srcNode the favorited asset source node (from asset/type tree)
   */
  appendFavoriteLeaf(folderId: string, srcNode: any) {
    const tree = this.trees.find(t => t.name === 'FavoriteTree');
    if (!tree || !tree.ztree) {
      return;
    }
    const ztree = tree.ztree;
    const parent = ztree.getNodeByParam('id', 'folder-' + folderId);
    if (!parent) {
      return;
    }
    const leafId = 'fav-' + folderId + '-' + srcNode.id;
    if (ztree.getNodeByParam('id', leafId)) {
      return;
    }
    ztree.addNodes(parent, -1, [
      {
        id: leafId,
        pId: 'folder-' + folderId,
        name: srcNode.name,
        isParent: false,
        iconSkin: srcNode.iconSkin,
        chkDisabled: srcNode.chkDisabled,
        assetId: srcNode.id,
        favoriteFolderId: folderId,
        meta: srcNode.meta
      }
    ]);
  }

  /**
   * Remove an asset from its folder.
   * On success, only remove this single leaf node (instantly disappears),
   * without rebuilding the whole tree, keeping other folders' expand state.
   */
  onRemoveFromFolder() {
    const node = this.rightClickSelectNode;
    const assetId = node.assetId;
    const folderId = node.favoriteFolderId;
    const ztree = node.ztree;
    this._http.removeFavoriteFromFolder(assetId, folderId).subscribe(() => {
      const msg = this._i18n.instant('Remove favorite') + ' ' + this._i18n.instant('success');
      this._toastr.success(msg, '', { nzClass: 'custom-success-notification' });
      if (ztree && typeof ztree.removeNode === 'function') {
        ztree.removeNode(node);
      } else {
        this.refreshFavoriteTree();
      }
    });
  }

  /**
   * Rebuild the favorite tree (used by create/delete folder, does not touch other trees)
   */
  refreshFavoriteTree() {
    const tree = this.trees.find(t => t.name === 'FavoriteTree');
    if (tree) {
      this.buildFavoriteTree(tree);
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
    const searchNode = tree.getNodesByFilter(node => node.id === 'search');
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
        tree.expandNodes.forEach(node => {
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

    matchedNodes.forEach(node => {
      const parents = this.recurseParent(node);
      const children = this.recurseChildren(node);
      shouldShow = [...shouldShow, ...parents, ...children, node];
    });
    tree.hiddenNodes = nodes;
    tree.expandNodes = shouldShow;
    tree.hideNodes(nodes);
    tree.showNodes(shouldShow);
    shouldShow.forEach(node => {
      if (node.isParent) {
        tree.expandNode(node, true);
      }
    });
  }

  filterAssetsServer(keyword, ztree) {
    if (!ztree) {
      return;
    }
    let searchNode = ztree.getNodesByFilter(node => node.id === 'search');
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
    this._http
      .getMyGrantedAssets(keyword)
      .pipe(takeUntil(this.filterAssetCancel$))
      .subscribe(nodes => {
        let name = this._i18n.instant('Search');
        const assetsAmount = nodes.length;
        name = `${name} (${assetsAmount})`;
        const newNode = { id: 'search', name: name, isParent: true, open: true, zAsync: true };
        searchNode = ztree.addNodes(null, newNode)[0];
        searchNode.zAsync = true;
        const nodesGroupByOrg = groupBy(nodes, node => {
          return node.meta.data.org_name;
        });
        nodesGroupByOrg.forEach(item => {
          const orgName = item[0].meta.data.org_name;
          const orgNodeData = {
            id: orgName,
            name: orgName,
            isParent: true,
            open: true,
            zAsync: true
          };
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
      return (
        host.name.toLowerCase().indexOf(keyword.toLowerCase()) !== -1 ||
        host.address.indexOf(keyword.toLowerCase()) !== -1
      );
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
    children.forEach(n => {
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
      vm.filterAssets(value, tree);
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
