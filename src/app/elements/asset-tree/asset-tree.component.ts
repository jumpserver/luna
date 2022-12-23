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

class Tree {
  name: string;
  label: string;
  open: boolean;
  loading: boolean;
  search: boolean;
  ztree: any;

  constructor(name, label, open, loading, search) {
    this.name = name;
    this.label = label;
    this.open = open;
    this.loading = loading;
    this.search = search;
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
        'hide': this.isK8s,
        'click': this.onMenuConnectNewTab.bind(this)
      }, {
        'id': 'favorite',
        'name': 'Favorite',
        'fa': 'fa-star-o',
        'hide': this.isAssetFavorite() || this.isK8s,
        'click': this.onMenuFavorite.bind(this)
      }, {
        'id': 'disfavor',
        'name': 'Disfavor',
        'fa': 'fa-star',
        'hide': !this.isAssetFavorite() || this.isK8s,
        'click': this.onMenuFavorite.bind(this)
      }];
    if (!this.rightClickSelectNode) {
      return [];
    }
    return menuList;
  }

  @Input() query: string;
  @Input() isK8s: boolean = false;
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
  searchValue = '';
  currentOrgID = this._cookie.get('X-JMS-LUNA-ORG') || this._cookie.get('X-JMS-ORG');
  trees: Array<Tree> = [];

  ngOnInit() {
    this._settingSvc.isLoadTreeAsync$.subscribe((state) => {
      this.isLoadTreeAsync = state;
    });
    this.initTree();
    document.addEventListener('click', this.hideRMenu.bind(this), false);
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
    this.connectAsset(treeNode).then();
  }

  async initK8sTree(refresh = false) {
    let tree = new Tree(
      'K8sTree',
      this._i18n.instant('Kubernetes'),
      true,
      true,
      false
    );
    if (refresh) {
      tree = this.trees.find(t => t.name === tree.name);
    } else {
      this.trees.push(tree);
    }
    const token = this._route.snapshot.queryParams.token;
    const url = `/api/v1/perms/users/self/nodes/children-with-k8s/tree/?token=${token}`;
    const setting = Object.assign({
      async: {
        enable: true,
        url: url,
        autoParam: ['id=key', 'name=n', 'level=lv'],
        type: 'get',
        headers: {
          'X-JMS-ORG': this.currentOrgID
        }
      }
    }, this.setting);
    setting['callback'] = {
      onClick: _.debounce(this.onNodeClick, 300, {
        'leading': true,
        'trailing': false
      }).bind(this),
      onRightClick: this.onRightClick.bind(this)
    };
    tree.loading = true;
    this._http.get(url).subscribe(resp => {
      tree.ztree = $.fn.zTree.init($('#' + tree.name), setting, resp);
    }, err => {
      this._logger.error('Get k8s tree error: ', err);
    }, () => {
      tree.loading = false;
    });
  }

  async initAssetTree(refresh = false) {
    let tree = new Tree(
      'AssetTree',
      'My assets',
      true,
      true,
      true
    );
    if (refresh) {
      tree = this.trees.find(t => t.name === tree.name);
    } else {
      this.trees.push(tree);
    }
    const setting = Object.assign({}, this.setting);
    setting['callback'] = {
      onClick: _.debounce(this.onNodeClick, 300, {
        'leading': true,
        'trailing': false
      }).bind(this),
      onRightClick: this.onRightClick.bind(this)
    };
    const url = '/api/v1/perms/users/self/nodes/children-with-assets/tree/?';
    if (this.isLoadTreeAsync) {
      setting['async'] = {
        enable: true,
        url: url,
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
    tree.loading = true;
    this._http.getMyGrantedNodes(this.isLoadTreeAsync).subscribe(resp => {
      if (refresh) {
        tree.ztree.expandAll(false);
        tree.ztree.destroy();
      }
      setTimeout(() => {
        tree.ztree = $.fn.zTree.init($('#' + tree.name), setting, resp);
      }, 100);
    }, error => {
      console.error('Get tree error: ', error);
    }, () => {
      tree.loading = false;
    });
  }

  initTree() {
    if (this.isK8s) {
      this.initK8sTree().then();
    } else {
      this.initAssetTree().then();
    }
  }

  async refreshTree(event) {
    event.stopPropagation();
    this.searchValue = '';
    if (this.isK8s) {
      this.initK8sTree(true).then();
    } else {
      this.initAssetTree(true).then();
    }
  }

  async connectAsset(node: TreeNode) {
    const action = this.isK8s ? 'k8s' : 'asset';
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
    const ztree = this.trees.find(t => t.name === treeId).ztree;
    const metaData = treeNode.meta.data;
    if (treeNode.isParent && ['container', 'asset'].indexOf(metaData.identity) === -1) {
      this.expandAllChildren(treeId, treeNode, !treeNode.open);
      return;
    }
    this.rightClickSelectNode = treeNode;
    if (!treeNode && event.target.tagName.toLowerCase() !== 'button'
      && $(event.target).parents('a').length === 0) {
      ztree.cancelSelectedNode();
      this.showRMenu(event.clientX, event.clientY);
    } else if (treeNode && !treeNode.noR) {
      ztree.selectNode(treeNode);
      this.showRMenu(event.clientX, event.clientY);
      this.rightClickSelectNode = treeNode;
    }
  }

  onMenuConnect() {
    const node = this.rightClickSelectNode;
    const action = this.isK8s ? 'k8s' : 'connect';
    const evt = new ConnectEvt(node, action);
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
    tree.open = !tree.open;
  }
}
