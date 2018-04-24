import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { SettingPageLdapComponent } from './ldap.component';

describe('SettingPageLdapComponent', () => {
  let component: SettingPageLdapComponent;
  let fixture: ComponentFixture<SettingPageLdapComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ SettingPageLdapComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(SettingPageLdapComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
