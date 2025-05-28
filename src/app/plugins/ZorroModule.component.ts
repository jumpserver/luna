import {NgModule} from '@angular/core';
import {NzButtonModule} from 'ng-zorro-antd/button';
import {NzModalModule} from 'ng-zorro-antd/modal';
import {NzIconModule} from 'ng-zorro-antd/icon';
import {NzInputModule} from 'ng-zorro-antd/input';
import {NzSelectModule} from 'ng-zorro-antd/select';
import {NzFormModule} from 'ng-zorro-antd/form';
import {NzAlertModule} from 'ng-zorro-antd/alert';
import {NzCheckboxModule} from 'ng-zorro-antd/checkbox';
import {NzCardModule} from 'ng-zorro-antd/card';
import {NzSwitchModule} from 'ng-zorro-antd/switch';
import {NzDropDownModule} from 'ng-zorro-antd/dropdown';


@NgModule({
  exports: [
    NzButtonModule,
    NzModalModule,
    NzIconModule,
    NzInputModule,
    NzSelectModule,
    NzFormModule,
    NzAlertModule,
    NzCardModule,
    NzSwitchModule,
    NzDropDownModule,
    NzCheckboxModule
  ]
})
export class NgZorroAntdModule {

}
