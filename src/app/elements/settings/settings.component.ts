import {Component, Input, OnInit} from '@angular/core';

@Component({
  selector: 'app-element-settings',
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class ElementSettingsComponent implements OnInit {
  @Input() index: number;

  constructor() {
  }

  ngOnInit() {
  }

}
