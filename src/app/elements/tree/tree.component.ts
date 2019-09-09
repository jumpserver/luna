import {Component, Input, OnInit} from '@angular/core';
import {HttpService} from '@app/app.service';

export interface Assets {
  name: string;
  id: string;
  type: string;
}

export interface Groups {
  id: string;
  key: string;
  name: string;
  value: string;
  parent: string;
  assets_granted: Array<Assets>;
}

export class TreeStruct {
  id: string;

  leafs: Array<TreeStruct>;

  static create(id, parent: string) {
    const tmp = new TreeStruct();
    tmp.id = id;
    tmp.leafs = [];
    return tmp;
  }

}


@Component({
  selector: 'elements-tree',
  templateUrl: './tree.component.html',
  styleUrls: ['./tree.component.scss']
})
export class ElementTreeComponent implements OnInit {
  @Input() TreeData: Array<TreeStruct>;

  constructor(private _http: HttpService) {


  }

  ngOnInit() {
  }

}
