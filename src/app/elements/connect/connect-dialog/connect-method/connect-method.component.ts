import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {ConnectMethod, Protocol} from '@app/model';
import {AppService, I18nService, SettingService} from '@app/services';

@Component({
  selector: 'elements-connect-method',
  templateUrl: './connect-method.component.html',
  styleUrls: ['./connect-method.component.scss']
})
export class ElementConnectMethodComponent implements OnInit {
  @Output() connectMethodChange = new EventEmitter<ConnectMethod>();
  @Output() onDownloadRDPFile = new EventEmitter<ConnectMethod>();
  @Input() connectOption: Object = {};
  public connectMethods = [];
  public connectMethodTypes = [];

  constructor(private _i18n: I18nService,
              private _appSvc: AppService,
              private _settingSvc: SettingService
  ) {
  }

  get isAppletClientMethod() {
    return this.connectOption['appletClientMethod'] === 'client';
  }

  private _protocol: Protocol;

  get protocol() {
    return this._protocol;
  }

  @Input() set protocol(protocol: Protocol) {
    this._protocol = protocol;
    this.setConnectMethods();
    this.connectMethod = this.connectMethods[0];
  }

  private _connectMethod: ConnectMethod;

  get connectMethod() {
    return this._connectMethod;
  }

  @Input() set connectMethod(c: ConnectMethod) {
    this._connectMethod = c;
    this.connectMethodChange.emit(c);
  }

  ngOnInit() {
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
    this.groupConnectMethods();
    if (!this.connectMethod || !this.connectMethod.value) {
      this.connectMethod = this.connectMethods[0];
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
    this.connectMethodTypes = connectMethodTypes.filter((item) => {
      return item['methods'].length > 0;
    });
    // return connectMethodTypes;
  }

  canDownloadRDPFile(method): Boolean {
    if (!this._settingSvc.hasXPack()) {
      return false;
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
}
