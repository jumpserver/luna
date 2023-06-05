import {Component, EventEmitter, Input, OnChanges, Output} from '@angular/core';
import {ConnectMethod, ConnectOption, Protocol} from '@app/model';
import {resolutionsChoices} from '@app/globals';

@Component({
  selector: 'elements-advanced-option',
  templateUrl: './advanced-option.component.html',
  styleUrls: ['./advanced-option.component.scss'],
})
export class ElementAdvancedOptionComponent implements OnChanges {
  @Input() protocol: Protocol;
  @Input() connectMethod: ConnectMethod;
  @Output() onOptionsChange = new EventEmitter<ConnectOption[]>();
  public advancedOptions: ConnectOption[] = [];
  public isShowAdvancedOption = false;

  constructor() {
  }

  ngOnChanges() {
    this.advancedOptions = [
      {
        type: 'select',
        field: 'charset',
        label: 'Charset',
        hidden: () => {
          const protocolsCanCharset: Array<string> = ['ssh', 'telnet'];
          console.log('CUrrent protocol', this.protocol);
          return this.connectMethod.component !== 'koko' || !protocolsCanCharset.includes(this.protocol.name);
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
          console.log('CUrrent protocol hash', this.protocol);
          const protocolsCanAutoHash: Array<string> = ['mysql', 'mariadb'];
          return this.connectMethod.component !== 'koko' || !protocolsCanAutoHash.includes(this.protocol.name);
        },
        label: 'Disable auto completion',
        value: false,
        options: [
          {label: 'Yes', value: true},
          {label: 'No', value: false},
        ]
      },
      {
        type: 'select',
        field: 'resolution',
        hidden: () => {
          const protocolsCanResolution: Array<string> = ['rdp'];
          console.log('CUrrent protocol res', this.protocol);
          return !protocolsCanResolution.includes(this.protocol.name);
        },
        options: resolutionsChoices.map(i => ({label: i, value: i})),
        label: 'Resolution',
        value: 'Auto'
      }
    ];
    this.advancedOptions = this.advancedOptions.filter(i => !i.hidden());
    this.isShowAdvancedOption = this.advancedOptions.length > 0;
  }

  optionChange(event) {
    this.onOptionsChange.emit(this.advancedOptions);
  }
}
