import {Pipe, PipeTransform} from '@angular/core';


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
