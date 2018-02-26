import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { SettingPageComponent } from './setting-page.component';

describe('SettingPageComponent', () => {
  let component: SettingPageComponent;
  let fixture: ComponentFixture<SettingPageComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ SettingPageComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(SettingPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
