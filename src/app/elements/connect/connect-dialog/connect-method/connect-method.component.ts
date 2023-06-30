import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {ConnectMethod, ConnectOption, Protocol} from '@app/model';
import {AppService, I18nService, SettingService} from '@app/services';

@Component({
  selector: 'elements-connect-method',
  templateUrl: './connect-method.component.html',
  styleUrls: ['./connect-method.component.scss']
})
export class ElementConnectMethodComponent implements OnInit {
  private _protocol: Protocol;
  @Input() set protocol(protocol: Protocol) {
    this._protocol = protocol;
    this.setConnectMethods();
    this.connectMethod = this.connectMethods[0];
  }
  get protocol() {
    return this._protocol;
  }
  private _connectMethod: ConnectMethod;
  @Input() set connectMethod(c: ConnectMethod) {
    this._connectMethod = c;
    this.connectMethodChange.emit(c);
  }
  get connectMethod() {
    return this._connectMethod;
  }
  @Output() connectMethodChange = new EventEmitter<ConnectMethod>();
  @Output() onDownloadRDPFile = new EventEmitter<ConnectMethod>();
  public connectMethods = [];
  public connectMethodTypes = [];
  public isAppletClientMethod = false;

  constructor(private _i18n: I18nService,
    private _appSvc: AppService,
    private _settingSvc: SettingService
  ) {}

  ngOnInit() {
    this._settingSvc.appletConnectMethod$.subscribe((state) => {
      this.isAppletClientMethod = state === 'client';
    });
    this.setConnectMethods();
  }

  currentConnectMethodTypeIndex() {
    const i = this.connectMethodTypes
      .map((item) => item.value)
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
    this.connectMethods = this._appSvc.getProtocolConnectMethods(this.protocol.name);
    if (this.protocol.name === 'oracle') {
      this.oracleFilterConnectMethods();
    }
    if (this.protocol.name === 'ssh') {
      this.sshFilterConnectMethods();
    }
    this.groupConnectMethods();
    if (!this.connectMethod || !this.connectMethod.value) {
      this.connectMethod = this.connectMethods[0];
    }
  }

  oracleFilterConnectMethods() {
    this.connectMethods = this.connectMethods.filter((item) => (item.value !== 'web_cli'));
    this.connectMethod = this.connectMethods[0];
  }

  sshFilterConnectMethods() {
    if (!this.protocol.setting.sftp_enabled) {
      this.connectMethods = this.connectMethods.filter((item) => (item.value !== 'web_sftp'));
    }
  }

  groupConnectMethods() {
    const connectMethodTypes = [
      {value: 'web', label: 'Web', fa: 'fa-globe', methods: []},
      {value: 'native', label: this._i18n.instant('Native'), fa: 'fa-desktop', methods: []},
      {value: 'applet', label: this._i18n.instant('Applet'), fa: 'fa-windows', methods: []},
    ];

    for (const type of connectMethodTypes) {
      type['methods'] = this.connectMethods.filter((item) => item.type === type.value);
    }
    this.connectMethodTypes = connectMethodTypes.filter((item) => item['methods'].length > 0);
    // return connectMethodTypes;
  }

  canDownloadRDPFile(method): Boolean {
    if (!this._settingSvc.hasXPack()) {
      return false;
    }
    if (['razor', 'xrdp'].includes(method.component)) {
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
}
