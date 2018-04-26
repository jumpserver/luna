import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { SettingPageS3Component } from './s3.component';

describe('SettingPageS3Component', () => {
  let component: SettingPageS3Component;
  let fixture: ComponentFixture<SettingPageS3Component>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ SettingPageS3Component ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(SettingPageS3Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
