import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ElementInteractiveComponent } from './interactive.component';

describe('ElementInteractiveComponent', () => {
  let component: ElementInteractiveComponent;
  let fixture: ComponentFixture<ElementInteractiveComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ElementInteractiveComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ElementInteractiveComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
