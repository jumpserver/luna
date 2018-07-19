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
  @Input() offset: Array<number>;
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
        if (NavList.List[NavList.Active].type !== 'rdp') {
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
    const elementStyle = window.getComputedStyle(this.term.element);
    const elementPadding = {
        top: parseInt(elementStyle.getPropertyValue('padding-top'), 10),
        bottom: parseInt(elementStyle.getPropertyValue('padding-bottom'), 10),
        right: parseInt(elementStyle.getPropertyValue('padding-right'), 10),
        left: parseInt(elementStyle.getPropertyValue('padding-left'), 10)
    };
    const elementPaddingVer = elementPadding.top + elementPadding.bottom;
    const elementPaddingHor = elementPadding.right + elementPadding.left;
    const availableHeight = activeEle.height() - elementPaddingVer;
    const availableWidth = activeEle.width() - elementPaddingHor - (<any>this.term)._core.viewport.scrollBarWidth;
    const geometry = [
      Math.floor(availableWidth / (<any>this.term)._core.renderer.dimensions.actualCellWidth) - 1,
      Math.floor(availableHeight / (<any>this.term)._core.renderer.dimensions.actualCellHeight) - 1
    ];
    return geometry;
  }

  resizeTerm() {
    const size = this.getWinSize();
    if (isNaN(size[0]) || isNaN(size[1])) {
      fit(this.term);
    } else {
      (<any>this.term)._core.renderer.clear();
      this.term.resize(size[0], size[1]);
    }
    this.winSizeChangeTrigger.emit([this.term.cols, this.term.rows]);
  }

  active() {
    this.term.focus();
  }
}
