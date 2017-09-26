import {Component, OnInit} from '@angular/core';
import {Logger} from 'angular2-logger/core';

declare let jQuery: any;

import {AppService, DataStore} from '../app.service';


//noinspection TypeScriptValidateTypes
@Component({
  selector: 'term-body',
  templateUrl: './terminal.html',
  styleUrls: ['./terminal.css']
  // directives: [NgClass]
})


export class Terminal implements OnInit {
  DataStore = DataStore;
  // portocol:string;
  endpoint: string;

  constructor(private _appService: AppService,
              private _logger: Logger) {
    this._logger.log('TermComponent.ts:TermComponent');
  }

  ngOnInit() {
    //DataStore.term[0]["term"].open(document.getElementById("term-0"))
    this.timer();
  }

  ngAfterViewInit() {
    // this._appService.TerminalConnect({});
    //this._logger.debug("term width ", jQuery("#term").width());
    //this._logger.debug("term height", jQuery("#term").height());
  }

  timer() {
    if (DataStore.termlist.length > 0) {
      for (let i in DataStore.termlist) {
        this._appService.TerminalConnect(DataStore.termlist[i]);
      }
      DataStore.termlist = []
    }
    jQuery(window).trigger('resize');
    setTimeout(() => {
      this.timer()
    }, 0)
  }

  close(i) {
    this._logger.debug(i);
    AppService.TerminalDisconnect(i);
    DataStore.term[i].hide = true;
    DataStore.term[i].closed = true;
    DataStore.term[i].term.destroy();
    DataStore.term.splice(i, 1);
    Terminal.checkActive(i);
  }

  static checkActive(index) {
    let len = DataStore.term.length;
    if (len == 2) {
      // 唯一一个
      DataStore.termActive = 0;
    } else {
      if (len - 1 == index) {
        // 删了最后一个
        DataStore.termActive = index - 1;
      } else {
        DataStore.termActive = index;
      }
      for (let m in DataStore.term) {
        DataStore.term[m].hide = true;
      }
      DataStore.term[DataStore.termActive].hide = false;
    }
  }

  setActive(index) {
    for (let m in DataStore.term) {
      DataStore.term[m].hide = true;
    }
    DataStore.term[index].hide = false;
    DataStore.termActive = index;
  }

  dblclick() {
    console.log(DataStore.term)
  }
}
