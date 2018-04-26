import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { PagesControlComponent } from './control.component';

describe('ControlPageComponent', () => {
  let component: PagesControlComponent;
  let fixture: ComponentFixture<PagesControlComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ PagesControlComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(PagesControlComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });
});
