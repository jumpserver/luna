import {Component, OnInit} from '@angular/core';
import {version} from '../../../environments/environment';
import {DataStore} from '../../globals';

@Component({
  selector: 'elements-ofooter',
  templateUrl: './ofooter.component.html',
  styleUrls: ['./ofooter.component.scss']
})
export class ElementOfooterComponent implements OnInit {
  version = version;

  constructor() {
    DataStore.NavShow = false;
  }

  ngOnInit() {
  }

}
