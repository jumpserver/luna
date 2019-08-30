import {Injectable, EventEmitter} from '@angular/core';

@Injectable()
export class TreeFilterService {
  onFilter: EventEmitter<string> = new EventEmitter<string>();

  filter(q: string) {
    if (q) {
      console.log('Emit key to filter...: ', q);
      this.onFilter.emit(q);
    }
  }
}
