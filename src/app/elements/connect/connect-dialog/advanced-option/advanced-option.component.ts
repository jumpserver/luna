import {Component, Input, OnChanges, Output, EventEmitter} from '@angular/core';
import {ConnectMethod, ConnectOption, Protocol} from '@app/model';

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
  public needShowAutoCompletionProtocols: Array<string> = ['mysql', 'mariadb'];

  constructor() {}

  ngOnChanges() {
    this.advancedOptions = [
      {
        type: 'checkbox',
        field: 'disableautohash',
        hidden: () => {
          return this.connectMethod.value === 'web_cli'
            && this.needShowAutoCompletionProtocols.includes(this.protocol.name);
          },
          label: 'Disable auto completion',
          value: false
        }
      ];
    this.isShowAdvancedOption = this.advancedOptions.some(i => i.hidden());
  }

  optionChange(event) {
    this.onOptionsChange.emit(this.advancedOptions);
  }
}
