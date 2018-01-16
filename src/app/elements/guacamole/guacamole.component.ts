import {Component, Input, OnInit} from '@angular/core';

@Component({
  selector: 'app-element-guacamole',
  templateUrl: './guacamole.component.html',
  styleUrls: ['./guacamole.component.scss']
})
export class ElementGuacamoleComponent implements OnInit {
  @Input() target: string;

  constructor() {
  }

  ngOnInit() {
    this.target = '/guacamole/?asset_id=' + '&system_user_id=' + '';
  }

}
