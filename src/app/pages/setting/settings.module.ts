import { NgModule } from '@angular/core';
import { SettingPageS3Component } from './s3/s3.component';
import { SettingPageTerminalComponent} from './terminal/terminal.component';
import { SettingPageLdapComponent } from './ldap/ldap.component';
import { SettingPageEmailComponent } from './email/email.component';
import { SettingPageBasicComponent } from './basic/basic.component';
import { PagesSettingComponent } from './setting.component';

@NgModule({
  imports: [
  ],
  declarations: [
    SettingPageS3Component,
    SettingPageTerminalComponent,
    SettingPageLdapComponent,
    SettingPageEmailComponent,
    SettingPageBasicComponent,
    PagesSettingComponent
  ]
})
export class SettingsModule {
}
