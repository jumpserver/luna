import {Component, Input, OnInit, ElementRef, ViewChild, Inject} from '@angular/core';
import {MatDialog, MatDialogRef, MAT_DIALOG_DATA} from '@angular/material';
import {BehaviorSubject, Subject} from 'rxjs';
import {takeUntil} from 'rxjs/operators';
import {ActivatedRoute} from '@angular/router';
import {ToastrService} from 'ngx-toastr';
import {groupBy, connectOnNewPage} from '@app/utils/common';
import * as _ from 'lodash';
import {
  AppService, HttpService, LogService, SettingService,
  TreeFilterService, I18nService, OrganizationService
} from '@app/services';
import {connectEvt} from '@app/globals';
import {TreeNode, ConnectEvt} from '@app/model';
import {CookieService} from 'ngx-cookie-service';

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


@Component({
  selector: 'elements-asset-tree',
  templateUrl: './asset-tree.component.html',
  styleUrls: ['./asset-tree.component.scss'],
})
export class ElementAssetTreeComponent implements OnInit {

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
              private _cookie: CookieService
  ) {
  }

  get RMenuList() {
    const menuList = [
      {
        'id': 'connect',
        'name': 'Connect',
        'fa': 'fa-terminal',
        'hide': false,
        'click': this.onMenuConnect.bind(this)
      }, {
        'id': 'new-connection',
        'name': 'Open in new window',
        'fa': 'fa-external-link',
        'hide': this.isk8sNode(),
        'click': this.onMenuConnectNewTab.bind(this)
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
  assetsTree: any;
  isShowRMenu = false;
  rightClickSelectNode: any;
  isLoadTreeAsync: boolean;
  filterAssetCancel$: Subject<boolean> = new Subject();
  favoriteAssets = [];
  assetsTreeHidden = false;
  assetsLoading = true;
  assetsSearchValue = '';
  currentOrgID = this._cookie.get('X-JMS-LUNA-ORG') || this._cookie.get('X-JMS-ORG');

  debouncedOnAssetsNodeClick = _.debounce(this.onNodeClick, 300, {
    'leading': true,
    'trailing': false
  });

  ngOnInit() {
    this.isLoadTreeAsync = this._settingSvc.isLoadTreeAsync();
    this.initTree();
    document.addEventListener('click', this.hideRMenu.bind(this), false);
  }

  onNodeClick(event, treeId, treeNode, clickFlag) {
    if (treeNode.isParent) {
      this.assetsTree.expandNode(treeNode);
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
    this.connectAsset(treeNode).then();
  }

  refreshAssetsTree() {
    this.assetsSearchValue = '';
    this.initAssetTree(true).then();
  }

  async initAssetTree(refresh?: boolean) {
    const setting = Object.assign({}, this.setting);
    setting['callback'] = {
      onClick: this.debouncedOnAssetsNodeClick.bind(this),
      onRightClick: this.onRightClick.bind(this)
    };
    if (this.isLoadTreeAsync) {
      setting['async'] = {
        enable: true,
        url: '/api/v1/perms/users/self/nodes/children-with-assets/tree/',
        autoParam: ['id=key', 'name=n', 'level=lv'],
        type: 'get',
        headers: {
          'X-JMS-ORG': this.currentOrgID
        }
      };
    }

    this._http.getFavoriteAssets().subscribe(resp => {
      this.favoriteAssets = resp.map(i => i.asset);
    });

    this.assetsLoading = true;
    this._http.getMyGrantedNodes(this.isLoadTreeAsync, refresh).subscribe(resp => {
      this.assetsLoading = false;
      if (refresh) {
        this.assetsTree.destroy();
      }
      for (const node of resp) {
        node.open = true;
      }
      this.assetsTree = $.fn.zTree.init($('#assetsTree'), setting, resp);
    }, error => {
      this.assetsLoading = false;
    });
  }

  initTree() {
    this.initAssetTree(false).then();
  }

  async connectAsset(node: TreeNode) {
    const evt = new ConnectEvt(node, 'asset');
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

  isAssetNode() {
    return this.rightClickSelectNode.meta.type === 'asset';
  }

  isk8sNode() {
    return this.rightClickSelectNode.meta.data.type === 'k8s';
  }

  reAsyncChildNodes(treeId, treeNode, silent) {
    if (treeNode && treeNode.isParent && treeNode.children) {
      for (let i = 0; i < treeNode.children.length; i++) {
        const childNode = treeNode.children[i];
        const self = this;
        const targetTree = $.fn.zTree.getZTreeObj(treeId);
        if (treeNode.meta.data.type !== 'k8s') {
          targetTree.reAsyncChildNodesPromise(childNode, 'refresh', silent).then(() => {
            self.reAsyncChildNodes(treeId, childNode, silent);
          });
        }
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
          treeNode.children.forEach(function (childNode) {
            if (childNode.meta.data.type !== 'k8s') {
              self.expandAllChildren(treeId, childNode, expandFlag);
            }
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

    if (treeNode.isParent && ['container', 'system_user'].indexOf(treeNode.meta.data.identity) === -1) {
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

  onMenuConnectNewTab() {
    const node = this.rightClickSelectNode;
    connectOnNewPage(node, false);
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
      const newNode = {id: 'search', name: name, isParent: true, open: true};
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
    this.assetsLoading = true;
    this._http.getMyGrantedAssets(keyword)
      .pipe(takeUntil(this.filterAssetCancel$))
      .subscribe(nodes => {
        this.assetsLoading = false;
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

  treeSearch(event, type: string) {
    event.stopPropagation();
    const vm = this;
    const searchIcon = document.getElementById(`${type}SearchIcon`);
    const searchInput = document.getElementById(`${type}SearchInput`);
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
      vm.assetsSearchValue = value;
      vm.filterAssets(value);
    }, 450);
  }

  refreshTree(event, type: string) {
    event.stopPropagation();
    this.refreshAssetsTree();
  }

  foldTree(type: string) {
    this[`${type}TreeHidden`] = !this[`${type}TreeHidden`];
  }
}
