import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { SettingPageBasicComponent } from './basic.component';

describe('SettingPageBasicComponent', () => {
  let component: SettingPageBasicComponent;
  let fixture: ComponentFixture<SettingPageBasicComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ SettingPageBasicComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(SettingPageBasicComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
