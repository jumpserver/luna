import {Component, OnInit} from '@angular/core';
import {MatDialogRef} from '@angular/material';
import {SettingService} from '@app/services';
import {GlobalSetting, Setting} from '@app/model';
import {I18nService} from '@app/services/i18n';


@Component({
  selector: 'elements-setting',
  templateUrl: './setting.component.html',
  styleUrls: ['./setting.component.css']
})
export class ElementSettingComponent implements OnInit {
  resolutionsChoices = ['Auto', '1024x768', '1366x768', '1600x900', '1920x1080'];
  public boolChoices: any[];
  setting: Setting;
  globalSetting: GlobalSetting;

  constructor(public dialogRef: MatDialogRef<ElementSettingComponent>,
              private _i18n: I18nService,
              private settingSrv: SettingService) {
    this.boolChoices = [
      {name: _i18n.instant('Yes'), value: '1'},
      {name: _i18n.instant('No'), value: '0'}
    ];
  }

  hasLicense() {
    return this.settingSrv.globalSetting.XPACK_LICENSE_IS_VALID;
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
