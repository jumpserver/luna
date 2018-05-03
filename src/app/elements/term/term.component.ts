import {AfterViewInit, Component, Input, Output, OnInit, ViewChild, EventEmitter} from '@angular/core';
import {ElementRef} from '@angular/core';
import * as Terminal from 'xterm/dist/xterm';
// import { Terminal } from 'xterm';
import * as $ from 'jquery/dist/jquery.min.js';
import {Observable} from 'rxjs/Rx';
import 'rxjs/Observable';
import 'rxjs/add/operator/debounceTime';
import 'rxjs/add/operator/distinctUntilChanged';

@Component({
  selector: 'elements-term',
  templateUrl: './term.component.html',
  styleUrls: ['./term.component.css']
})
export class ElementTermComponent implements OnInit, AfterViewInit {
  @ViewChild('term') el: ElementRef;
  @Input() term: Terminal;
  @Output() winSizeChangeTrigger = new EventEmitter<Array<number>>();
  col = 80;
  row = 24;
  winSizeChange$: Observable<any>;

  constructor() {
  }

  ngOnInit() {
    this.winSizeChange$ = Observable.fromEvent(window, 'resize')
      .debounceTime(500)
      .distinctUntilChanged();

    this.winSizeChange$
      .subscribe(() => this.resizeTerm());
  }

  ngAfterViewInit() {
    this.term.open(this.el.nativeElement, true);
    this.resizeTerm();
  }

  resizeTerm() {
    let contentElement = $('.window.active');
    if (contentElement.length === 0) {
      contentElement = $('body');
    }
    const markerElement = $('#marker');
    const col = Math.floor(contentElement.width() / markerElement.width() * 6) - 8;
    const row = Math.floor(contentElement.height() / markerElement.height()) - 2;
    this.col = col > 80 ? col : 80;
    this.row = row > 24 ? row : 24;
    console.log('Box size: ', contentElement.width(), '*', contentElement.height());
    console.log('Mark size: ', markerElement.width(), '*', markerElement.height());
    console.log('Resize term size: ', this.col, this.row);
    this.term.resize(this.col, this.row);
    this.winSizeChangeTrigger.emit([this.col, this.row]);
  }

  active() {
    this.term.focus();
  }
}
