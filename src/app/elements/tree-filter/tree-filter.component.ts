import {Component, OnInit} from '@angular/core';
import {FormControl} from '@angular/forms';
import {debounceTime, distinctUntilChanged} from 'rxjs/operators';

import {LogService, TreeFilterService} from '@app/services';


@Component({
  selector: 'elements-tree-filter',
  templateUrl: './tree-filter.component.html',
  styleUrls: ['./tree-filter.component.css'],
})
export class ElementTreeFilterComponent implements OnInit {
  searchControl: FormControl;
  private debounce = 400;

  constructor(private _treeFilterService: TreeFilterService,
              private _logger: LogService) {
  }

  ngOnInit(): void {
    this.searchControl = new FormControl('');
    this.searchControl.valueChanges
      .pipe(debounceTime(this.debounce), distinctUntilChanged())
      .subscribe(query => {
        this._logger.debug('Tree filter: ', query);
        this._treeFilterService.filter(query);
      });
  }
}


