import {Component, Inject, OnInit} from '@angular/core';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material';
import {SettingService} from '@app/services';
import {Setting} from '@app/model';


@Component({
  selector: 'elements-setting',
  templateUrl: './setting.component.html',
  styles: ['.mat-form-field { width: 100%;}']
})
export class ElementSettingComponent implements OnInit {
  solutionsChoices = ['Auto', '1024x768', '1366x768', '1400x900'];
  setting: Setting;

  constructor(public dialogRef: MatDialogRef<ElementSettingComponent>,
              @Inject(MAT_DIALOG_DATA) public data: any,
              private settingSrv: SettingService) {
  }

  ngOnInit() {
    this.setting = this.settingSrv.setting;
    console.log(this.setting);
  }

  onSubmit() {
    this.dialogRef.close();
  }

  onNoClick(): void {
    this.dialogRef.close();
  }
}
