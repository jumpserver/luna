/**
 * RDP页面
 *
 * @date     2017-11-24
 * @author   liuzheng <liuzheng712@gmail.com>
 */
import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Params} from '@angular/router';
import {DataStore} from "../app.service";

declare let Mstsc: any;

@Component({
  selector: 'app-rdppage',
  templateUrl: './rdppage.component.html',
  styleUrls: ['./rdppage.component.css']
})
export class RdppageComponent implements OnInit {

  constructor(private activatedRoute: ActivatedRoute) {
    DataStore.NavShow = false;
  }

  ngOnInit() {
    let token: string;
    this.activatedRoute.params.subscribe((params: Params) => {
      token = params['token'];
    });

    let canvas = Mstsc.$("canvas");
    canvas.style.display = 'inline';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    let client = Mstsc.client.create(Mstsc.$("canvas"));
    client.connect(token, "socket.io");
  }

}
