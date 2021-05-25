import {async, ComponentFixture, TestBed} from '@angular/core/testing';

import {ElementTermComponent} from './term.component';

describe('ElementTermComponent', () => {
  let component: ElementTermComponent;
  let fixture: ComponentFixture<ElementTermComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ElementTermComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ElementTermComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
