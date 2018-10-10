import {Component, OnInit, Input, ElementRef, ViewChild} from '@angular/core';
import {DataStore} from '../../globals';
import {DomSanitizer} from '@angular/platform-browser';

@Component({
  selector: 'app-sftp',
  templateUrl: './sftp.component.html',
  styleUrls: ['./sftp.component.scss']
})
export class SftpComponent implements OnInit {
  @Input() host: any;
  target: any;
  @ViewChild('sftp') el: ElementRef;

  constructor(private sanitizer: DomSanitizer) {
    if (!this.host) {
      DataStore.NavShow = false;
    }
  }

  ngOnInit() {
    let _target = '/coco/elfinder/sftp/';
    if (this.host) {
      // _target += 'f5857eee-c114-4564-af8f-96329c400a8a' + '/';
      _target += this.host.id + '/';
    }
    this.trust(_target);
  }

  trust(url) {
    this.target = this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }
}
