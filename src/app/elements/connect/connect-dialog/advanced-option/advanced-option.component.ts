import {Component, Input, OnChanges, OnInit} from '@angular/core';
import {ConnectMethod, ConnectOption, Protocol, Setting, GlobalSetting} from '@app/model';
import {resolutionsChoices} from '@app/globals';
import {SettingService} from '@app/services';

@Component({
  selector: 'elements-advanced-option',
  templateUrl: './advanced-option.component.html',
  styleUrls: ['./advanced-option.component.scss'],
})
export class ElementAdvancedOptionComponent implements OnChanges, OnInit {
  @Input() protocol: Protocol;
  @Input() connectMethod: ConnectMethod;
  @Input() connectOption: any = {};
  public advancedOptions: ConnectOption[] = [];
  public isShowAdvancedOption = false;
  public setting: Setting;
  public globalSetting: GlobalSetting;
  private allOptions: ConnectOption[] = [];
  private boolChoices = [
    {label: 'Yes', value: true},
    {label: 'No', value: false},
  ];

  constructor(public _settingSvc: SettingService) {
    this.setting = _settingSvc.setting;
    this.globalSetting = _settingSvc.globalSetting;
    this.allOptions = [
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
          {label: 'GB2312', value: 'gb2312'},
          {label: 'IOS-8859-1', value: 'ios-8859-1'},
        ]
      },
      {
        type: 'select',
        field: 'disableautohash',
        hidden: () => {
          const protocolsCanAutoHash: Array<string> = ['mysql', 'mariadb'];
          if (this.connectMethod) {
            if (this.connectMethod.component === 'koko') {
              return this.connectMethod.component !== 'koko' || !protocolsCanAutoHash.includes(this.protocol.name);
            }
            if (this.connectMethod.component === 'chen') {
              return false;
            }
          }
          return true;
        },
        label: 'Disable auto completion',
        value: false,
        options: this.boolChoices
      },
      {
        type: 'select',
        field: 'token_reusable',
        hidden: () => {
          return !(this.connectMethod.component === 'magnus' && this.connectMethod.value === 'db_client' && this.globalSetting.CONNECTION_TOKEN_REUSABLE);
        },
        label: 'Set reusable',
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
        options: resolutionsChoices.map(i => ({label: i, value: i.toLowerCase()})),
        label: 'RDP resolution',
        value: this.setting.graphics.rdp_resolution || 'auto'
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
          ...(this.globalSetting.TERMINAL_RAZOR_ENABLED ? [{label: 'Client', value: 'client'}] : [])
        ],
        label: 'Applet connect method',
        value: this.setting.graphics.applet_connection_method,
        hidden: () => {
          if (!this._settingSvc.hasXPack()) {
            return true;
          }
          return !this.connectMethod || this.connectMethod.component !== 'tinker';
        }
      },
      {
        type: 'select',
        field: 'virtualappConnectMethod',
        options: [
          {label: 'Web', value: 'web'},
          ...(true ? [{label: 'Client', value: 'client'}] : [])
        ],
        label: 'Virtualapp connect method',
        value: this.setting.graphics.applet_connection_method,
        hidden: () => {
          if (!this._settingSvc.hasXPack()) {
            return true;
          }
          return !this.connectMethod || this.connectMethod.component !== 'panda';
        }
      },
      {
        type: 'select',
        field: 'reusable',
        options: this.boolChoices,
        label: 'RDP file reusable',
        value: false,
        hidden: () => {
          if (!this.connectMethod) {
            return true;
          }
          if (!this._settingSvc.globalSetting.CONNECTION_TOKEN_REUSABLE) {
            return true;
          }
          if (this.connectMethod.component === 'razor') {
            return false;
          }
          if (this.connectMethod.component === 'tinker') {
            return this.connectOption.appletConnectMethod !== 'client';
          }
          return true;
        }
      },
      {
        type: 'select',
        field: 'rdp_connection_speed',
        label: 'RDP connection speed',
        hidden: () => {
          return this.connectMethod && this.connectMethod.component !== 'razor';
        },
        value: 'auto',
        options: [
          {label: 'Auto', value: 'auto'},
          {label: 'Low Speed Broadband (256 Kbps - 2 Mbps)', value: 'low_speed_broadband'},
          {label: 'High-speed broadband (2 Mbps – 10 Mbps )', value: 'high_speed_broadband'},
        ]
      }
    ];
  }

  ngOnInit() {
  }

  checkOptions() {
    const onlyUsingDefaultFields = ['reusable'];
    this.allOptions.forEach(i => {
      if (this.connectOption[i.field] === undefined) {
        this.connectOption[i.field] = i.value;
      }
      if (onlyUsingDefaultFields.includes(i.field)) {
        i.value = this.connectOption[i.field];
      }
    });
    this.advancedOptions = this.allOptions.filter(i => !i.hidden());
    this.isShowAdvancedOption = this.advancedOptions.length > 0;
  }

  onChange() {
    this.checkOptions();
  }

  ngOnChanges() {
    this.checkOptions();
  }
}
