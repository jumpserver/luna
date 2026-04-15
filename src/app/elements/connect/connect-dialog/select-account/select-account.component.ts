import { User } from '@app/globals';
import { FormControl } from '@angular/forms';
import { AppService, I18nService, SettingService } from '@app/services';
import { BehaviorSubject, ReplaySubject, Subject } from 'rxjs';
import { Account, AccountGroup, Asset, AuthInfo, Protocol } from '@app/model';

import {
  Input,
  OnInit,
  Output,
  OnDestroy,
  Component,
  ViewChild,
  ElementRef,
  EventEmitter,
  ChangeDetectorRef
} from '@angular/core';

@Component({
  standalone: false,
  selector: 'elements-select-account',
  templateUrl: 'select-account.component.html',
  styleUrls: ['select-account.component.scss']
})
export class ElementSelectAccountComponent implements OnInit, OnDestroy {
  @Input() asset: Asset;
  @Input() accounts: Account[];
  @Input() onSubmit: BehaviorSubject<boolean>;
  @Input() onSubmit$: BehaviorSubject<boolean>;
  @Input() manualAuthInfo: AuthInfo;
  @Input() protocol: Protocol;
  @Input() preSelectedAccount: Account; // 接收父组件传入的预选择账号
  @Output() accountSelectedChange: EventEmitter<Account> = new EventEmitter<Account>();
  @Output() manualUsernameChanged: EventEmitter<string> = new EventEmitter<string>();
  @ViewChild('username', { static: false }) usernameRef: ElementRef;
  @ViewChild('password', { static: false }) passwordRef: ElementRef;

  public hidePassword = true;
  public rememberAuthDisabled = null;
  usernameControl = new FormControl();
  localAuthItems: AuthInfo[];
  filteredOptions: AuthInfo[];
  accountManualAuthInit = false;
  usernamePlaceholder: string = '';
  public accountSelected: Account; // 内部状态
  public groupedAccounts: AccountGroup[];
  public accountCtl: FormControl = new FormControl();
  public accountFilterCtl: FormControl = new FormControl();
  public filteredUsersGroups: ReplaySubject<AccountGroup[]> = new ReplaySubject<AccountGroup[]>(1);
  protected _onDestroy = new Subject<void>();
  private userManuallySelected = false; // 标记用户是否手动选择了账号

  constructor(
    private _settingSvc: SettingService,
    private _appSvc: AppService,
    private _i18n: I18nService,
    private _cdRef: ChangeDetectorRef
  ) {
    this.usernamePlaceholder = this._i18n.instant('Username');
    this.rememberAuthDisabled = !this._settingSvc.globalSetting.SECURITY_LUNA_REMEMBER_AUTH;
  }

  get noSecretAccounts() {
    return this.accounts
      .filter(item => !item.has_secret)
      .filter(item => item.username !== '@ANON')
      .sort((a, b) => {
        const eq = +a.username.startsWith('@') - +b.username.startsWith('@');
        if (eq !== 0) {
          return eq;
        }
        if (a.name === 'root') {
          return -1;
        }
        return a.name.localeCompare(b.name);
      });
  }

  get hasSecretAccounts() {
    return this.accounts
      .filter(item => item.has_secret)
      .sort((a, b) => {
        return a.name.localeCompare(b.name);
      });
  }

  get anonymousAccounts() {
    const allowAnonymousCategory = ['custom', 'web'];
    return this.accounts.filter(item => {
      return (
        item.username === '@ANON' && allowAnonymousCategory.indexOf(this.asset.category.value) >= 0
      );
    });
  }

  get adDomain() {
    if (!this.protocol || this.protocol.name !== 'rdp') {
      return '';
    }
    const rdp = this.asset.permed_protocols.find(item => item.name === 'rdp');
    if (!rdp || !rdp.setting || typeof rdp.setting !== 'object') {
      return '';
    }
    return rdp.setting['ad_domain'];
  }

  get showManualUsernameInput() {
    if (!this.accountSelected) {
      return false;
    }
    return this.accountSelected.username === '@INPUT' || this.accountSelected.username === '@USER';
  }

  public compareFn = (f1: Account, f2: Account) => {
    if (!f1 || !f2) return false;
    return f1.alias === f2.alias && f1.id === f2.id;
  };

  ngOnInit() {
    // 重置用户手动选择标志
    this.userManuallySelected = false;

    // 如果父组件传入了预选择账号，使用父组件传入的
    if (this.preSelectedAccount) {
      this.accountSelected = this.preSelectedAccount;
    }

    // 先检查URL参数，这个优先级最高
    this.checkUrlForLoginAccountParam();

    // 然后分组账号（如果URL没有指定账号，会设置默认账号）
    this.groupedAccounts = this.groupAccounts();
    this.filteredUsersGroups.next(this.groupedAccounts.slice());

    // 确保账号对象引用一致
    this.ensureAccountReference();

    if (this.accountSelected) {
      const username = this.accountSelected.username;
      this.manualAuthInfo.username = username.startsWith('@') ? '' : username;
      if (username === '@USER') {
        this.manualAuthInfo.username = User.username;
      }
      this.accountSelectedChange.emit(this.accountSelected);
      this.onAccountChanged();
    }
  }

  ngOnDestroy() {
    this._onDestroy.next();
    this._onDestroy.complete();
  }

  handleAccountChanged(newAccount?: Account) {
    // 如果传入了新账号，使用新账号；否则使用当前账号
    const selectedAccount = newAccount || this.accountSelected;

    this.accountSelected = selectedAccount;
    this.userManuallySelected = true;

    this.accountSelectedChange.emit(this.accountSelected);

    this.onAccountChanged();
  }

  getPreAccountSelected() {
    const preConnectData = this._appSvc.getPreConnectData(this.asset);
    if (preConnectData && preConnectData.account) {
      return this.accounts.find(item => item.alias === preConnectData.account.alias);
    }
  }

  getAccountUsername(account: Account) {
    if (account.username.includes('@')) {
      return account.username;
    }
    if (this.adDomain) {
      return `${account.username}@${this.adDomain}`;
    }
    return account.username;
  }

  getAccountDisplay(account: Account) {
    const username = this.getAccountUsername(account);
    if (username.startsWith('@')) {
      return account.name;
    } else if (account.name === username) {
      return account.name;
    } else {
      return `${account.name}(${username})`;
    }
  }

  groupAccounts() {
    let groups = [];
    const preAccountSelected = this.getPreAccountSelected();

    if (preAccountSelected) {
      groups.push({
        name: this._i18n.instant('Last login'),
        accounts: [preAccountSelected]
      });
    }

    groups.push({
      name: this._i18n.instant('With secret accounts'),
      accounts: this.hasSecretAccounts
    });
    groups.push({
      name: this._i18n.instant('Manual accounts'),
      accounts: this.noSecretAccounts
    });
    groups.push({
      name: this._i18n.instant('Special accounts'),
      accounts: this.anonymousAccounts
    });

    groups = groups.filter(group => group.accounts.length > 0);

    // 优先级：
    // 1. 如果用户已经手动选择了账号，保持不变
    // 2. 如果已经有选中的账号但不是用户手动选择的，可以被覆盖
    // 3. 如果父组件传入了预选择账号，使用它
    // 4. 否则使用第一个可用账号作为默认
    if (this.userManuallySelected && this.accountSelected) {
      // 用户手动选择的账号，保持不变
    } else if (!this.accountSelected) {
      if (this.preSelectedAccount) {
        // 使用父组件传入的预选择账号
        this.accountSelected = this.preSelectedAccount;
      } else {
        // 使用第一个可用账号作为默认
        for (const group of groups) {
          if (group.accounts.length > 0) {
            this.accountSelected = group.accounts[0];
            break;
          }
        }
      }
    }

    if (groups.length === 0) {
      groups.push({
        name: this._i18n.instant('No account available'),
        accounts: []
      });
    }

    return groups;
  }

  checkUrlForLoginAccountParam() {
    const loginAccount = this._appSvc.getQueryString('login_account');
    const accounts: Array<any> = this.accounts || [];
    if (loginAccount && accounts.length > 0) {
      for (const i of accounts) {
        if (loginAccount === i.id) {
          this.accountSelected = i;
          break;
        }
      }
    }
  }

  filterAccounts() {
    if (!this.groupedAccounts) {
      return;
    }
    let search = this.accountFilterCtl.value;
    const accountsGroupsCopy = this.copyGroupedAccounts(this.groupedAccounts);

    if (!search) {
      this.filteredUsersGroups.next(this.groupedAccounts.slice());
      return;
    }
    search = search.toLowerCase();
    const filteredGroups = accountsGroupsCopy.filter(group => {
      const showGroup = group.name.toLowerCase().indexOf(search) > -1;
      if (!showGroup) {
        group.accounts = group.accounts.filter(account => {
          return account.name.toLowerCase().indexOf(search) > -1;
        });
      }
      return group.accounts.length > 0;
    });
    this.filteredUsersGroups.next(filteredGroups);
  }

  setUsernamePlaceholder() {
    if (this.accountSelected.username === 'rdp') {
      this.usernamePlaceholder = this._i18n.instant('Username@Domain');
    } else {
      this.usernamePlaceholder = this._i18n.instant('Username');
    }
  }

  onAccountChanged() {
    if (!this.accountSelected) {
      return;
    }
    if (this.accountSelected.has_secret) {
      return;
    }
    if (this.accountSelected.username === '@INPUT') {
      this.manualAuthInfo.username = '';
    } else if (this.accountSelected.username === '@USER') {
      this.manualAuthInfo.username = User.username;
    } else {
      this.manualAuthInfo.username = this.accountSelected.username;
    }
    this.manualAuthInfo.secret = '';
    this.localAuthItems = this._appSvc.getAccountLocalAuth(this.asset.id);
    if (this.manualAuthInfo.username) {
      this.localAuthItems = this.localAuthItems.filter(
        item => item.username === this.manualAuthInfo.username
      );
    }
    if (this.localAuthItems && this.localAuthItems.length > 0) {
      this.manualAuthInfo = Object.assign(this.manualAuthInfo, this.localAuthItems[0]);
    }
    this.setUsernamePlaceholder();
    setTimeout(() => {
      if (this.manualAuthInfo.username && this.passwordRef) {
        this.passwordRef.nativeElement.focus();
      } else if (this.usernameRef) {
        this.usernameRef.nativeElement.focus();
      }
    }, 10);

    this._cdRef.detectChanges();
  }

  onFocus() {
    if (!this.accountManualAuthInit) {
      this.usernameControl.setValue('');
      this.accountManualAuthInit = true;
    }
  }

  onUsernameChanges() {
    const filterValue = this.manualAuthInfo.username.toLowerCase();
    this.filteredOptions = this.localAuthItems.filter(authInfo => {
      if (authInfo.username.toLowerCase() === filterValue) {
        this.manualAuthInfo = Object.assign(this.manualAuthInfo, authInfo);
      }
      return authInfo.username.toLowerCase().includes(filterValue);
    });
    this.manualUsernameChanged.emit(this.manualAuthInfo.username);
  }

  getSavedAuthInfos() {
    this.localAuthItems = this._appSvc.getAccountLocalAuth(this.asset.id);
  }

  protected copyGroupedAccounts(groups) {
    const accountsCopy = [];
    groups.forEach(group => {
      accountsCopy.push({
        name: group.name,
        accounts: group.accounts.slice()
      });
    });
    return accountsCopy;
  }

  private ensureAccountReference() {
    if (!this.accountSelected || !this.groupedAccounts) {
      return;
    }

    // 在分组中查找匹配的账号对象
    for (const group of this.groupedAccounts) {
      const foundAccount = group.accounts.find(
        account => account.alias === this.accountSelected.alias
      );
      if (foundAccount) {
        if (foundAccount !== this.accountSelected) {
          this.accountSelected = foundAccount;
          this.accountSelectedChange.emit(this.accountSelected);
        }
        break;
      }
    }
  }
}
