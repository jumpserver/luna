import {Component, OnInit} from '@angular/core';
import {HttpService} from '../../app.service';

@Component({
  selector: 'elements-asset-tree',
  templateUrl: './asset-tree.component.html',
  styleUrls: ['./asset-tree.component.scss']
})
export class ElementAssetTreeComponent implements OnInit {

  nodes1: any[] = [
    {
      label: 'Node1', model: {type: 'Array', count: 1}
    },
    {
      label: 'Node2',
      expandable: true,
      model: {type: 'Object'},
      children: [
        {
          label: 'Node1', model: {type: 'Array', count: 1}
        }
      ]
    },
    {
      label: 'Node3', model: {type: 'Array', count: 1}
    }
  ];

  constructor(private _http: HttpService) {


  }

  ngOnInit() {
  }

}
