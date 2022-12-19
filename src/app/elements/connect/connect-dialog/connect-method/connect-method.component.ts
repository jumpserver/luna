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
    console.log('Changed: ', c);
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

  get currentConnectMethodTypeIndex() {
    return this.connectMethodTypes.map((item) => item.value).indexOf(this.connectMethod.type);
  }

  onConnectMethodTypeChange(value) {
    this.connectMethod = this.connectMethodTypes[value].methods[0];
  }

  setConnectMethods() {
    this.connectMethods = this._appSvc.getProtocolConnectMethods(this.protocol.name);
    this.groupConnectMethods();
    this.connectMethod = this.getPreferConnectMethod() || this.connectMethods[0];
  }

  groupConnectMethods() {
    const connectMethodTypes = [
      {value: 'web', label: 'Web', methods: []},
      {value: 'native', label: this._i18n.instant('Native'), methods: []},
      {value: 'applet', label: this._i18n.instant('Applet'), methods: []},
    ];

    for (const type of connectMethodTypes) {
      type['methods'] = this.connectMethods.filter((item) => item.type === type.value);
    }
    this.connectMethodTypes = connectMethodTypes.filter((item) => item['methods'].length > 0);
    // return connectMethodTypes;
  }

  getPreferConnectMethod() {
    const preferConnectTypeId = this._appSvc.getProtocolPreferLoginType(this.protocol.name);
    const matchedTypes = this.connectMethods.filter((item) => item.id === preferConnectTypeId);
    if (matchedTypes.length === 1) {
      return matchedTypes[0];
    } else {
      return this.connectMethods[0];
    }
  }

  downloadRDPFile(method) {
    this.connectMethod = method;
    this.onDownloadRDPFile.emit(this.connectMethod);
  }
}
