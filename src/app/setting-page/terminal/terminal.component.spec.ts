import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { SettingPageTerminalComponent } from './terminal.component';

describe('SettingPageTerminalComponent', () => {
  let component: SettingPageTerminalComponent;
  let fixture: ComponentFixture<SettingPageTerminalComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ SettingPageTerminalComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(SettingPageTerminalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
