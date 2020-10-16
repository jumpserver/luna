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
    this.assetsTree.destroy();
    this.initAssetsTree(true);
  }

  initAssetsTree(refresh?: boolean) {
    const setting = Object.assign({}, this.setting);
    const myAssetsNodes = [
      {
        name: '我的资产', id: 'myAssets', isParent: true,
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
      const _assetTree = $.fn.zTree.init($('#assetsTree'), setting, resp);
      myAssetsNodes[0].children = _assetTree.getNodes();
      const myAssetsTree = $.fn.zTree.init($('#myAssets'), setting, myAssetsNodes);
      this.assetsTree = myAssetsTree;
      this.rootNodeAddDom(myAssetsTree, () => {
        this.refreshAssetsTree();
      });
      _assetTree.destroy();
    });
  }

  addApplicationNodesIfNeed(nodes, rootNode, applicationNodes) {
      rootNode['children'] = nodes;
      applicationNodes[0].children.push(rootNode);
  }

  async initApplicationTree() {
    const setting = Object.assign({}, this.setting);
    setting['callback'] = {
      onClick: this.onApplicationTreeNodeClick.bind(this),
      onRightClick: this.onRightClick.bind(this)
    };
    const applicationNodes = [
      {
        name: '我的应用', id: 'myApplication', isParent: true,
        title: 'My applications',
        children: [], open: true
      }
    ];
    const remoteAppRootNode = {
      iconSkin: '',
      id: 'ID_REMOTE_APP_ROOT',
      isParent: true,
      meta: {type: 'remote_app'},
      name: '远程应用',
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
      name: '数据库应用',
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
      name: 'Kubernetes应用',
      nocheck: false,
      open: false,
      pId: '',
      title: 'K8sApp'
    };
    const dbNodes = await this._http.getMyGrantedDBApps().toPromise();
    this.addApplicationNodesIfNeed(dbNodes, dbRootNode, applicationNodes);
    const k8sNodes = await this._http.getMyGrantedK8SApps().toPromise();
    this.addApplicationNodesIfNeed(k8sNodes, cloudAppRootNode, applicationNodes);
    const remoteNodes = await this._http.getMyGrantedRemoteApps().toPromise();
    this.addApplicationNodesIfNeed(remoteNodes, remoteAppRootNode, applicationNodes);
    const tree = $.fn.zTree.init($('#applicationsTree'), setting, applicationNodes);
    this.rootNodeAddDom(tree, () => {
      this.refreshApplicationTree();
    });
    this.applicationsTree = tree;
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
    }
  }

  initTree() {
    this.initAssetsTree();
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
    this.pos.top = top + 'px';
    this.isShowRMenu = true;
  }

  hideRMenu() {
    this.isShowRMenu = false;
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

  onRightClick(event, treeId, treeNode) {
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
    if (!this.filterApplicationsTree) {
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
        nodes.forEach((item) => {
          this.assetsTree.addNodes(searchNode, item);
        });
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

