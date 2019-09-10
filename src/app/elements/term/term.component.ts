import {AfterViewInit, Component, Input, Output, OnInit, ViewChild, EventEmitter} from '@angular/core';
import {ElementRef} from '@angular/core';
import {Terminal} from 'xterm';
import {fit} from 'xterm/lib/addons/fit/fit';
import {LogService} from '@app/app.service';
import {Observable, fromEvent} from 'rxjs';
import {debounceTime, distinctUntilChanged } from 'rxjs/operators';
import * as $ from 'jquery/dist/jquery.min.js';
import 'rxjs/Observable';


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

  constructor(private _logger: LogService){

  }

  ngOnInit() {
    this.winSizeChange$ = fromEvent(window, 'resize').pipe(
      debounceTime(500),
      distinctUntilChanged(),
    );

    this.winSizeChange$
      .subscribe(() => {
          this.resizeTerm();
      });
  }

  ngAfterViewInit() {
    this.term.open(this.el.nativeElement);
    this.resizeTerm();
  }

  getWinSize() {
    let availableHeight = 0;
    let availableWidth = 0;
    if (document['fullscreenElement']) {
      availableWidth = document.body.clientWidth - 10;
      availableHeight = document.body.clientHeight;
    } else {
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
      availableHeight = activeEle.height() - elementPaddingVer;
      availableWidth = activeEle.width() - elementPaddingHor - (<any>this.term).viewport.scrollBarWidth;
    }

    const dimensions = (<any>this.term).renderer.dimensions;
    const geometry = [
      Math.floor(availableWidth / dimensions.actualCellWidth) - 1,
      Math.floor(availableHeight / dimensions.actualCellHeight) - 1
    ];

    if (!isFinite(geometry[0])) {
      geometry[0] = 80;
    }
    if (!isFinite(geometry[1])) {
      geometry[1] = 24;
    }
    return geometry;
  }

  resizeTerm() {
    const size = this.getWinSize();
    if (isNaN(size[0]) || isNaN(size[1])) {
      fit(this.term);
    } else {
      (<any>this.term).renderer.clear();
      this.term.resize(size[0], size[1]);
    }
    this.winSizeChangeTrigger.emit([this.term.cols, this.term.rows]);
  }

  active() {
    this.term.focus();
  }
}
