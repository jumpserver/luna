import {Component, OnInit} from '@angular/core';
import { MatDialogRef} from '@angular/material';
import {SettingService} from '@app/services';
import {GlobalSetting, Setting} from '@app/model';


@Component({
  selector: 'elements-setting',
  templateUrl: './setting.component.html',
  styles: ['.mat-form-field { width: 100%;}']
})
export class ElementSettingComponent implements OnInit {
  resolutionsChoices = ['Auto', '1024x768', '1366x768', '1600x900', '1920x1080'];
  boolChoices = [{name: 'Yes', value: '1'}, {name: 'No', value: '0'}];
  clientChoices = [{name: 'Koko Cli', value: '0'}, {name: 'OmniDB', value: '1'}];
  setting: Setting;
  globalSetting: GlobalSetting;

  constructor(public dialogRef: MatDialogRef<ElementSettingComponent>,
              private settingSrv: SettingService) {
  }

  ngOnInit() {
    this.setting = this.settingSrv.setting;
    this.globalSetting = this.settingSrv.globalSetting;
  }

  onSubmit() {
    this.settingSrv.save();
    this.dialogRef.close();
  }

  onNoClick(): void {
    this.dialogRef.close();
  }
}
