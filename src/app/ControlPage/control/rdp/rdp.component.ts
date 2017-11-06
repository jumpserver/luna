import {Component, OnInit} from '@angular/core';
import {NavList, View, Rdp} from '../control.component';

@Component({
  selector: 'app-rdp',
  templateUrl: './rdp.component.html',
  styleUrls: ['./rdp.component.css']
})
export class RdpComponent implements OnInit {
  NavList = NavList;

  constructor() {
  }

  ngOnInit() {
  }

  Connect() {
    let id = NavList.List.length - 1;
    NavList.List[id].nick = 'localhost';
    NavList.List[id].connected = true;
    NavList.List[id].edit = false;
    NavList.List[id].closed = false;
    NavList.List[id].type = "rdp";
    NavList.List[id].Rdp = new Rdp;
    NavList.List[id].Rdp.token = "xxx";
    NavList.List[id].Rdp.machine = "xxx"


  }

}
