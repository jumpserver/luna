import {Component, OnInit} from '@angular/core';
import {DomSanitizer} from '@angular/platform-browser';


@Component({
  selector: 'elements-iframe',
  templateUrl: './iframe.component.html',
  styleUrls: ['./iframe.component.scss']
})
export class ElementIframeComponent implements OnInit {
  target: string;

  constructor(private sanitizer: DomSanitizer) {
  }

  ngOnInit() {
  }

  trust(url) {
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }
}
