import {async, ComponentFixture, TestBed} from '@angular/core/testing';

import {ElementNavComponent} from './nav.component';

describe('ElementNavComponent', () => {
  let component: ElementNavComponent;
  let fixture: ComponentFixture<ElementNavComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ElementNavComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ElementNavComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });
});
