import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ControlPageComponent } from './controlpage.component';

describe('ControlPageComponent', () => {
  let component: ControlPageComponent;
  let fixture: ComponentFixture<ControlPageComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ControlPageComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ControlPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });
});
