import {Component, OnInit, Output, Pipe, PipeTransform, EventEmitter} from '@angular/core';
import {FormControl} from '@angular/forms';
import {debounceTime, distinctUntilChanged} from 'rxjs/operators';

import {LogService, TreeFilterService} from '../../app.service';

@Component({
  selector: 'elements-tree-filter',
  templateUrl: './tree-filter.component.html',
  styleUrls: ['./tree-filter.component.css'],
})
export class ElementTreeFilterComponent implements OnInit {
  private searchControl: FormControl;
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


@Pipe({name: 'SearchFilter'})
export class SearchFilter implements PipeTransform {
  transform(value: any, input: string) {
    if (input) {
      input = input.toLowerCase();
      return value.filter(function (el: any) {
        // ToDo: search with a simple SQL like language, and a bug search a group's hosts
        return JSON.stringify(el).toLowerCase().indexOf(input) > -1;
      });
    }
    return value;
  }
}
