import {AfterViewInit, Component, Input, OnInit, ViewChild} from '@angular/core';
import {ElementRef} from '@angular/core';
import {term, Terminal, TermWS} from '../../globals';
import {NavList} from '../../pages/control/control/control.component';
import * as jQuery from 'jquery/dist/jquery.min.js';
import {UUIDService} from '../../app.service';
import {CookieService} from 'ngx-cookie-service';

@Component({
  selector: 'elements-term',
  templateUrl: './term.component.html',
  styleUrls: ['./term.component.css']
})
export class ElementTermComponent implements OnInit, AfterViewInit {
  @Input() host: any;
  @Input() userid: any;
  @Input() index: number;
  @Input() token: string;
  @Input() monitor: string;

  @ViewChild('term') el: ElementRef;
  secret: string;
  term: any;

  constructor(private _uuid: UUIDService,
              private _cookie: CookieService) {
  }

  ngOnInit() {
    this.secret = this._uuid.gen();
    this.term = Terminal({
      cols: 80,
      rows: 24,
      useStyle: true,
      screenKeys: true,
    });
    // NavList.List[this.index].room = this.room;
  }

  ngAfterViewInit() {
    if (this.host || this.token) {
      if (this._cookie.get('cols')) {
        term.col = parseInt(this._cookie.get('cols'), 10);
      }
      if (this._cookie.get('rows')) {
        term.row = parseInt(this._cookie.get('rows'), 10);
      }
    } else {
      term.col = Math.floor(jQuery(this.el.nativeElement).width() / jQuery('#marker').width() * 6) - 3;
      term.row = Math.floor(jQuery(this.el.nativeElement).height() / jQuery('#marker').height()) - 3;
      term.term = this.term;
    }
    this.term.open(this.el.nativeElement, true);
    const that = this;
    window.onresize = function () {
      term.col = Math.floor(jQuery(that.el.nativeElement).width() / jQuery('#marker').width() * 6) - 3;
      term.row = Math.floor(jQuery(that.el.nativeElement).height() / jQuery('#marker').height());
      if (term.col < 80) {
        term.col = 80;
      }
      if (term.row < 24) {
        term.row = 24;
      }
      that.term.resize(term.col, term.row);
      if (that.host) {
        that._cookie.set('cols', term.col.toString(), 99, '/', document.domain);
        that._cookie.set('rows', term.row.toString(), 99, '/', document.domain);
        TermWS.emit('resize', {'cols': term.col, 'rows': term.row});
      }
    };
    jQuery(window).resize();

    NavList.List[this.index].Term = this.term;
    if (this.host) {
      TermWS.emit('host', {'uuid': this.host.id, 'userid': this.userid, 'secret': this.secret});
    }
    if (this.token) {
      TermWS.emit('token', {'token': this.token, 'secret': this.secret});
    }
    if (this.monitor) {
      TermWS.emit('monitor', {'token': this.monitor, 'secret': this.secret});
    } else {
      this.term.on('data', function (data) {
        TermWS.emit('data', {'data': data, 'room': NavList.List[that.index].room});
      });
    }


    TermWS.on('data', function (data) {
      if (data['room'] === NavList.List[that.index].room) {
        that.term.write(data['data']);
      }
    });

    TermWS.on('disconnect', function () {
      that.TerminalDisconnect();
    });
    TermWS.on('logout', function (data) {
      if (data['room'] === NavList.List[that.index].room) {
        NavList.List[this.index].connected = false;
        // this.term.write('\r\n\x1b[31mBye Bye!\x1b[m\r\n');
      }
    });
    TermWS.on('room', function (data) {
      if (data['secret'] === that.secret) {
        NavList.List[that.index].room = data['room'];
      }
    });
  }

  TerminalDisconnect() {
    NavList.List[this.index].connected = false;
    // this.term.write('\r\n\x1b[31mBye Bye!\x1b[m\r\n');
    TermWS.emit('logout', NavList.List[this.index].room);
  }
}
