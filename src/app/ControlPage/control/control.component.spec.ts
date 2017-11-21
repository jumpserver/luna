import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ControlComponent } from './control.component';

describe('ControlComponent', () => {
  let component: ControlComponent;
  let fixture: ComponentFixture<ControlComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ControlComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ControlComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });
});
