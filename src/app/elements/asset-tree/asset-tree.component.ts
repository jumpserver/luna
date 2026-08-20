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
import { withSitePrefix } from '@app/utils/path';

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
  filterAssetCancel$: Subject<boolean> = new Subject();
  // Current user's favorite folders, used to build "Favorite to xxx" menu on a normal asset
  favoriteFolders: Array<any> = [];
  // Current user's favorite asset records, used to mark folders in "Favorite to" submenu
  favoriteAssets: Array<any> = [];
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
  // Prevent duplicate favorite requests when submenu click bubbles
  private favoritingInFlight = new Set<string>();

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
          name: this._i18n.instant('Create folder'),
          fa: 'fa-folder-o',
          hide: false,
          click: this.onCreateFolder.bind(this, null)
        },
        {
          id: 'expand-all',
          name: this._i18n.instant('Expand all'),
          fa: 'fa-expand',
          hide: false,
          click: () => favTree && favTree.expandAll(true)
        },
        {
          id: 'fold-all',
          name: this._i18n.instant('Fold all'),
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
          name: this._i18n.instant('Create subfolder'),
          fa: 'fa-folder-o',
          hide: false,
          click: this.onCreateFolder.bind(this, cnode.favoriteFolderRealId)
        },
        {
          id: 'rename-folder',
          name: this._i18n.instant('Rename'),
          fa: 'fa-pencil',
          hide: false,
          click: this.onRenameFolder.bind(this)
        },
        {
          id: 'delete-folder',
          name: this._i18n.instant('Delete folder'),
          fa: 'fa-trash-o',
          hide: false,
          click: this.onDeleteFolder.bind(this)
        },
        {
          id: 'expand',
          name: this._i18n.instant('Expand'),
          fa: 'fa-angle-double-down',
          hide: cnode.open,
          click: () => favTree && favTree.expandNode(cnode, true, false, true)
        },
        {
          id: 'fold',
          name: this._i18n.instant('Fold'),
          fa: 'fa-angle-double-up',
          hide: !cnode.open,
          click: () => favTree && favTree.expandNode(cnode, false, false, true)
        }
      ];
    }

    // Favorite asset leaf (under a folder or directly under root): connect / move / remove
    if (cnode.isFavoriteLeaf) {
      const isK8sFav = cnode.meta?.data?.platform_type === 'k8s';
      const favViewList = this._viewSrv.viewList;
      return [
        {
          id: 'connect',
          name: this._i18n.instant('Connect'),
          fa: 'fa-terminal',
          hide: isK8sFav,
          click: this.onFavoriteConnect.bind(this)
        },
        {
          id: 'new-connection',
          name: this._i18n.instant('Open in new window'),
          fa: 'fa-external-link',
          hide: false,
          click: this.onFavoriteConnectNewTab.bind(this)
        },
        {
          id: 'split-connect',
          name: this._i18n.instant('Split connect'),
          fa: 'fa-columns',
          hide: favViewList.length <= 0 || isK8sFav,
          click: this.onFavoriteConnect.bind(this, true)
        },
        ...this.getMoveToMenus(cnode),
        {
          id: 'remove-favorite',
          name: this._i18n.instant('Remove favorite'),
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
        name: this._i18n.instant('Connect'),
        fa: 'fa-terminal',
        hide: cnode.isParent || isK8s,
        click: this.onMenuConnect.bind(this)
      },
      {
        id: 'new-connection',
        name: this._i18n.instant('Open in new window'),
        fa: 'fa-external-link',
        hide: cnode.isParent,
        click: this.onMenuConnectNewTab.bind(this)
      },
      {
        id: 'split-connect',
        name: this._i18n.instant('Split connect'),
        fa: 'fa-columns',
        hide: viewList.length <= 0 || cnode.isParent || isK8s,
        click: this.onMenuConnect.bind(this, true)
      },
      {
        id: 'expand',
        name: this._i18n.instant('Expand'),
        fa: 'fa-angle-double-down',
        hide: !cnode.isParent || cnode.open,
        click: () => {
          tree.expandNode(cnode, true, false, true);
        }
      },
      {
        id: 'fold',
        name: this._i18n.instant('Fold'),
        fa: 'fa-angle-double-up',
        hide: !cnode.isParent || !cnode.open,
        click: () => {
          tree.expandNode(cnode, false, false, true);
        }
      },
      {
        id: 'expand-all',
        name: this._i18n.instant('Expand all'),
        fa: 'fa-expand',
        hide: !cnode.isParent || cnode.open,
        click: this.onMenuExpandAllChildren.bind(this)
      },
      {
        id: 'fold-all',
        name: this._i18n.instant('Fold all'),
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
   * Build a "Favorite to" parent menu with folder submenu for a normal asset node.
   * Show a disabled parent when there is no folder yet.
   * @param cnode current right-clicked node
   */
  getFavoriteToMenus(cnode): any[] {
    if (cnode.isParent) {
      return [];
    }
    return this.buildFolderTargetMenus({
      id: 'favorite-to',
      name: this._i18n.instant('Favorite to'),
      fa: 'fa-star-o',
      assetId: this.resolveAssetId(cnode),
      onSelect: this.onFavoriteTo.bind(this)
    });
  }

  /**
   * Build a "Move to" parent menu for a favorite-tree asset leaf,
   * so it can be relocated into another favorite folder.
   */
  getMoveToMenus(cnode): any[] {
    return this.buildFolderTargetMenus({
      id: 'move-to',
      name: this._i18n.instant('Move to'),
      fa: 'fa-folder-o',
      assetId: this.resolveAssetId(cnode),
      onSelect: this.onMoveTo.bind(this)
    });
  }

  /**
   * Shared folder submenu builder for "Favorite to" / "Move to".
   */
  private buildFolderTargetMenus(options: {
    id: string;
    name: string;
    fa: string;
    assetId: string;
    onSelect: (folderId: string) => void;
  }): any[] {
    if (this.favoriteFolders.length === 0) {
      return [
        {
          id: options.id,
          name: options.name,
          fa: options.fa,
          hide: false,
          children: [
            {
              id: 'create-folder-and-favorite',
              name: this._i18n.instant('Create folder and favorite'),
              click: this.onCreateFolderAndFavorite.bind(this)
            }
          ]
        }
      ];
    }
    const favoritedFolderIds = this.getAssetFavoriteFolderIds(options.assetId);
    return [
      {
        id: options.id,
        name: options.name,
        fa: options.fa,
        hide: false,
        children: this.favoriteFolders.map(folder => {
          const folderId = this.resolveFolderId(folder);
          return {
            id: options.id + '-' + folderId,
            name: folder.name,
            checked: favoritedFolderIds.has(folderId),
            click: () => options.onSelect(folderId)
          };
        })
      }
    ];
  }

  /**
   * Get folder ids that already contain the given asset.
   */
  private getAssetFavoriteFolderIds(assetId: string): Set<string> {
    const folderIds = new Set<string>();
    if (!assetId) {
      return folderIds;
    }
    (this.favoriteAssets || []).forEach(fav => {
      const folderId = this.resolveFolderId(fav.folder ?? fav.folder_id);
      const favAssetId = this.resolveAssetId({
        id: fav.asset_info?.id,
        assetId: fav.asset_info?.id,
        meta: fav.asset_info?.meta
      });
      if (folderId && favAssetId === assetId) {
        folderIds.add(folderId);
      }
    });
    const tree = this.trees.find(t => t.name === 'FavoriteTree');
    if (tree?.ztree) {
      tree.ztree
        .getNodesByFilter(node => !node.isParent && String(node.assetId) === assetId)
        .forEach(node => {
          if (node.favoriteFolderId) {
            folderIds.add(String(node.favoriteFolderId));
          }
        });
    }
    return folderIds;
  }

  /**
   * An asset belongs to only one folder: replace any previous record with the new one.
   */
  private setFavoriteAssetRecord(folderId: string, assetId: string, srcNode?: any) {
    this.favoriteAssets = (this.favoriteAssets || []).filter(fav => {
      const favAssetId = this.resolveAssetId({
        id: fav.asset_info?.id,
        assetId: fav.asset_info?.id,
        meta: fav.asset_info?.meta
      });
      return favAssetId !== assetId;
    });
    this.favoriteAssets.push({
      folder: folderId,
      asset_info: {
        id: assetId,
        name: srcNode?.name,
        meta: srcNode?.meta
      }
    });
  }

  private removeFavoriteAssetRecord(folderId: string, assetId: string) {
    this.favoriteAssets = this.favoriteAssets.filter(fav => {
      const favFolderId = this.resolveFolderId(fav.folder ?? fav.folder_id);
      const favAssetId = this.resolveAssetId({
        id: fav.asset_info?.id,
        assetId: fav.asset_info?.id,
        meta: fav.asset_info?.meta
      });
      return !(favFolderId === folderId && favAssetId === assetId);
    });
  }

  /**
   * Normalize folder id from API/menu values.
   */
  private resolveFolderId(folderOrId: any): string {
    if (folderOrId == null) {
      return '';
    }
    if (typeof folderOrId === 'object') {
      return String(folderOrId.id ?? folderOrId.pk ?? folderOrId.folder_id ?? '');
    }
    return String(folderOrId);
  }

  private resolveCreatedFavoriteFolderId(folder: any, name: string, parentId: string = null): Promise<string> {
    const createdFolderId = this.resolveFolderId(folder);
    if (createdFolderId) {
      return Promise.resolve(createdFolderId);
    }
    const normalizedParentId = this.resolveFolderId(parentId);
    return this._http
      .getFavoriteFolders()
      .toPromise()
      .then(folders => {
        this.favoriteFolders = folders || [];
        const createdFolder = this.favoriteFolders.find(
          f => f.name === name && this.resolveFolderId(f.parent) === normalizedParentId
        );
        return this.resolveFolderId(createdFolder);
      });
  }

  /**
   * Resolve the real asset id from tree/favorite nodes.
   */
  private resolveAssetId(node: any): string {
    return String(node?.assetId ?? node?.meta?.data?.id ?? node?.id ?? '');
  }

  /**
   * Build a unique favorite leaf id for zTree (folder + asset).
   */
  private buildFavoriteLeafId(folderId: string, assetId: string): string {
    return `fav-${this.resolveFolderId(folderId)}-${this.resolveAssetId({ id: assetId, assetId })}`;
  }

  ngOnInit() {
    this.currentOrgID = this._cookie.get('X-JMS-LUNA-ORG') || this._cookie.get('X-JMS-ORG');
    this._settingSvc.afterInited().then(state => {
      this.isLoadTreeAsync = this._settingSvc.isLoadTreeAsync();

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

  handleMenuClick(menu: any, event?: MouseEvent) {
    if (menu.disabled) {
      return;
    }
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    menu.click();
    setTimeout(() => this.hideRMenu());
  }

  handleSubmenuClick(event: MouseEvent, menu: any) {
    this.handleMenuClick(menu, event);
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

    if (this._settingSvc.isOpenNewWindow()) {
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
      // dev 方案（当前生效）：直接使用原始接口地址
      url: '/api/v1/perms/users/self/nodes/all-with-assets/tree/',
      asyncUrl: '/api/v1/perms/users/self/nodes/children-with-assets/tree/?'
      // 多子目录方案（保留备用）：site prefix 包裹 + showFavoriteAssets
      // showFavoriteAssets: true,
      // url: withSitePrefix('/api/v1/perms/users/self/nodes/all-with-assets/tree/'),
      // asyncUrl: withSitePrefix('/api/v1/perms/users/self/nodes/children-with-assets/tree/?')
    };
    const tree = new Tree('AssetTree', this._i18n.instant('My assets'), false, true, true, true, config);
    if (!refresh) {
      this.trees.push(tree);
    }
    this.initTreeInfo(tree, config).then();
  }

  async initTypeTree(refresh = false) {
    const config = {
      refresh,
      url: withSitePrefix('/api/v1/perms/users/self/nodes/children-with-assets/category/tree/?sync=1'),
      asyncUrl: withSitePrefix('/api/v1/perms/users/self/nodes/children-with-assets/category/tree/'),
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
    const tree = new Tree('FavoriteTree', this._i18n.instant('Favorites'), false, false, false, true, { refresh });
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
        this.favoriteAssets = favorites || [];
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
          const folderId = this.resolveFolderId(folder);
          nodes.push({
            id: 'folder-' + folderId,
            pId: folder.parent ? 'folder-' + this.resolveFolderId(folder.parent) : 'favorite-root',
            name: folder.name,
            isParent: true,
            open: false,
            isFavoriteFolder: true,
            favoriteFolderRealId: folderId
          });
        });
        // Asset leaf nodes: under folder when folder is set, otherwise under favorite root
        (favorites || []).forEach(fav => {
          if (!fav.asset_info) {
            return;
          }
          const folderId = this.resolveFolderId(fav.folder ?? fav.folder_id);
          const info = fav.asset_info;
          const assetId = this.resolveAssetId({ id: info.id, assetId: info.id, meta: info.meta });
          if (!assetId) {
            return;
          }
          nodes.push({
            id: this.buildFavoriteLeafId(folderId || 'root', assetId),
            pId: folderId ? 'folder-' + folderId : 'favorite-root',
            name: info.name,
            isParent: false,
            iconSkin: info.iconSkin,
            chkDisabled: info.chkDisabled,
            assetId,
            favoriteFolderId: folderId || null,
            isFavoriteLeaf: true,
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
    if (this._settingSvc.isOpenNewWindow()) {
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

  onCreateFolderAndFavorite() {
    this.onCreateFolder(null, this.rightClickSelectNode);
  }

  /**
   * Create folder: pop an input, validate empty/duplicate name, then call backend
   * @param parentId parent folder id, null means top-level
   */
  onCreateFolder(parentId: string = null, favoriteNode: any = null) {
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
          .then(folder => {
            const msg = this._i18n.instant('Create folder') + ' ' + this._i18n.instant('success');
            if (favoriteNode) {
              return this.resolveCreatedFavoriteFolderId(folder, name, parentId)
                .then(createdFolderId => {
                  if (!createdFolderId) {
                    this.refreshFavoriteTree();
                    return;
                  }
                  return this.favoriteAssetToFolder(createdFolderId, favoriteNode, 'Favorite', {
                    refreshTreeOnSuccess: true
                  }).catch(() => {
                    this.refreshFavoriteTree();
                  });
                })
                .then(() => {
                  this._toastr.success(msg, '', { nzClass: 'custom-success-notification' });
                });
            }
            this._toastr.success(msg, '', { nzClass: 'custom-success-notification' });
            this.refreshFavoriteTree();
          }, error => {
            if (error && error.status === 400) {
              this._message.error(this._i18n.instant('Folder already exists'));
            }
            return false;
          })
          .catch(() => {
            return false;
          });
      }
    });
  }

  /**
   * Rename folder: pop an input, validate, then update backend and local ztree node
   */
  onRenameFolder() {
    const folderId = this.rightClickSelectNode.favoriteFolderRealId;
    const currentName = this.rightClickSelectNode.name;
    this.folderNameInput = currentName;
    this._modal.create({
      nzTitle: this._i18n.instant('Rename folder'),
      nzContent: this.folderModalContent,
      nzOnOk: () => {
        const name = (this.folderNameInput || '').trim();
        if (!name) {
          this._message.warning(this._i18n.instant('Folder name is required'));
          return false;
        }
        if (name === currentName) {
          return true;
        }
        const folder = this.favoriteFolders.find(f => this.resolveFolderId(f) === folderId);
        const parentId = folder?.parent || null;
        const exists = this.favoriteFolders.some(
          f =>
            f.name === name &&
            (f.parent || null) === (parentId || null) &&
            this.resolveFolderId(f) !== folderId
        );
        if (exists) {
          this._message.warning(this._i18n.instant('Folder already exists'));
          return false;
        }
        return this._http
          .updateFavoriteFolder(folderId, name)
          .toPromise()
          .then(() => {
            this.renameFavoriteFolderLocally(folderId, name);
            const msg = this._i18n.instant('Rename') + ' ' + this._i18n.instant('success');
            this._toastr.success(msg, '', { nzClass: 'custom-success-notification' });
          })
          .catch(() => {
            this._message.error(this._i18n.instant('Folder already exists'));
            return false;
          });
      }
    });
  }

  /**
   * Update folder name locally without rebuilding the whole favorite tree
   */
  renameFavoriteFolderLocally(folderId: string, name: string) {
    const folder = this.favoriteFolders.find(f => this.resolveFolderId(f) === folderId);
    if (folder) {
      folder.name = name;
    }
    const tree = this.trees.find(t => t.name === 'FavoriteTree');
    if (tree?.ztree) {
      const node = tree.ztree.getNodeByParam('id', 'folder-' + folderId);
      if (node) {
        node.name = name;
        tree.ztree.updateNode(node);
      }
    }
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
   * An asset can only belong to one folder: backend moves it, and the local tree
   * removes the leaf from any previous folder before adding it under the target.
   * @param folderId target folder id
   */
  onFavoriteTo(folderId: string) {
    this.favoriteAssetToFolder(folderId, this.rightClickSelectNode, 'Favorite').catch(() => {});
  }

  /** Move a favorite-tree asset leaf into another folder. */
  onMoveTo(folderId: string) {
    this.favoriteAssetToFolder(folderId, this.rightClickSelectNode, 'Move').catch(() => {});
  }

  private favoriteAssetToFolder(
    folderId: string,
    srcNode: any,
    actionKey: string = 'Favorite',
    options: { refreshTreeOnSuccess?: boolean } = {}
  ): Promise<void> {
    const normalizedFolderId = this.resolveFolderId(folderId);
    const assetId = this.resolveAssetId(srcNode);
    if (!normalizedFolderId || !assetId) {
      return Promise.resolve();
    }
    const currentFolderId = this.resolveFolderId(srcNode.favoriteFolderId);
    if (currentFolderId && currentFolderId === normalizedFolderId) {
      this._message.warning(this._i18n.instant('Already in this folder'));
      return Promise.resolve();
    }
    const favoritingKey = `${assetId}-${normalizedFolderId}`;
    if (this.favoritingInFlight.has(favoritingKey)) {
      return Promise.resolve();
    }
    this.favoritingInFlight.add(favoritingKey);
    return this._http
      .favoriteAssetToFolder(assetId, normalizedFolderId)
      .toPromise()
      .then(() => {
        const msg = this._i18n.instant(actionKey) + ' ' + this._i18n.instant('success');
        this._toastr.success(msg, '', { nzClass: 'custom-success-notification' });
        this.setFavoriteAssetRecord(normalizedFolderId, assetId, srcNode);
        if (options.refreshTreeOnSuccess) {
          this.refreshFavoriteTree();
        } else {
          this.moveFavoriteLeaf(normalizedFolderId, srcNode, assetId);
        }
      })
      .catch(error => {
        if (error && error.status === 400) {
          this._message.warning(this._i18n.instant('Already in this folder'));
        }
        return Promise.reject(error);
      })
      .finally(() => {
        this.favoritingInFlight.delete(favoritingKey);
      });
  }

  /**
   * Move an asset leaf into the target folder locally.
   * Remove every existing leaf of this asset first, so it never appears under two folders.
   * @param folderId target folder id
   * @param srcNode the favorited asset source node (from asset/type tree)
   */
  moveFavoriteLeaf(folderId: string, srcNode: any, assetId?: string) {
    const tree = this.trees.find(t => t.name === 'FavoriteTree');
    if (!tree || !tree.ztree) {
      return;
    }
    const ztree = tree.ztree;
    const normalizedFolderId = this.resolveFolderId(folderId);
    const normalizedAssetId = assetId || this.resolveAssetId(srcNode);
    if (!normalizedFolderId || !normalizedAssetId) {
      return;
    }

    // One asset -> one folder: drop leaves under any other folder first
    const existingLeaves = ztree.getNodesByFilter(
      node => !node.isParent && String(node.assetId) === normalizedAssetId
    );
    existingLeaves.forEach(node => {
      ztree.removeNode(node);
    });

    const parent = ztree.getNodeByParam('id', 'folder-' + normalizedFolderId);
    if (!parent) {
      return;
    }
    const leafId = this.buildFavoriteLeafId(normalizedFolderId, normalizedAssetId);
    ztree.addNodes(parent, -1, [
      {
        id: leafId,
        pId: 'folder-' + normalizedFolderId,
        name: srcNode.name,
        isParent: false,
        iconSkin: srcNode.iconSkin,
        chkDisabled: srcNode.chkDisabled,
        assetId: normalizedAssetId,
        favoriteFolderId: normalizedFolderId,
        isFavoriteLeaf: true,
        meta: srcNode.meta
      }
    ]);
  }

  /**
   * Remove an asset from favorites (from a folder, or from root when folder is empty).
   * On success, only remove this single leaf node (instantly disappears),
   * without rebuilding the whole tree, keeping other folders' expand state.
   */
  onRemoveFromFolder() {
    const node = this.rightClickSelectNode;
    const assetId = node.assetId;
    const folderId = this.resolveFolderId(node.favoriteFolderId);
    const ztree = node.ztree;
    const remove$ = folderId
      ? this._http.removeFavoriteFromFolder(assetId, folderId)
      : this._http.favoriteAsset(assetId, false);
    remove$.subscribe(() => {
      this.removeFavoriteAssetRecord(folderId, assetId);
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
    const normalizedKeyword = keyword.toLowerCase();
    const filterAssetsCallback = (node: TreeNode) => {
      if (node.isParent) {
        return (node.name || '').toLowerCase().includes(normalizedKeyword);
      }
      const host = node.meta?.data;
      return (
        (host?.name || '').toLowerCase().includes(normalizedKeyword) ||
        (host?.address || '').toLowerCase().includes(normalizedKeyword)
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
    return children.reduce(
      (allChildren, child) => [...allChildren, child, ...this.recurseChildren(child)],
      []
    );
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
