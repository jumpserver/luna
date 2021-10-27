import {Component, Input, OnInit, OnDestroy, ElementRef, ViewChild, Inject} from '@angular/core';
import {MatDialog, MatDialogRef, MAT_DIALOG_DATA} from '@angular/material';
import {BehaviorSubject, Subject} from 'rxjs';
import {takeUntil} from 'rxjs/operators';
import {ActivatedRoute} from '@angular/router';
import {ToastrService} from 'ngx-toastr';
import {groupBy} from '@app/utils/common';
import * as _ from 'lodash';
import {AppService, HttpService, LogService, SettingService, TreeFilterService, I18nService} from '@app/services';
import {connectEvt} from '@app/globals';
import {TreeNode, ConnectEvt} from '@app/model';

declare var $: any;

@Component({
  selector: 'elements-asset-tree',
  templateUrl: './asset-tree.component.html',
  styleUrls: ['./asset-tree.component.scss'],
})
export class ElementAssetTreeComponent implements OnInit, OnDestroy {

  constructor(private _appSvc: AppService,
              private _treeFilterSvc: TreeFilterService,
              private _route: ActivatedRoute,
              private _http: HttpService,
              private _settingSvc: SettingService,
              private _dialog: MatDialog,
              private _logger: LogService,
              private _i18n: I18nService,
              private _toastr: ToastrService,
  ) {}

  get RMenuList() {
    const menuList = [{
      'id': 'connect',
      'name': 'Connect',
      'fa': 'fa-terminal',
      'hide': false,
      'click': this.onMenuConnect.bind(this)
    },
      {
      'id': 'new-connection',
      'name': 'Open in new window',
      'fa': 'fa-external-link',
      'hide': false,
      'click': this.onMenuConnectNewTab.bind(this)
    }, {
      'id': 'file-manager',
      'name': 'File Manager',
      'fa': 'fa-file',
      'hide': !this.nodeSupportSSH(),
      'click': this.onMenuConnectFileManager.bind(this)
    }, {
      'id': 'favorite',
      'name': 'Favorite',
      'fa': 'fa-star-o',
      'hide': this.isAssetFavorite() || !this.isAssetNode(),
      'click': this.onMenuFavorite.bind(this)
    }, {
      'id': 'disfavor',
      'name': 'Disfavor',
      'fa': 'fa-star',
      'hide': !this.isAssetFavorite() || !this.isAssetNode(),
      'click': this.onMenuFavorite.bind(this)
    }];
    if (!this.rightClickSelectNode) {
      return [];
    }

    return menuList;
  }

  @Input() query: string;
  @Input() searchEvt$: BehaviorSubject<string>;
  @ViewChild('rMenu', {static: false}) rMenu: ElementRef;
  Data = [];
  nodes = [];
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

  debouncedOnAssetsNodeClick = _.debounce(this.onAssetsNodeClick, 300, {
    'leading': true,
    'trailing': false
  });

  debouncedOnApplicationTreeNodeClick = _.debounce(this.onApplicationTreeNodeClick, 300, {
    'leading': true,
    'trailing': false
  });

  ngOnInit() {
    this.isLoadTreeAsync = this._settingSvc.isLoadTreeAsync();
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
      return;
    }
    if (treeNode.chkDisabled) {
      this._dialog.open(DisabledAssetsDialogComponent, {
        height: '200px',
        width: '450px'
      });
      return;
    }
    this.connectAsset(treeNode);
  }

  refreshAssetsTree() {
    this.initAssetsTree(true).then();
  }

  async initAssetsTree(refresh?: boolean) {
    const setting = Object.assign({}, this.setting);
    const myAssetsNodes = [
      {
        name: await this._i18n.t('My assets'),
        id: 'myAssets', isParent: true,
        title: 'My assets',
        children: [], open: true
      }
    ];
    setting['callback'] = {
      onClick: this.debouncedOnAssetsNodeClick.bind(this),
      onRightClick: this.onRightClick.bind(this)
    };
    if (this.isLoadTreeAsync) {
      setting['async'] = {
        enable: true,
        url: '/api/v1/perms/users/nodes/children-with-assets/tree/',
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
      onClick: this.debouncedOnApplicationTreeNodeClick.bind(this),
      onRightClick: this.onRightClick.bind(this)
    };
    this._http.getMyGrantedAppsNodes().subscribe(resp => {
      const tree = $.fn.zTree.init($('#applicationsTree'), setting, resp);
      this.rootNodeAddDom(tree, () => {
        this.refreshApplicationTree();
      });
      this.applicationsTree = tree;
    });
  }

  refreshApplicationTree() {
    if (this.applicationsTree) {
      this.applicationsTree.destroy();
      this.initApplicationTree().then();
    }
  }

  onApplicationTreeNodeClick(event, treeId, treeNode: TreeNode, clickFlag) {
    if (!treeNode.isParent) {
      if (treeNode.meta.data.category === 'remote_app') {
        this.connectOnNewPage(treeNode, true);
        return;
      }
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
    if (!rootNode) {
      return;
    }
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

  hideRMenu() {
    this.isShowRMenu = false;
  }

  nodeSupportSSH() {
    const host = this.rightClickSelectNode.meta.data;
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
    const assetId = this.rightClickSelectNode.id;
    return this.favoriteAssets.indexOf(assetId) !== -1;
  }

  isAssetNode() {
    return this.rightClickSelectNode.meta.type === 'asset';
  }

  forceRefreshTree() {
    this.initAssetsTree(true).then();
  }

  reAsyncChildNodes(treeId, treeNode, silent) {
    if (treeNode && treeNode.isParent && treeNode.children) {
      for (let i = 0; i < treeNode.children.length; i++) {
        const childNode = treeNode.children[i];
        const self = this;
        const targetTree = $.fn.zTree.getZTreeObj(treeId);
        targetTree.reAsyncChildNodesPromise(childNode, 'refresh', silent).then(function () {
          self.reAsyncChildNodes(treeId, childNode, silent);
        });
      }
    }
  }

  expandAllChildren(treeId, treeNode, expandFlag) {
    if (expandFlag === treeNode.open) {
      return;
    }
    // 异步加载时需要加载全部子节点
    const self = this;
    const targetTree = $.fn.zTree.getZTreeObj(treeId);
    if (targetTree.setting.async.enable && (!treeNode.children || treeNode.children.length === 0)) {
      targetTree.reAsyncChildNodesPromise(treeNode, 'refresh', false).then(function () {
        self.reAsyncChildNodes(treeId, treeNode, false);
      });
    } else {
      // 展开时递归展开，防止用户手动展开子级折叠后无法再次展开孙子级
      if (expandFlag) {
        targetTree.expandNode(treeNode, expandFlag, false, false, false);
        if (treeNode.children && treeNode.children.length > 0) {
          treeNode.children.forEach(function(childNode) {
            self.expandAllChildren(treeId, childNode, expandFlag);
          });
        }
      } else {
        targetTree.expandNode(treeNode, expandFlag, true, false, false);
      }
    }
  }

  onRightClick(event, treeId, treeNode) {
    if (!treeNode) {
      return null;
    }
    if (treeNode.isParent) {
      this.expandAllChildren(treeId, treeNode, !treeNode.open);
      return;
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

  onMenuConnect() {
    const node = this.rightClickSelectNode;
    const evt = new ConnectEvt(node, 'connect');
    connectEvt.next(evt);
  }

  onMenuConnectFileManager() {
    const node = this.rightClickSelectNode;
    const evt = new ConnectEvt(node, 'sftp');
    connectEvt.next(evt);
  }

  onMenuConnectNewTab() {
    const node = this.rightClickSelectNode;
    this.connectOnNewPage(node, false);
  }

  connectOnNewPage(node: TreeNode, newWindow?: boolean) {
    const url = `/luna/connect?login_to=${node.id}&type=${node.meta.type}`;
    if (newWindow) {
      const height = window.innerHeight;
      const width = window.innerWidth;
      const params = `toolbar=yes,scrollbars=yes,resizable=yes,top=300,left=300,width=${width},height=${height}`;
      window.open(url, '_blank', params);
    } else {
      window.open(url, '_blank');
    }
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
    const filterCallback = (node: TreeNode) => {
      return node.name.toLowerCase().indexOf(keyword.toLowerCase()) !== -1;
    };
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
        let name = this._i18n.instant('Search');
        const assetsAmount = nodes.length;
        name = `${name} (${assetsAmount})`;
        const newNode = {id: 'search', name: name, isParent: true, open: true, zAsync: true};
        searchNode = this.assetsTree.addNodes(null, newNode)[0];
        searchNode.zAsync = true;
        const nodesGroupByOrg = groupBy(nodes, (node) => {
          return node.meta.data.org_name;
        });
        nodesGroupByOrg.forEach((item) => {
          const orgName = item[0].meta.data.org_name;
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
    const filterAssetsCallback = (node: TreeNode) => {
      if (node.isParent) {
        return false;
      }
      const host = node.meta.data;
      return host.hostname.toLowerCase().indexOf(keyword.toLowerCase()) !== -1
        || host.ip.indexOf(keyword.toLowerCase()) !== -1;
    };
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

