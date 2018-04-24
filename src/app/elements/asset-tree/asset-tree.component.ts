import {Component, OnInit} from '@angular/core';
import {HttpService} from '../../app.service';
import * as jQuery from 'jquery/dist/jquery.min.js';

@Component({
  selector: 'elements-asset-tree',
  templateUrl: './asset-tree.component.html',
  styleUrls: ['./asset-tree.component.scss']
})
export class ElementAssetTreeComponent implements OnInit {

  constructor(private _http: HttpService) {


  }

  ngOnInit() {
  }

}
