import {Component, Input, OnChanges} from '@angular/core';
import {ConnectMethod, ConnectOption, Protocol, Setting} from '@app/model';
import {resolutionsChoices} from '@app/globals';
import {SettingService} from '@app/services';

@Component({
  selector: 'elements-advanced-option',
  templateUrl: './advanced-option.component.html',
  styleUrls: ['./advanced-option.component.scss'],
})
export class ElementAdvancedOptionComponent implements OnChanges {
  @Input() protocol: Protocol;
  @Input() connectMethod: ConnectMethod;
  @Input() connectOption: Object = {};
  public advancedOptions: ConnectOption[] = [];
  public isShowAdvancedOption = false;
  public setting: Setting;
  private boolChoices = [
    {label: 'Yes', value: true},
    {label: 'No', value: false},
  ];

  constructor(public _settingSvc: SettingService) {
    this.setting = _settingSvc.setting;
  }

  ngOnChanges() {
    this.advancedOptions = [
      {
        type: 'select',
        field: 'charset',
        label: 'Charset',
        hidden: () => {
          const protocolsCanCharset: Array<string> = ['ssh', 'telnet'];
          return this.connectMethod && this.connectMethod.component !== 'koko' || !protocolsCanCharset.includes(this.protocol.name);
        },
        value: 'default',
        options: [
          {label: 'Default', value: 'default'},
          {label: 'UTF-8', value: 'utf8'},
          {label: 'GBK', value: 'gbk'},
        ]
      },
      {
        type: 'select',
        field: 'disableautohash',
        hidden: () => {
          const protocolsCanAutoHash: Array<string> = ['mysql', 'mariadb'];
          return this.connectMethod && this.connectMethod.component !== 'koko' || !protocolsCanAutoHash.includes(this.protocol.name);
        },
        label: 'Disable auto completion',
        value: false,
        options: this.boolChoices
      },
      {
        type: 'select',
        field: 'resolution',
        hidden: () => {
          const protocolsCanResolution: Array<string> = ['rdp'];
          return !protocolsCanResolution.includes(this.protocol.name);
        },
        options: resolutionsChoices.map(i => ({label: i, value: i})),
        label: 'Resolution',
        value: this.setting.graphics.rdp_resolution
      },
      {
        type: 'select',
        field: 'backspaceAsCtrlH',
        hidden: () => {
          return this.connectMethod && this.connectMethod.component !== 'koko';
        },
        options: this.boolChoices,
        label: 'Backspace as Ctrl+H',
        value: this.setting.command_line.is_backspace_as_ctrl_h
      },
      {
        type: 'select',
        field: 'appletConnectMethod',
        options: [
          {label: 'Web', value: 'web'},
          {label: 'Client', value: 'client'}
        ],
        label: 'Applet connect method',
        value: this.setting.graphics.applet_connection_method,
        hidden: () => {
          if (!this._settingSvc.hasXPack()) {
            return true;
          }
          return !this.connectMethod || this.connectMethod.component !== 'tinker';
        }
      }
    ];
    this.advancedOptions = this.advancedOptions.filter(i => !i.hidden());
    this.advancedOptions.forEach(i => {
      if (this.connectOption[i.field] === undefined) {
        this.connectOption[i.field] = i.value;
      }
    });
    this.isShowAdvancedOption = this.advancedOptions.length > 0;
  }
}
