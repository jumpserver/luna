import {Component, ElementRef, Input, OnInit, ViewChild} from '@angular/core';
import {DomSanitizer} from '@angular/platform-browser';

@Component({
  standalone: false,
  selector: 'pages-sftp',
  templateUrl: 'sftp.component.html',
  styleUrls: ['sftp.component.scss']
})
export class PageSftpComponent implements OnInit {
  @Input() host: any;
  iframeURL: any;
  @ViewChild('sftp', {static: false}) el: ElementRef;

  constructor(private sanitizer: DomSanitizer) {
  }

  ngOnInit() {
    this.iframeURL = '/koko/elfinder/sftp/';
  }
}
