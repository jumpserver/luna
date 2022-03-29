import {Component, ElementRef, Input, OnInit, ViewChild} from '@angular/core';
import {TreeNode} from '@app/model';

@Component({
  selector: 'elements-advanced-option',
  templateUrl: './advanced-option.component.html',
  styleUrls: ['./advanced-option.component.scss'],
})
export class ElementAdvancedOptionComponent implements  OnInit {
  @Input() node: TreeNode;
  @Input() AdvancedOption: any[];
  @ViewChild('checkbox', {static: false}) checkboxRef: ElementRef;
  checkboxStatus = false;

  systemUserManualAuthInit = false;

  constructor() {}

  ngOnInit() {
    this.checkboxStatus = this.AdvancedOption[0].value
  }
  onCheckboxChange(event) {
    this.checkboxStatus = event;
  }
}
