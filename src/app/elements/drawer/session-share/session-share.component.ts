import { Component, OnDestroy, OnInit } from '@angular/core';

@Component({
  standalone: false,
  selector: 'elements-session-share',
  templateUrl: 'session-share.component.html',
  styleUrls: ['session-share.component.scss']
})
export class ElementSessionShareComponent implements OnInit, OnDestroy {
  ngOnInit(): void {
    console.log('SessionShare init');
  }
  ngOnDestroy(): void {
    console.log('FileManager destroy');
  }
}
