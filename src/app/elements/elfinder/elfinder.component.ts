import {Component, OnInit} from '@angular/core';
import * as elfinder from 'elfinder/js/elfinder.min.js';

@Component({
  selector: 'app-element-elfinder',
  templateUrl: './elfinder.component.html',
  styleUrls: ['./elfinder.component.scss']
})
export class ElementElfinderComponent implements OnInit {

  constructor() {
  }

  ngOnInit() {
    elfinder(document.getElementById('elfinder'), {});
  }

}
