/**
 * RDP页面
 *
 * @date     2017-11-24
 * @author   liuzheng <liuzheng712@gmail.com>
 */
import {AfterViewInit, Component, ElementRef, OnInit, ViewChild} from '@angular/core';
import {ActivatedRoute, Params} from '@angular/router';
import {DataStore} from '../../globals';

declare let Mstsc: any;

@Component({
  selector: 'app-element-rdp',
  templateUrl: './rdp.component.html',
  styleUrls: ['./rdp.component.scss']
})
export class ElementRdpComponent implements OnInit, AfterViewInit {
  @ViewChild('rdp') el: ElementRef;

  constructor(private activatedRoute: ActivatedRoute) {
    DataStore.NavShow = false;
  }

  ngOnInit() {
  }

  ngAfterViewInit() {

    let token: string;
    this.activatedRoute.params.subscribe((params: Params) => {
      token = params['token'];
    });

    const canvas = Mstsc.$(this.el.nativeElement);
    canvas.style.display = 'inline';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const client = Mstsc.client.create(Mstsc.$(this.el.nativeElement));
    client.connect(token, 'socket.io');
  }

}
