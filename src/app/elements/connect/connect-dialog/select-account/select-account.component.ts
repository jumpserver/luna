import {ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild} from '@angular/core';
import {Account, AccountGroup, AuthInfo, Asset} from '@app/model';
import {BehaviorSubject, ReplaySubject, Subject} from 'rxjs';
import {FormControl, Validators} from '@angular/forms';
import {AppService, LocalStorageService, LogService, SettingService, I18nService} from '@app/services';
import {takeUntil} from 'rxjs/operators';

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

  protected _onDestroy = new Subject<void>();
  public accountSelected: Account;
  public groupedAccounts: AccountGroup[];
  public accountCtl: FormControl = new FormControl();
  public accountFilterCtl: FormControl = new FormControl();
  public filteredUsersGroups: ReplaySubject<AccountGroup[]> = new ReplaySubject<AccountGroup[]>(1);
  public compareFn = (f1, f2) => f1 && f2 && f1.id === f2.id;

  constructor(private _logger: LogService,
              private _appSvc: AppService,
              private _i18n: I18nService,
              private _settingSvc: SettingService,
              private _cdRef: ChangeDetectorRef,
              private _localStorage: LocalStorageService
  ) {}

  get noSecretAccounts() {
    return this.accounts
      .filter((item) => !item.has_secret)
      .sort((a, b) => {
        const eq = +a.username.startsWith('@') - +b.username.startsWith('@');
        if (eq !== 0) { return eq; }
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

  ngOnInit() {
    this.groupedAccounts = this.groupAccounts();
    this.filteredUsersGroups.next(this.groupedAccounts.slice());

    if (this.accountSelected) {
      this.manualAuthInfo.username = this.accountSelected.username.startsWith('@') ? '' : this.accountSelected.username;
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
    const groups = [];
    const preAccountSelected = this.getPreAccountSelected();
    if (preAccountSelected) {
      this.accountSelected = preAccountSelected;
      groups.push({
        name: this._i18n.instant('Last login'),
        accounts: [preAccountSelected]
      });
    }

    if (this.hasSecretAccounts.length > 0) {
      if (!this.accountSelected) {
        this.accountSelected = this.hasSecretAccounts[0];
      }
      groups.push({
        name: this._i18n.instant('With secret accounts'),
        accounts: this.hasSecretAccounts
      });
    }

    if (this.noSecretAccounts.length > 0) {
      if (!this.accountSelected) {
        this.accountSelected = this.noSecretAccounts[0];
      }
      groups.push({
        name: this._i18n.instant('Manual accounts'),
        accounts: this.noSecretAccounts
      });
    }
    if (groups.length === 0) {
      groups.push({
        name: this._i18n.instant('No account available'),
        accounts: []
      });
    }
    return groups;
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
    } else {
      search = search.toLowerCase();
    }
    this.filteredUsersGroups.next(
      accountsGroupsCopy.filter(group => {
        const showGroup = group.name.toLowerCase().indexOf(search) > -1;
        if (!showGroup) {
          group.accounts = group.accounts.filter(account => {
            return account.name.toLowerCase().indexOf(search) > -1;
          });
        }
        return group.accounts.length > 0;
      })
    );
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
    } else {
      this.manualAuthInfo.username = this.accountSelected.username;
    }
    this.manualAuthInfo.secret = '';
    this.localAuthItems = this._appSvc.getAccountLocalAuth(this.asset.id);
    if (this.localAuthItems && this.localAuthItems.length > 0) {
      this.manualAuthInfo = Object.assign(this.manualAuthInfo, this.localAuthItems[0]);
    }
    this.setUsernamePlaceholder();
    setTimeout(() => {
      if (this.manualAuthInfo.username) {
        this.passwordRef.nativeElement.focus();
      } else {
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
}
