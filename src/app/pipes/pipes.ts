import {TransPipe} from './trans.pipe';
import {UtcDatePipe} from './date.pipe';
import {TruncatecharsPipe} from './truncatechars.pipe';
import {SearchFilter} from './search.pipe';

export const Pipes = [
  UtcDatePipe,
  TransPipe,
  TruncatecharsPipe,
  SearchFilter
];
