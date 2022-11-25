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
  @Output() onSelectAccount: EventEmitter<Account> = new EventEmitter<Account>();
  @Input() onSubmit$: BehaviorSubject<boolean>;
  @Input() manualAuthInfo: AuthInfo;
  @ViewChild('username', {static: false}) usernameRef: ElementRef;
  @ViewChild('password', {static: false}) passwordRef: ElementRef;

  public hidePassword = true;
  public rememberAuth = false;
  public rememberAuthDisabled = false;
  usernameControl = new FormControl();
  authsOptions: AuthInfo[];
  filteredOptions: AuthInfo[];
  accountManualAuthInit = false;
  usernamePlaceholder: string = 'Username';

  protected _onDestroy = new Subject<void>();
  public accountSelected: Account;
  public groupedAccounts: AccountGroup[];
  public filteredUsersGroups: ReplaySubject<AccountGroup[]> = new ReplaySubject<AccountGroup[]>(1);
  public accountCtl: FormControl = new FormControl();
  public filteredCtl: FormControl = new FormControl();
  public compareFn = (f1, f2) => f1 && f2 && f1.id === f2.id;

  constructor(private _settingSvc: SettingService,
              private _cdRef: ChangeDetectorRef,
              private _logger: LogService,
              private _appSvc: AppService,
              private _localStorage: LocalStorageService,
              private _i18n: I18nService,
  ) {}

  get specialAccounts() {
    return this.accounts.filter((item) => item.username.startsWith('@'));
  }

  get normalAccounts() {
    return this.accounts.filter((item) => !item.username.startsWith('@'));
  }

  ngOnInit() {
    this.accountSelected = this.accounts[0];
    console.log('this.accounts', this.accounts);
    this.groupedAccounts = this.groupAccounts();
    this.filteredUsersGroups.next(this.groupedAccounts.slice());
    this.manualAuthInfo.username = this.accountSelected.username.startsWith('@') ? '' : this.accountSelected.username;

    this.filteredCtl.valueChanges
      .pipe(takeUntil(this._onDestroy))
      .subscribe(() => {
        this.filterAccounts();
      });

    this.accountCtl.valueChanges
      .pipe(takeUntil(this._onDestroy))
      .subscribe(() => {
        this.onSelectAccount.emit(this.accountSelected);
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

  getPreferAccount() {
    const preferId = this._appSvc.getAssetPreferAccount(this.asset.id);
    const matchedAccounts = this.accounts.find((item) => item.id === preferId);
    if (preferId && matchedAccounts) { return matchedAccounts; }
    return null;
  }

  groupAccounts() {
    const groups = [];
    const preferAccount: any = this.getPreferAccount();
    if (preferAccount) {
      this.accountSelected = preferAccount;
      groups.push({
        name: this._i18n.instant('Last login'),
        accounts: [preferAccount]
      });
    }
    groups.push({
      name: 'Normal accounts',
      accounts: this.normalAccounts
    });
    groups.push({
      name: 'Special accounts',
      accounts: this.specialAccounts
    });
    return groups;
  }

  filterAccounts() {
    if (!this.groupedAccounts) {
      return;
    }
    let search = this.filteredCtl.value;
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
          group.accounts = group.accounts.filter(
            account => {
              return account.name.toLowerCase().indexOf(search) > -1;
            }
          );
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
    if (!this.accountSelected || this.accountSelected['login_mode'] !== 'manual') {
      return;
    }
    this.manualAuthInfo.username = '';
    this.manualAuthInfo.secret = '';
    this.authsOptions = this._appSvc.getAccountLocalAuth(this.asset.id, this.accountSelected.id);
    if (this.authsOptions && this.authsOptions.length > 0) {
      this.manualAuthInfo = Object.assign(this.manualAuthInfo, this.authsOptions[0]);
    }
    if (!this.manualAuthInfo.username && this.accountSelected.username) {
      this.manualAuthInfo.username = this.accountSelected.username;
    }
    this.setUsernamePlaceholder();
    this._cdRef.detectChanges();
    setTimeout(() => {
      if (this.manualAuthInfo.username) {
        this.passwordRef.nativeElement.focus();
      } else {
        this.usernameRef.nativeElement.focus();
      }
    }, 10);
  }

  onFocus() {
    if (!this.accountManualAuthInit) {
      this.usernameControl.setValue('');
      this.accountManualAuthInit = true;
    }
  }

  onUsernameChanges() {
    const filterValue = this.manualAuthInfo.username.toLowerCase();
    this.filteredOptions = this.authsOptions.filter(authInfo => {
      if (authInfo.username.toLowerCase() === filterValue) {
        this.manualAuthInfo = Object.assign(this.manualAuthInfo, authInfo);
      }
      return authInfo.username.toLowerCase().includes(filterValue);
    });
  }

  subscribeSubmitEvent() {
    this.onSubmit$.subscribe(() => {
      if (this.rememberAuth) {
        this._logger.debug('Save auth to local storage: ', this.asset.id, this.accountSelected.id, this.manualAuthInfo);
        this._appSvc.saveAssetAccountAuth(this.asset.id, this.accountSelected.id, this.manualAuthInfo);
      }
    });
  }

  getSavedAuthInfos() {
    this.authsOptions = this._appSvc.getAccountLocalAuth(this.asset.id, this.accountSelected.id);
  }
}
