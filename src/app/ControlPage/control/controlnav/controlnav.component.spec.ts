import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ControlnavComponent } from './controlnav.component';

describe('ControlnavComponent', () => {
  let component: ControlnavComponent;
  let fixture: ComponentFixture<ControlnavComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ControlnavComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ControlnavComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });
});
