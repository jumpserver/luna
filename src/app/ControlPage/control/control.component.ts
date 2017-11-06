import {Component, OnInit} from '@angular/core';

export class Term {
  nick: string;
  edit: boolean;
  machine: string;
  connected: boolean;
  closed: boolean;
  socket: any;
  term: any;
  hide: boolean;
}

export let NavList: {
  term: Array<Term>;
  termlist: Array<string>;
  termActive: number;
} = {
  term: [new Term()],
  termlist: [],
  termActive: 0,
};

@Component({
  selector: 'app-control',
  templateUrl: './control.component.html',
  styleUrls: ['./control.component.css']
})
export class ControlComponent implements OnInit {

  constructor() {
  }

  ngOnInit() {
  }

}
