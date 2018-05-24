import {AfterViewInit, Component, Input, Output, OnInit, ViewChild, EventEmitter} from '@angular/core';
import {ElementRef} from '@angular/core';
import {Terminal} from 'xterm';
import {fit} from 'xterm/lib/addons/fit/fit';
import {Observable} from 'rxjs/Rx';
import {CookieService} from 'ngx-cookie-service';
import * as $ from 'jquery/dist/jquery.min.js';
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

  constructor(private _cookie: CookieService) {
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

  getWinSize() {
    const activeEle = $('#winContainer');
    const markerEle = $('#marker');
    const cols = Math.floor(activeEle.width() / markerEle.width() * 6) - 6;
    const rows = Math.floor(activeEle.height() / markerEle.height()) - 1;
    return [cols, rows];
  }

  resizeTerm() {
    // fit(this.term);
    const size = this.getWinSize();
    if (isNaN(size[0])) {
      fit(this.term);
    } else {
      this.term.resize(size[0], size[1]);
      this.winSizeChangeTrigger.emit([this.term.cols, this.term.rows]);
    }
    this._cookie.set('cols', this.term.cols.toString(), 0, '/', document.domain);
    this._cookie.set('rows', this.term.rows.toString(), 0, '/', document.domain);
  }

  active() {
    this.term.focus();
  }
}
