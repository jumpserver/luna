import {Component, Inject, OnInit} from '@angular/core';
import {MatDialogRef} from '@angular/material';
import {SettingService} from '@app/services';
import {GlobalSetting, Setting} from '@app/model';
import {I18nService} from '@app/services/i18n';
import {MAT_DIALOG_DATA} from '@angular/material/dialog';


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
  type = 'general';

  constructor(public dialogRef: MatDialogRef<ElementSettingComponent>,
              private _i18n: I18nService,
              @Inject(MAT_DIALOG_DATA) public data: any,
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
    this.type = this.data.type;
    if (!this.setting.backspaceAsCtrlH) {
      this.setting.backspaceAsCtrlH = '0';
    }
  }

  onSubmit() {
    this.settingSrv.save();
    this.dialogRef.close();
  }

  onNoClick(): void {
    this.dialogRef.close();
  }
}
