import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Account, AuthInfo, ConnectMethod, Protocol } from '@app/model';
import { AppService, I18nService, SettingService } from '@app/services';

@Component({
  standalone: false,
  selector: 'elements-connect-method',
  templateUrl: 'connect-method.component.html',
  styleUrls: ['connect-method.component.scss']
})
export class ElementConnectMethodComponent implements OnInit {
  @Output() connectMethodChange = new EventEmitter<ConnectMethod>();
  @Output() onDownloadRDPFile = new EventEmitter<ConnectMethod>();
  @Output() onGuidePage = new EventEmitter<ConnectMethod>();
  @Input() manualAuthInfo: AuthInfo;
  @Input() connectOption: Object;
  @Input() account: Account;
  public connectMethods = [];
  public connectMethodTypes = [];
  public categoryIndex = 0;
  public connectMethodValue: string;

  constructor(
    private _i18n: I18nService,
    private _appSvc: AppService,
    private _settingSvc: SettingService
  ) {}

  get isAppletClientMethod() {
    return this.connectOption && this.connectOption['appletConnectMethod'] === 'client';
  }

  get isVirtualAppClientMethod() {
    return this.connectOption && this.connectOption['virtualappConnectMethod'] === 'client';
  }

  private _protocol: Protocol;

  get protocol() {
    return this._protocol;
  }

  @Input() set protocol(protocol: Protocol) {
    this._protocol = protocol;
    this.setConnectMethods();
  }

  private _connectMethod: ConnectMethod;

  get connectMethod() {
    return this._connectMethod;
  }

  @Input() set connectMethod(c: ConnectMethod) {
    this._connectMethod = c;

    if (this.connectMethods && this.connectMethods.length > 0 && c) {
      const matched = this.connectMethods.find(item => item.value === c.value);
      this._connectMethod = matched ? matched : this.connectMethods[0];
    }

    this.categoryIndex = this.currentConnectMethodTypeIndex();
    this.connectMethodValue = this._connectMethod ? this._connectMethod.value : undefined;
    this.connectMethodChange.emit(this._connectMethod);
  }

  ngOnInit() {
    this.setConnectMethods();
  }

  currentConnectMethodTypeIndex() {
    const i = this.connectMethodTypes
      .map(item => item.value)
      .indexOf(this.connectMethod && this.connectMethod.type);
    if (i === -1) {
      return 0;
    }
    return i;
  }

  onConnectMethodTypeChange(value) {
    this.connectMethod = this.connectMethodTypes[value].methods[0];
  }

  setConnectMethods() {
    if (!this.protocol) {
      return;
    }
    this.connectMethods = this._appSvc.getProtocolConnectMethods(this.protocol.name);
    this.groupConnectMethods();

    const matchedMethod = this.connectMethods.find(
      item => item.value === this.connectMethod?.value
    );

    this.connectMethod = matchedMethod ? matchedMethod : this.connectMethods[0];
    this.categoryIndex = this.currentConnectMethodTypeIndex();
    this.connectMethodValue = this.connectMethod ? this.connectMethod.value : undefined;
  }

  groupConnectMethods() {
    const connectMethodTypes = [
      { value: 'web', label: 'Web', fa: 'fa-globe', methods: [] },
      {
        value: 'native',
        label: this._i18n.instant('Native'),
        fa: 'fa-desktop',
        methods: []
      },
      {
        value: 'applet',
        label: this._i18n.instant('Applet'),
        fa: 'fa-windows',
        methods: []
      },
      {
        value: 'virtual_app',
        label: this._i18n.instant('VirtualApp'),
        fa: 'fa-desktop',
        methods: []
      }
    ];

    for (const type of connectMethodTypes) {
      type['methods'] = this.connectMethods.filter(item => item.type === type.value);
    }
    this.connectMethodTypes = connectMethodTypes.filter(item => {
      return item['methods'].length > 0;
    });
    // return connectMethodTypes;
  }

  canDownloadRDPFile(method): Boolean {
    if (!this._settingSvc.hasXPack()) {
      return false;
    }
    if (this.account && !this.account.has_secret) {
      const aliases = ['@USER', '@INPUT', '@ANON'];
      // 同名账号、手动输入可以下载RDP文件
      if (!aliases.includes(this.account.alias) || !this.manualAuthInfo.username) {
        return false;
      }
    }
    if (method.component === 'razor') {
      return true;
    }
    if (method.type === 'applet' && this.isAppletClientMethod) {
      return true;
    }
    return false;
  }

  downloadRDPFile(method) {
    if (method.disabled) {
      return;
    }
    this.connectMethod = method;
    this.onDownloadRDPFile.emit(this.connectMethod);
  }

  CanGuide(method) {
    if (method.type === 'virtual_app' && this.isVirtualAppClientMethod) {
      return true;
    }
    return false;
  }

  ChangeToGuidePage(method) {
    if (method.disabled) {
      return;
    }
    this.connectMethod = method;
    this.onGuidePage.emit(this.connectMethod);
  }

  onConnectMethodValueChange(value: string) {
    if (!this.connectMethods || this.connectMethods.length === 0) {
      return;
    }

    const matched = this.connectMethods.find(item => item.value === value);

    if (matched) {
      this._connectMethod = matched;
      this.connectMethodChange.emit(this._connectMethod);
    }
  }
}
