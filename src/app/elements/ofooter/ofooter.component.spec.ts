import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ElementOfooterComponent } from './ofooter.component';

describe('ElementOfooterComponent', () => {
  let component: ElementOfooterComponent;
  let fixture: ComponentFixture<ElementOfooterComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ElementOfooterComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ElementOfooterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
