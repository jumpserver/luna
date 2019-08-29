import {Component, OnChanges, Input, Pipe, PipeTransform} from '@angular/core';
import {AppService, HttpService, LogService} from '../../app.service';

@Component({
  selector: 'elements-tree-filter',
  templateUrl: './tree-filter.component.html',
  styleUrls: ['./tree-filter.component.css']
})
export class ElementTreeFilterComponent implements OnChanges {
  q: string;
  @Input() input;
  searchRequest: any;

  constructor(private _appService: AppService,
              private _http: HttpService,
              private _logger: LogService) {
    this._logger.log('LeftbarComponent.ts:SearchBar');
  }

  ngOnChanges(changes) {
    this.q = changes.input.currentValue;
  }

  modelChange($event) {
    this.Search(this.q);
  }

  public Search(q) {
    if (this.searchRequest) {
      this.searchRequest.unsubscribe();
    }
    this.searchRequest = this._http.search(q)
      .subscribe(
        data => {
          this._logger.log(data);
        },
        err => {
          this._logger.error(err);
        },
        () => {
        }
      );
    this._logger.log(q);
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
