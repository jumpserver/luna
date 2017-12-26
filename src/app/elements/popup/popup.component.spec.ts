import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ElementPopupComponent } from './popup.component';

describe('ElementPopupComponent', () => {
  let component: ElementPopupComponent;
  let fixture: ComponentFixture<ElementPopupComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ElementPopupComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ElementPopupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });
});
