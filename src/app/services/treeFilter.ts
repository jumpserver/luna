import {EventEmitter, Injectable} from '@angular/core';

@Injectable()
export class TreeFilterService {
  onFilter: EventEmitter<string> = new EventEmitter<string>();

  filter(q: string) {
    this.onFilter.emit(q);
  }
}
