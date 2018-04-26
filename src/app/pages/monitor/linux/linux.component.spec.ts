import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { PagesMonitorLinuxComponent } from './linux.component';

describe('PagesMonitorLinuxComponent', () => {
  let component: PagesMonitorLinuxComponent;
  let fixture: ComponentFixture<PagesMonitorLinuxComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ PagesMonitorLinuxComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(PagesMonitorLinuxComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
