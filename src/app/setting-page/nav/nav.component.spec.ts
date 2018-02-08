import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { SettingPageNavComponent } from './nav.component';

describe('SettingPageNavComponent', () => {
  let component: SettingPageNavComponent;
  let fixture: ComponentFixture<SettingPageNavComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ SettingPageNavComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(SettingPageNavComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
