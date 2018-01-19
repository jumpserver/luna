import {Component, Input, OnInit} from '@angular/core';
import {DomSanitizer} from '@angular/platform-browser';
import {NavList} from '../../ControlPage/control/control.component';

@Component({
  selector: 'app-element-guacamole',
  templateUrl: './guacamole.component.html',
  styleUrls: ['./guacamole.component.scss']
})
export class ElementGuacamoleComponent implements OnInit {
  @Input() host: any;
  @Input() userid: any;
  @Input() index: number;
  target: string;

  constructor(private sanitizer: DomSanitizer) {
  }

  ngOnInit() {
    // this.target = '/guacamole/?asset_id=' + '&system_user_id=' + '';
    this.target = 'https://www.baidu.com';
  }

  trust(url) {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  Disconnect() {
    NavList.List[this.index].connected = false;
  }
}
