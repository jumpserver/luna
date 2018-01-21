import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ElementIframeComponent } from './iframe.component';

describe('ElementIframeComponent', () => {
  let component: ElementIframeComponent;
  let fixture: ComponentFixture<ElementIframeComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ElementIframeComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ElementIframeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
