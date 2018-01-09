import {AfterViewInit, Component, OnInit, ViewChild} from '@angular/core';
import {ElementRef, Renderer2} from '@angular/core';
import {term} from '../../globals';
import {Terminal} from '../../globals';

@Component({
  selector: 'app-element-term',
  templateUrl: './term.component.html',
  styleUrls: ['./term.component.css']
})
export class ElementTermComponent implements OnInit, AfterViewInit {

  @ViewChild('term') el: ElementRef;

  constructor(private rd: Renderer2) {
  }

  ngOnInit() {

  }

  ngAfterViewInit() {
    // term.col = Math.floor(jQuery(this.el.nativeElement).width() / jQuery('#liuzheng').width() * 8) - 3;
    // term.row = Math.floor(jQuery(this.el.nativeElement).height() / jQuery('#liuzheng').height()) - 5;
    term.col = 90;
    term.row = 90;
    term.term = Terminal({
      cols: term.col,
      rows: term.row,
      useStyle: true,
      screenKeys: true,
    });
    term.term.open(this.el.nativeElement, true);
    // const that = this;
    // window.onresize = function () {
    //   term.col = Math.floor(jQuery(that.el.nativeElement).width() / jQuery('#liuzheng').width() * 8) - 3;
    //   term.row = Math.floor(jQuery(that.el.nativeElement).height() / jQuery('#liuzheng').height()) - 5;
    //
    //   if (term.col < 80) {
    //     term.col = 80;
    //   }
    //   if (term.row < 24) {
    //     term.row = 24;
    //   }
    //   term.term.resize(term.col, term.row);
    // };
  }

}
