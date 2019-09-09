import {Component, Input, OnInit, ViewChild} from '@angular/core';
import {DatatableComponent} from '@swimlane/ngx-datatable';
import {MatPaginator} from '@angular/material';
import {LogService} from '@app/app.service';

export let Config: {
  search: boolean,
  scrollbarV: boolean,
  scrollbarH: boolean,
  rowHeight: number,
  footerHeight: number,
  headerHeight: number,
  limit: number,
  columnMode: string,
  pageSize: number,
  pageSizeOptions: Array<number>,
} = {
  search: false,
  scrollbarV: false,
  scrollbarH: false,
  rowHeight: 50,
  footerHeight: 50,
  headerHeight: 50,
  limit: 10,
  columnMode: 'force',
  pageSize: 10,
  pageSizeOptions: [5, 10, 20],
};

@Component({
  selector: 'elements-table',
  templateUrl: './table.component.html',
  styleUrls: ['./table.component.scss']
})
export class ElementTableComponent implements OnInit {
  @Input() rows: Array<any>;
  @Input() columns: Array<any>;
  @Input() config: any;
  temp = [];
  @ViewChild(DatatableComponent) table: DatatableComponent;
  @ViewChild(MatPaginator) paginator: MatPaginator;

  constructor(private _logger: LogService) {

  }

  ngOnInit() {
    Config = this.config;
    this.paginator.length = this.rows.length;
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

  test() {
    console.log(this.paginator._pageIndex);
    console.log(this.paginator._pageIndex * this.paginator.pageSize + 1);
    this.table.limit = this.paginator.pageSize;
  }

}
