import {Component, EventEmitter, Input, OnInit, Output} from '@angular/core';
import {ConnectMethod, ConnectOption, Protocol} from '@app/model';
import {AppService, I18nService} from '@app/services';

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

  constructor(private _i18n: I18nService, private _appSvc: AppService) { }

  ngOnInit() {
    this.setConnectMethods();
  }

  currentConnectMethodTypeIndex() {
    const i = this.connectMethodTypes.map((item) => item.value).indexOf(this.connectMethod.type);
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
    this.connectMethodTypes = connectMethodTypes.filter((item) => item['methods'].length > 0);
    // return connectMethodTypes;
  }

  downloadRDPFile(method) {
    this.connectMethod = method;
    this.onDownloadRDPFile.emit(this.connectMethod);
  }
}
