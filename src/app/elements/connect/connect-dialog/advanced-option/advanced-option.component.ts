import {Component, ElementRef, Input, OnInit, ViewChild} from '@angular/core';
import {ConnectType, AdvancedOption} from '@app/model';

@Component({
  selector: 'elements-advanced-option',
  templateUrl: './advanced-option.component.html',
  styleUrls: ['./advanced-option.component.scss'],
})
export class ElementAdvancedOptionComponent implements  OnInit {
  @Input() connectType: ConnectType;
  @Input() systemUserSelected: any;
  @ViewChild('checkbox', {static: false}) checkboxRef: ElementRef;
  public AdvancedOption: AdvancedOption[];
  public isShowAdvancedOption = false;
  checkboxStatus = false;

  constructor() {}

  ngOnInit() {
    console.log(this.connectType, 'connectType----------------------');
    console.log(this.systemUserSelected, 'systemUserSelected---------------------');
  }
  onCheckboxChange(event) {
    this.checkboxStatus = event;
  }
  handleAdvancedOption(event) {
    console.log('event: ', event);
    console.log('this.systemUserSelected: ', this.systemUserSelected);
    console.log('this.connectType: ', this.connectType);
    const systemUserProtocol = this.systemUserSelected.protocol;
    const connectType = event ? event.id : this.connectType.id;
    this.AdvancedOption = [
      {
        type: 'checkbox',
        field: 'disableautohash',
        hidden: systemUserProtocol === 'mysql' && connectType === 'webCLI',
        label: 'Disable auto completion',
        value: false
      }
    ]
    this.isShowAdvancedOption = this.AdvancedOption.some(i => i.hidden);
    console.log('this.isShowAdvancedOption: ', this.isShowAdvancedOption);
  }
}
