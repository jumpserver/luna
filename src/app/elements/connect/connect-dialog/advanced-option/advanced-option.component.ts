import {Component, Input, OnInit, OnChanges, Output, EventEmitter} from '@angular/core';
import {ConnectMethod, ConnectOption} from '@app/model';

@Component({
  selector: 'elements-advanced-option',
  templateUrl: './advanced-option.component.html',
  styleUrls: ['./advanced-option.component.scss'],
})
export class ElementAdvancedOptionComponent implements  OnInit, OnChanges {
  @Input() connectMethod: ConnectMethod;
  @Input() accountSelected: any;
  @Output() onOptionsChange = new EventEmitter<ConnectOption[]>();
  public advancedOptions: ConnectOption[] = [];
  public isShowAdvancedOption = false;
  public needShowAutoCompletionProtocols: Array<string> = ['mysql', 'mariadb'];

  constructor() {}

  ngOnInit() {
    const accountSelectedProtocol = this.accountSelected && this.accountSelected.hasOwnProperty('protocol') ? this.accountSelected.protocol : '';
    this.advancedOptions = [
      {
        type: 'checkbox',
        field: 'disableautohash',
        hidden: () => {
          return this.connectMethod.value === 'web_cli'
            && this.needShowAutoCompletionProtocols.includes(accountSelectedProtocol);
          },
          label: 'Disable auto completion',
          value: false
        }
      ];
  }

  ngOnChanges(changes) {
    this.isShowAdvancedOption = this.advancedOptions.some(i => i.hidden());
  }

  optionChange(event) {
    this.onOptionsChange.emit(this.advancedOptions);
  }
}
