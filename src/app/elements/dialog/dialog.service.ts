import {Injectable} from '@angular/core';
import * as layer from 'layui-layer/src/layer.js';

@Injectable()
export class DialogService {

  constructor() {
  }

  open(options: any) {
    layer.open(options);
  }

  dialog() {
  }

  confirm() {

  }

  tip() {
  }

  loading() {
  }

  alert() {
    // alert('sss');
  }

  close(index: any) {
    layer.close(index);
  }
}
