import {ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild} from '@angular/core';
import {Account, AccountGroup, Asset, AuthInfo, Protocol} from '@app/model';
import {BehaviorSubject, ReplaySubject, Subject} from 'rxjs';
import {FormControl, Validators} from '@angular/forms';
import {AppService, I18nService, LocalStorageService, LogService, SettingService} from '@app/services';
import {takeUntil} from 'rxjs/operators';
import {User} from '@app/globals';

@Component({
  selector: 'elements-select-account',
  templateUrl: 'select-account.component.html',
  styleUrls: ['./select-account.component.scss'],
})
export class ElementSelectAccountComponent implements OnInit, OnDestroy {
  @Input() asset: Asset;
  @Input() accounts: Account[];
  @Input() onSubmit: BehaviorSubject<boolean>;
  @Input() onSubmit$: BehaviorSubject<boolean>;
  @Input() manualAuthInfo: AuthInfo;
  @Input() protocol: Protocol;
  @Output() accountSelectedChange: EventEmitter<Account> = new EventEmitter<Account>();
  @ViewChild('username', {static: false}) usernameRef: ElementRef;
  @ViewChild('password', {static: false}) passwordRef: ElementRef;

  public hidePassword = true;
  public rememberAuth = false;
  public rememberAuthDisabled = false;
  usernameControl = new FormControl();
  localAuthItems: AuthInfo[];
  filteredOptions: AuthInfo[];
  accountManualAuthInit = false;
  usernamePlaceholder: string = 'Username';
  public accountSelected: Account;
  public groupedAccounts: AccountGroup[];
  public accountCtl: FormControl = new FormControl();
  public accountFilterCtl: FormControl = new FormControl();
  public filteredUsersGroups: ReplaySubject<AccountGroup[]> = new ReplaySubject<AccountGroup[]>(1);
  protected _onDestroy = new Subject<void>();

  constructor(private _logger: LogService,
              private _appSvc: AppService,
              private _i18n: I18nService,
              private _settingSvc: SettingService,
              private _cdRef: ChangeDetectorRef,
              private _localStorage: LocalStorageService
  ) {
  }

  get noSecretAccounts() {
    return this.accounts
      .filter((item) => !item.has_secret)
      .filter((item) => item.alias !== '@ANON')
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
      .filter((item) => item.has_secret)
      .sort((a, b) => {
        return a.name.localeCompare(b.name);
      });
  }

  get anonymousAccounts() {
    const allowAnonymousCategory = ['custom', 'web'];
    return this.accounts.filter(item => {
      return item.alias === '@ANON' && allowAnonymousCategory.indexOf(this.asset.category.value) >= 0;
    });
  }

  get adDomain() {
    if (!this.protocol || this.protocol.name !== 'rdp') {
      return '';
    }
    const rdp = this.asset.protocols.find(item => item.name === 'rdp');
    if (!rdp || !rdp.setting || typeof rdp.setting !== 'object') {
      return '';
    }
    return rdp.setting['ad_domain'];
  }

  get showManualUsernameInput() {
    if (!this.accountSelected) {
      return false;
    }
    return this.accountSelected.username === '@INPUT' || this.accountSelected.alias === '@USER';
  }

  public compareFn = (f1, f2) => f1 && f2 && f1.alias === f2.alias;

  ngOnInit() {
    this.groupedAccounts = this.groupAccounts();
    this.filteredUsersGroups.next(this.groupedAccounts.slice());

    // 检查url中是否有 login_account 参数
    this.checkUrlForLoginAccountParam();

    if (this.accountSelected) {
      const username = this.accountSelected.username;
      this.manualAuthInfo.username = username.startsWith('@') ? '' : username;
      if (username === '@USER') {
        this.manualAuthInfo.username = User.username;
      }
    }

    this.accountFilterCtl.valueChanges
      .pipe(takeUntil(this._onDestroy))
      .subscribe(() => {
        this.filterAccounts();
      });

    this.accountCtl.valueChanges
      .pipe(takeUntil(this._onDestroy))
      .subscribe(() => {
        this.accountSelectedChange.emit(this.accountSelected);
        this.onAccountChanged();
      });

    setTimeout(() => {
      this.accountCtl.setValue(this.accountSelected);
      this.accountCtl.setValidators([Validators.required]);
    }, 100);

  }

  ngOnDestroy() {
    this._onDestroy.next();
    this._onDestroy.complete();
  }

  getPreAccountSelected() {
    const preConnectData = this._appSvc.getPreConnectData(this.asset);
    if (preConnectData && preConnectData.account) {
      return this.accounts.find(item => item.alias === preConnectData.account.alias);
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

    for (const group of groups) {
      if (group.accounts.length > 0) {
        this.accountSelected = group.accounts[0];
        break;
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
      this.localAuthItems = this.localAuthItems.filter(item => item.username === this.manualAuthInfo.username);
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
}
