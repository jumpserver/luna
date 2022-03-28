import {ChangeDetectorRef, Component, ElementRef, Inject, Input, OnInit, ViewChild} from '@angular/core';
import {AuthInfo, SystemUser, TreeNode} from '@app/model';
import {User} from '@app/globals';
import {AppService, I18nService, LocalStorageService, LogService, SettingService} from '@app/services';
import {FormControl} from '@angular/forms';
import {BehaviorSubject} from 'rxjs';

@Component({
  selector: 'elements-advanced-option',
  templateUrl: './advanced-option.component.html',
  styleUrls: ['./advanced-option.component.scss'],
})
export class ElementAdvancedOptionComponent implements  OnInit {
  @Input() node: TreeNode;
  @Input() AdvancedOption: any;

  @ViewChild('username', {static: false}) usernameRef: ElementRef;
  @ViewChild('password', {static: false}) passwordRef: ElementRef;
  usernameControl = new FormControl();
  authsOptions: AuthInfo[];
  filteredOptions: AuthInfo[];
  systemUserManualAuthInit = false;
  usernamePlaceholder: string = 'Username';

  constructor(private _settingSvc: SettingService,
              private _cdRef: ChangeDetectorRef,
              private _logger: LogService,
              private _appSvc: AppService,
              private _i18n: I18nService,
              private _localStorage: LocalStorageService,
  ) {}

  ngOnInit() {
    console.log(this.AdvancedOption, '============0-================888')
  }
}
