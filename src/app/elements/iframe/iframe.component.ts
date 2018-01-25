import {Component, Input, OnInit} from '@angular/core';
import {DomSanitizer} from '@angular/platform-browser';
import {NavList} from '../../ControlPage/control/control.component';

@Component({
  selector: 'app-element-iframe',
  templateUrl: './iframe.component.html',
  styleUrls: ['./iframe.component.scss']
})
export class ElementIframeComponent implements OnInit {
  @Input() host: any;
  @Input() userid: any;
  @Input() index: number;
  target: string;

  constructor(private sanitizer: DomSanitizer) {
  }

  ngOnInit() {
    this.target = document.location.origin +
      '/api/tokens?username=liu&password=zheng&asset_id=' +
      this.host.id + '&system_user_id=' + this.userid;
  }

  trust(url) {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  Disconnect() {
    NavList.List[this.index].connected = false;
  }
}
