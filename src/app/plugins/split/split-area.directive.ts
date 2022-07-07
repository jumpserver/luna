import {Directive, Optional, Self} from '@angular/core';
import {DefaultFlexDirective} from '@angular/flex-layout';

@Directive({
  selector: '[ngxSplitArea]',
  // tslint:disable-next-line:use-host-property-decorator
  host: {
    style: 'overflow: auto;'
  }
})
export class SplitAreaDirective {
  constructor(@Optional() @Self() public flex: DefaultFlexDirective) {}
}
