import {Component, OnInit, OnDestroy, Inject, ViewChild, ElementRef, ChangeDetectorRef} from '@angular/core';
import 'rxjs/add/operator/toPromise';
import {AppService, LocalStorageService, LogService, SettingService} from '@app/services';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material';
import {FormControl, Validators} from '@angular/forms';
import {ReplaySubject, Subject} from 'rxjs';
import {takeUntil} from 'rxjs/operators';
import {groupByProp} from '@app/utils/common';
import {SystemUserGroup, SystemUser, AuthInfo, ConnectType, ConnectData} from '@app/model';

@Component({
  selector: 'elements-asset-tree-dialog',
  templateUrl: 'connect-dialog.component.html',
  styleUrls: ['./connect-dialog.component.scss'],
})
export class ConnectDialogComponent implements OnInit, OnDestroy {
  public systemUserSelected: SystemUser;
  public systemUsers: SystemUser[];
  public systemUsersGroups: SystemUserGroup[];
  public filteredUsersGroups: ReplaySubject<SystemUserGroup[]> = new ReplaySubject<SystemUserGroup[]>(1);
  public sysUserCtrl: FormControl = new FormControl('', [Validators.required]);
  public filteredCtrl: FormControl = new FormControl();
  public hidePassword = true;
  public manualAuthInfo: AuthInfo = new AuthInfo();
  public outputData: ConnectData = new ConnectData();
  protected _onDestroy = new Subject<void>();
  @ViewChild('username') usernameRef: ElementRef;
  @ViewChild('password') passwordRef: ElementRef;

  public connectType: ConnectType;
  public connectTypes = [];
  public compareFn = (f1, f2) => f1 && f2 && f1.id === f2.id;

  constructor(public dialogRef: MatDialogRef<ConnectDialogComponent>,
              private _settingSvc: SettingService,
              private _cdRef: ChangeDetectorRef,
              private _logger: LogService,
              private _appSvc: AppService,
              private _localStorage: LocalStorageService,
              @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  ngOnInit() {
    this.systemUsers = this.data.systemUsers;
    this.systemUsersGroups = this.groupSystemUsers();
    this.systemUserSelected = this.systemUsers[0];
    this.filteredUsersGroups.next(this.systemUsersGroups.slice());
    this.filteredCtrl.valueChanges
      .pipe(takeUntil(this._onDestroy))
      .subscribe(() => {
        this.filterSysUsers();
      });
    this.sysUserCtrl.valueChanges
      .pipe(takeUntil(this._onDestroy))
      .subscribe(() => {
        this.setManualAuthInfo();
        this.setConnectTypes();
      });

    setTimeout(() => {
      this.sysUserCtrl.setValue(this.systemUserSelected);
    }, 100);
  }

  ngOnDestroy() {
    this._onDestroy.next();
    this._onDestroy.complete();
  }

  setConnectTypes() {
    this.connectTypes = this._appSvc.getProtocolConnectTypes()[this.systemUserSelected.protocol];
    this.connectType = this.getPreferConnectType() || this.connectTypes[0];
  }

  setManualAuthInfo() {
    if (this.systemUserSelected['login_mode'] !== 'manual') {
      return;
    }
    this.manualAuthInfo.username = this.systemUserSelected.username;
    this._cdRef.detectChanges();
    setTimeout(() => {
      if (this.systemUserSelected.username) {
        this.usernameRef.nativeElement.focus();
      } else {
        this.passwordRef.nativeElement.focus();
      }
    }, 10);
  }
  groupSystemUsers() {
    const groups = [];
    const protocolSysUsersMapper = groupByProp(this.systemUsers, 'protocol');
    for (const [protocol, users] of Object.entries(protocolSysUsersMapper)) {
      groups.push({
        name: protocol.toUpperCase(),
        systemUsers: users
      });
    }
    this._logger.debug('Grouped system user: ', groups);
    return groups;
  }

  protected copyGroupedSystemUsers(groups) {
    const systemUsersCopy = [];
    groups.forEach(group => {
      systemUsersCopy.push({
        name: group.name,
        systemUsers: group.systemUsers.slice()
      });
    });
    return systemUsersCopy;
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  filterSysUsers() {
    if (!this.systemUsersGroups) {
      return;
    }
    let search = this.filteredCtrl.value;
    const systemUsersGroupsCopy = this.copyGroupedSystemUsers(this.systemUsersGroups);

    if (!search) {
      this.filteredUsersGroups.next(this.systemUsersGroups.slice());
      return;
    } else {
      search = search.toLowerCase();
    }
    this.filteredUsersGroups.next(
      systemUsersGroupsCopy.filter(group => {
        const showGroup = group.name.toLowerCase().indexOf(search) > -1;
        if (!showGroup) {
          group.systemUsers = group.systemUsers.filter(sysUser => sysUser.name.toLowerCase().indexOf(search) > -1);
        }
        return group.systemUsers.length > 0;
      })
    );
  }

  getPreferConnectType() {
    const key = `ProtocolPreferLoginType`;
    const preferTypesSetting = this._localStorage.get(key) || {};
    const preferConnectTypeId = preferTypesSetting[this.systemUserSelected.protocol];
    const matchedTypes = this.connectTypes.filter((item) => item.id === preferConnectTypeId);
    if (matchedTypes.length === 1) {
      return matchedTypes[0];
    } else {
      return this.connectTypes[0];
    }
  }

  recordPreferConnectType() {
    const key = `ProtocolPreferLoginType`;
    const preferTypesSetting = this._localStorage.get(key) || {};
    preferTypesSetting[this.systemUserSelected.protocol] = this.connectType.id;
    this._localStorage.set(key, preferTypesSetting);
  }

  onConfirm() {
    this.outputData.systemUser = this.systemUserSelected;
    this.outputData.manualAuthInfo = this.manualAuthInfo;
    this.outputData.connectType = this.connectType;

    this.recordPreferConnectType();
    this.dialogRef.close(this.outputData);
  }
}