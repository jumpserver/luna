import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { PagesMonitorWindowsComponent } from './windows.component';

describe('PagesMonitorWindowsComponent', () => {
  let component: PagesMonitorWindowsComponent;
  let fixture: ComponentFixture<PagesMonitorWindowsComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ PagesMonitorWindowsComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(PagesMonitorWindowsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
