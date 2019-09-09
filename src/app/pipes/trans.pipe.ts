import {Pipe, PipeTransform} from '@angular/core';
import {translate} from '../globals';

@Pipe({
  name: 'trans'
})
export class TransPipe implements PipeTransform {

  transform(value: any, args?: any): any {
    return translate(value);
  }
}
