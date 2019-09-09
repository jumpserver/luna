import {Component, OnInit, Input} from '@angular/core';
import {View} from '@app/model';

@Component({
  selector: 'elements-content-window',
  templateUrl: './content-window.component.html',
  styleUrls: ['./content-window.component.css']
})
export class ElementContentViewComponent implements OnInit {
  @Input() view: View;

  static active() {
    // viewList.List.forEach((v, k) => {
    //   v.hide = id.toString() !== k;
    // });
    // viewList.Active = id;
  }

  static TerminalDisconnect(id) {
    // if (viewList.List[id].connected) {
    //   viewList.List[id].connected = false;
    //   viewList.List[id].Term.write('\r\n\x1b[31mBye Bye!\x1b[m\r\n');
    //   TermWS.emit('logout', viewList.List[id].room);
    // }
  }

  static RdpDisconnect(id) {
    // viewList.List[id].connected = false;
  }

  static DisconnectAll() {
    // for (let i = 0; i < viewList.List.length; i++) {
    //   Todo:
      // ContentComponent.TerminalDisconnect(i);
    // }
  }

  constructor() {
  }

  ngOnInit() {
  }

  // trackByFn(index: number, item: View) {
  //   return item.id;
  // }
}
