import {Component, Input, OnInit, OnDestroy, ElementRef, ViewChild, Inject} from '@angular/core';
import {MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';
import {BehaviorSubject, Subject} from 'rxjs';
import {takeUntil} from 'rxjs/operators';
import {ActivatedRoute} from '@angular/router';
import {ToastrService} from 'ngx-toastr';
import {TranslateService} from '@ngx-translate/core';
import {groupBy} from '@app/utils/common';
import {AppService, HttpService, LogService, NavService, SettingService, TreeFilterService} from '@app/services';
import {connectEvt} from '@app/globals';
import {TreeNode, ConnectEvt} from '@app/model';
import {AssetTreeDialogComponent} from '@app/elements/connect/connect.component';
import {ancestorWhere} from 'tslint';

declare var $: any;

@Component({
  selector: 'elements-asset-tree',
  templateUrl: './asset-tree.component.html',
  styleUrls: ['./asset-tree.component.scss'],
})
export class ElementAssetTreeComponent implements OnInit, OnDestroy {
  @Input() query: string;
  @Input() searchEvt$: BehaviorSubject<string>;
  @ViewChild('rMenu') rMenu: ElementRef;
  @ViewChild('rootRMenu') rootRMenu: ElementRef;
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
  applicationsTree: any;
  isShowRMenu = false;
  isShowRootRMenu = false;
  rightClickSelectNode: any;
  hasLoginTo = false;
  treeFilterSubscription: any;
  isLoadTreeAsync: boolean;
  filterAssetCancel$: Subject<boolean> = new Subject();
  loading = true;
  favoriteAssets = [];

  constructor(private _appSvc: AppService,
              private _treeFilterSvc: TreeFilterService,
              public _dialog: MatDialog,
              public _logger: LogService,
              public translate: TranslateService,
              private activatedRoute: ActivatedRoute,
              private _http: HttpService,
              private settingSvc: SettingService,
              private toastr: ToastrService
  ) {}

  ngOnInit() {
    this.isLoadTreeAsync = this.settingSvc.isLoadTreeAsync();
    this.initTree();
    document.addEventListener('click', this.hideRMenu.bind(this), false);

    this.treeFilterSubscription = this._treeFilterSvc.onFilter.subscribe(
      keyword => {
        this._logger.debug('Filter tree: ', keyword);
        this.filterAssets(keyword);
        this.filterApplicationsTree(keyword);
      }
    );
  }

  ngOnDestroy(): void {
    this.treeFilterSubscription.unsubscribe();
  }

  onAssetsNodeClick(event, treeId, treeNode, clickFlag) {
    if (treeNode.isParent) {
      this.assetsTree.expandNode(treeNode);
    } else {
      if (treeNode.chkDisabled) {
        this._dialog.open(DisabledAssetsDialogComponent, {
          height: '200px',
          width: '450px'
        });
        return;
      }
      this._http.getUserProfile().subscribe();
      this.connectAsset(treeNode);
    }
  }

  refreshAssetsTree() {
    this.initAssetsTree(false).then();
  }

  async initAssetsTree(refresh?: boolean) {
    const setting = Object.assign({}, this.setting);
    const myAssetsNodes = [
      {
        name: await this.translate.get('My assets').toPromise(),
        id: 'myAssets', isParent: true,
        title: 'My assets',
        children: [], open: true
      }
    ];
    setting['callback'] = {
      onClick: this.onAssetsNodeClick.bind(this),
      onRightClick: this.onRightClick.bind(this)
    };
    if (this.isLoadTreeAsync) {
      setting['async'] = {
        enable: true,
        url: '/api/v1/perms/users/nodes/children-with-assets/tree/?cache_policy=1',
        autoParam: ['id=key', 'name=n', 'level=lv'],
        type: 'get'
      };
    }

    this._http.getFavoriteAssets().subscribe(resp => {
      this.favoriteAssets = resp.map(i => i.asset);
    });

    this.loading = true;
    this._http.getMyGrantedNodes(this.isLoadTreeAsync, refresh).subscribe(resp => {
      this.loading = false;
      if (refresh) {
        this.assetsTree.destroy();
      }
      const _assetTree = $.fn.zTree.init($('#assetsTree'), setting, resp);
      myAssetsNodes[0].children = _assetTree.getNodes();
      // 销毁临时树
      $.fn.zTree.destroy(_assetTree);
      const myAssetsTree = $.fn.zTree.init($('#myAssets'), setting, myAssetsNodes);
      this.assetsTree = myAssetsTree;
      this.rootNodeAddDom(myAssetsTree, () => {
        this.refreshAssetsTree();
      });
      _assetTree.destroy();
    }, error => {
      this.loading = false;
    });
  }

  addApplicationNodesIfNeed(nodes, rootNode, applicationNodes) {
      rootNode['children'] = nodes;
      if (nodes.length > 0) {
        applicationNodes[0].children.push(rootNode);
      }
  }

  async initApplicationTree() {
    const setting = Object.assign({}, this.setting);
    setting['callback'] = {
      onClick: this.onApplicationTreeNodeClick.bind(this),
      onRightClick: this.onRightClick.bind(this)
    };
    const applicationNodes = [
      {
        name: await this.translate.get('My applications').toPromise(),
        id: 'myApplication', isParent: true,
        title: 'My applications',
        children: [], open: true
      }
    ];
    const remoteAppRootNode = {
      iconSkin: '',
      id: 'ID_REMOTE_APP_ROOT',
      isParent: true,
      meta: {type: 'remote_app'},
      name: this.translate.instant('Remote apps'),
      nocheck: false,
      open: false,
      pId: '',
      title: 'RemoteApp'
    };
    const dbRootNode = {
      iconSkin: '',
      id: 'ID_DATABASE_APP_ROOT',
      isParent: true,
      meta: {type: 'database_app'},
      name: await this.translate.get('Databases').toPromise(),
      nocheck: false,
      open: false,
      pId: '',
      title: 'DatabaseApp'
    };
    const cloudAppRootNode = {
      iconSkin: '',
      id: 'ID_K8S_APP_ROOT',
      isParent: true,
      meta: {type: 'k8s_app'},
      name: await this.translate.get('Kubernetes').toPromise(),
      nocheck: false,
      open: false,
      pId: '',
      title: 'K8sApp'
    };
    const dbNodes = await this._http.getMyGrantedDBApps().toPromise();
    if (dbNodes.length > 0) {
      const _dbTree = $.fn.zTree.init($('#DBAppsTree'), setting, dbNodes);
      dbRootNode['children'] = _dbTree.getNodes();
      applicationNodes[0].children.push(dbRootNode);
      $.fn.zTree.destroy(_dbTree);
    }
    const remoteNodes = await this._http.getMyGrantedRemoteApps().toPromise();
    if (remoteNodes.length > 0) {
      const _remoteTree = $.fn.zTree.init($('#remoteAppsTree'), setting, remoteNodes);
      remoteAppRootNode['children'] = _remoteTree.getNodes();
      applicationNodes[0].children.push(remoteAppRootNode);
      $.fn.zTree.destroy(_remoteTree);
    }
    const cloudNodes = await this._http.getMyGrantedK8SApps().toPromise();
    if (cloudNodes.length > 0) {
      const _cloudTree = $.fn.zTree.init($('#K8SAppsTree'), setting, remoteNodes);
      cloudAppRootNode['children'] = _cloudTree.getNodes();
      applicationNodes[0].children.push(cloudAppRootNode);
      $.fn.zTree.destroy(_cloudTree);
    }
    if (applicationNodes[0].children.length > 0) {
      const tree = $.fn.zTree.init($('#applicationsTree'), setting, applicationNodes);
      this.rootNodeAddDom(tree, () => {
        this.refreshApplicationTree();
      });
      this.applicationsTree = tree;
    }

  }

  refreshApplicationTree() {
    if (this.applicationsTree) {
      this.applicationsTree.destroy();
      this.initApplicationTree().then();
    }
  }

  onApplicationTreeNodeClick(event, treeId, treeNode, clickFlag) {
    if (!treeNode.isParent) {
      this._http.getUserProfile().subscribe();
      this.connectAsset(treeNode);
    } else {
      this.applicationsTree.expandNode(treeNode);
    }
  }

  initTree() {
    this.initAssetsTree(false).then();
    this.initApplicationTree().then();
  }

  connectAsset(node: TreeNode) {
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
    this.pos.top = (top - 25)  + 'px';
    this.isShowRMenu = true;
  }

  showRootRMenu(left, top) {
    const clientHeight = document.body.clientHeight;
    if (top + 60 > clientHeight) {
      top -= 60;
    }
    this.pos.left = left + 'px';
    this.pos.top = (top - 25)  + 'px';
    this.isShowRootRMenu = true;
  }

  hideRMenu() {
    this.isShowRMenu = false;
    this.isShowRootRMenu = false;
  }

  nodeSupportSSH() {
    const host = this.rightClickSelectNode.meta.asset;
    if (!host) {
      return false;
    }
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
    return findSSHProtocol;
  }

  isAssetFavorite() {
    const host = this.rightClickSelectNode.meta.asset;
    if (!host) {
      return false;
    }
    const assetId = host.id;
    return this.favoriteAssets.indexOf(assetId) !== -1;
  }

  isAssetNode() {
    return this.rightClickSelectNode.meta.asset;
  }

  get RMenuList() {
    const menuList = [{
      'id': 'new-connection',
      'name': 'Open in new window',
      'fa': 'fa-terminal',
      'hide': false,
      'click': this.connectInNewWindow.bind(this)
    }, {
      'id': 'file-manager',
      'name': 'File Manager',
      'fa': 'fa-file',
      'hide': !this.nodeSupportSSH(),
      'click': this.connectFileManager.bind(this)
    }, {
      'id': 'favorite',
      'name': 'Favorite',
      'fa': 'fa-star-o',
      'hide': this.isAssetFavorite() || !this.isAssetNode(),
      'click': this.favoriteAsset.bind(this)
    }, {
      'id': 'disfavor',
      'name': 'Disfavor',
      'fa': 'fa-star',
      'hide': !this.isAssetFavorite() || !this.isAssetNode(),
      'click': this.favoriteAsset.bind(this)
    }];
    if (!this.rightClickSelectNode) {
      return [];
    }

    return menuList;
  }

  forceRefreshTree() {
    this.initAssetsTree(true).then();
  }

  get RootRMenuList() {
    const menuList = [{
      'id': 'refresh',
      'name': 'Force refresh',
      'fa': 'fa-refresh',
      'hide': false,
      'click': this.forceRefreshTree.bind(this)
    }];
    return menuList;
  }


  onRightClick(event, treeId, treeNode) {

    if (treeNode.id === 'myAssets') {
      this.showRootRMenu(event.clientX, event.clientY);
      return;
    }
    if (!treeNode || treeNode.isParent) {
      return null;
    }
    this.rightClickSelectNode = treeNode;

    if (!treeNode && event.target.tagName.toLowerCase() !== 'button'
          && $(event.target).parents('a').length === 0) {
      this.assetsTree.cancelSelectedNode();
      this.showRMenu(event.clientX, event.clientY);
    } else if (treeNode && !treeNode.noR) {
      this.assetsTree.selectNode(treeNode);
      this.showRMenu(event.clientX, event.clientY);
      this.rightClickSelectNode = treeNode;
    }
  }

  connectFileManager() {
    const node = this.rightClickSelectNode;
    const evt = new ConnectEvt(node, 'sftp');
    connectEvt.next(evt);
  }

  connectInNewWindow() {
    const node = this.rightClickSelectNode;
    let url = '/luna/connect?';
    switch (node.meta.type) {
      case 'asset':
        url += 'asset=' + node.meta.asset.id;
        break;
      case 'remote_app':
        url += 'remote_app=' + node.id;
        break;
      case 'k8s_app':
        url += 'k8s_app=' + node.id;
        break;
      case 'database_app':
        url += 'database_app=' + node.id;
        break;
      default:
        alert('Unknown type: ' + node.meta.type);
        return;
    }
    window.open(url, '_blank');
  }

  favoriteAsset() {
    const host = this.rightClickSelectNode.meta.asset;
    if (!host) {
      return false;
    }
    const assetId = host.id;
    if (this.isAssetFavorite()) {
      this._http.favoriteAsset(assetId, false).subscribe(() => {
        const i = this.favoriteAssets.indexOf(assetId);
        this.favoriteAssets.splice(i, 1);
        this.toastr.success(this.translate.instant('Disfavor') + ' ' + this.translate.instant('success'), '', {timeOut: 2000});
      });
    } else {
      this._http.favoriteAsset(assetId, true).subscribe(() => {
        this.favoriteAssets.push(assetId);
        this.toastr.success(this.translate.instant('Favorite') + ' ' + this.translate.instant('success'), '', {timeOut: 2000});
      });
    }
  }

  filterAssets(keyword) {
    if (this.isLoadTreeAsync) {
      this._logger.debug('Filter assets server');
      this.filterAssetsServer(keyword);
    } else {
      this._logger.debug('Filter assets local');
      this.filterAssetsLocal(keyword);
    }
  }

  filterTree(keyword, tree, filterCallback) {
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

  filterApplicationsTree(keyword) {
    if (!this.applicationsTree) {
      return null;
    }
    function filterCallback(node: TreeNode) {
      return node.name.toLowerCase().indexOf(keyword) !== -1;
    }
    return this.filterTree(keyword, this.applicationsTree, filterCallback);
  }

  filterAssetsServer(keyword) {
    if (!this.assetsTree) {
      return;
    }
    let searchNode = this.assetsTree.getNodesByFilter((node) => node.id === 'search');
    if (searchNode) {
      this.assetsTree.removeChildNodes(searchNode[0]);
      this.assetsTree.removeNode(searchNode[0]);
    }
    const treeNodes = this.assetsTree.getNodes();
    if (!keyword) {
      if (treeNodes.length !== 0) {
        this.assetsTree.showNodes(treeNodes);
      }
      return;
    }
    this.filterAssetCancel$.next(true);
    if (treeNodes.length !== 0) {
      this.assetsTree.hideNodes(treeNodes);
    }
    this.loading = true;
    this._http.getMyGrantedAssets(keyword)
      .pipe(takeUntil(this.filterAssetCancel$))
      .subscribe(nodes => {
        this.loading = false;
        let name = this.translate.instant('Search');
        const assetsAmount = nodes.length;
        name = `${name} (${assetsAmount})`;
        const newNode = {id: 'search', name: name, isParent: true, open: true, zAsync: true};
        searchNode = this.assetsTree.addNodes(null, newNode)[0];
        searchNode.zAsync = true;
        const nodesGroupByOrg = groupBy(nodes, (node) => {
          return node.meta.asset.org_name;
        });
        nodesGroupByOrg.forEach((item) => {
          const orgName = item[0].meta.asset.org_name;
          const orgNodeData = {id: orgName, name: orgName, isParent: true, open: true, zAsync: true};
          const orgNode = this.assetsTree.addNodes(searchNode, orgNodeData)[0];
          orgNode.zAsync = true;
          this.assetsTree.addNodes(orgNode, item);
        });
        searchNode.open = true;
      });
    return;
  }

  filterAssetsLocal(keyword) {
    if (!this.assetsTree) {
      return null;
    }
    function filterAssetsCallback(node) {
      if (node.isParent) {
        return false;
      }
      const host = node.meta.asset;
      return host.hostname.toLowerCase().indexOf(keyword) !== -1 || host.ip.indexOf(keyword) !== -1;
    }
    return this.filterTree(keyword, this.assetsTree, filterAssetsCallback);
    // zTreeObj.expandAll(true);
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
}
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

  onNoClick(): void {
    this.dialogRef.close();
  }
}

