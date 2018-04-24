import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { PagesMonitorComponent } from './monitor.component';

describe('PagesMonitorComponent', () => {
  let component: PagesMonitorComponent;
  let fixture: ComponentFixture<PagesMonitorComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ PagesMonitorComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(PagesMonitorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
