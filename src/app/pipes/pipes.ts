import {TransPipe} from './trans.pipe';
import {UtcDatePipe} from './date.pipe';
import {TruncatecharsPipe} from './truncatechars.pipe';
import {SearchFilter} from '@app/elements/tree-filter/tree-filter.component';

export const Pipes = [
  UtcDatePipe,
  TransPipe,
  TruncatecharsPipe,
  SearchFilter
];
