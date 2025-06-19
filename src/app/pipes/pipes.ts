import {UtcDatePipe} from './date.pipe';
import {TruncatecharsPipe} from './truncatechars.pipe';
import {SearchFilter} from './search.pipe';
import {SafeUrl} from './urlsafe';
import {NgModule} from '@angular/core';

@NgModule({
  declarations: [SafeUrl, UtcDatePipe, TruncatecharsPipe, SearchFilter],
  exports: [SafeUrl, UtcDatePipe, TruncatecharsPipe, SearchFilter]
})
export class SharedPipeModule {
}
