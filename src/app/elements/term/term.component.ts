import {AfterViewInit, Component, Input, Output, OnInit, ViewChild, EventEmitter} from '@angular/core';
import {ElementRef} from '@angular/core';
import {Terminal} from 'xterm';
import {fit} from 'xterm/lib/addons/fit/fit';
import {Observable} from 'rxjs/Rx';
import 'rxjs/Observable';
import 'rxjs/add/operator/debounceTime';
import 'rxjs/add/operator/distinctUntilChanged';

import {NavList} from '../../pages/control/control/control.component';


@Component({
  selector: 'elements-term',
  templateUrl: './term.component.html',
  styleUrls: ['./term.component.css']
})
export class ElementTermComponent implements OnInit, AfterViewInit {
  @ViewChild('term') el: ElementRef;
  @Input() term: Terminal;
  @Output() winSizeChangeTrigger = new EventEmitter<Array<number>>();
  winSizeChange$: Observable<any>;

  constructor() {
  }

  ngOnInit() {
    this.winSizeChange$ = Observable.fromEvent(window, 'resize')
      .debounceTime(500)
      .distinctUntilChanged();

    this.winSizeChange$
      .subscribe(() => {
        if (NavList.List[NavList.Active].type === 'ssh') {
          this.resizeTerm();
        }
      });
  }

  ngAfterViewInit() {
    this.term.open(this.el.nativeElement);
    this.resizeTerm();
  }

  resizeTerm() {
    fit(this.term);
    // let contentElement = $('.window.active');
    // if (contentElement.length === 0) {
    //   contentElement = $('body');
    // }
    // const markerElement = $('#marker');
    // const col = Math.floor((contentElement.width() - 30) / markerElement.width() * 6) - 1;
    // const row = Math.floor((contentElement.height() - 30) / markerElement.height());
    // this.col = col > 80 ? col : 80;
    // this.row = row > 24 ? row : 24;
    // this.term.resize(this.col, this.row);
    this.winSizeChangeTrigger.emit([this.term.cols, this.term.rows]);
  }

  active() {
    this.term.focus();
  }
}
