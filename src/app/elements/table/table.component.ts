import {Component, Input, OnInit, ViewChild} from '@angular/core';
import {DatatableComponent} from '@swimlane/ngx-datatable';

export let Config: {
  search: boolean,
  scrollbarV: boolean,
  scrollbarH: boolean,
  rowHeight: number,
  footerHeight: number,
  headerHeight: number,
  limit: number,
  columnMode: string,
} = {
  search: false,
  scrollbarV: false,
  scrollbarH: false,
  rowHeight: 50,
  footerHeight: 0,
  headerHeight: 50,
  limit: 10,
  columnMode: 'force',
};

@Component({
  selector: 'app-element-table',
  templateUrl: './table.component.html',
  styleUrls: ['./table.component.scss']
})
export class ElementTableComponent implements OnInit {
  @Input() rows: Array<any>;
  @Input() columns: Array<any>;
  @Input() config: any;
  temp = [];
  @ViewChild(DatatableComponent) table: DatatableComponent;


  constructor() {

  }

  ngOnInit() {
    Config = this.config;
  }

  updateFilter(event) {
    const val = event.target.value.toLowerCase();

    // filter our data
    const temp = this.temp.filter(function (d) {
      return d.name.toLowerCase().indexOf(val) !== -1 || !val;
    });

    // update the rows
    this.rows = temp;
    // Whenever the filter changes, always go back to the first page
    this.table.offset = 0;
  }

}
