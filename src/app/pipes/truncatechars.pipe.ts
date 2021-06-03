import {Pipe, PipeTransform} from '@angular/core';


@Pipe({name: 'truncatechars'})
export class TruncatecharsPipe implements PipeTransform {
  transform(value: string, length: number): string {
    if (!value) {
      return value;
    }
    if (value.length < length) {
      return value;
    }
    return value.slice(0, length) + '..';
  }
}
