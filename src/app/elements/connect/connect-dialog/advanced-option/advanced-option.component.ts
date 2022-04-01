import {Component, Input, OnInit, OnChanges, Output, EventEmitter} from '@angular/core';
import {ConnectType, ConnectOption} from '@app/model';

@Component({
  selector: 'elements-advanced-option',
  templateUrl: './advanced-option.component.html',
  styleUrls: ['./advanced-option.component.scss'],
})
export class ElementAdvancedOptionComponent implements  OnInit, OnChanges {
  @Input() connectType: ConnectType;
  @Input() systemUserSelected: any;
  @Output() onOptionsChange = new EventEmitter<ConnectOption[]>();
  public advancedOptions: ConnectOption[] = [];
  public isShowAdvancedOption = false;

  constructor() {}

  ngOnInit() {
    this.advancedOptions = [
      {
        type: 'checkbox',
        field: 'disableautohash',
        hidden: () => {
          return this.systemUserSelected.protocol === 'mysql' && this.connectType.id === 'webCLI';
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
