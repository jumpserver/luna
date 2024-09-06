import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ElementsPartsComponent } from './parts.component';

describe('PartreplayComponent', () => {
  let component: ElementsPartsComponent;
  let fixture: ComponentFixture<ElementsPartsComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ElementsPartsComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ElementsPartsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
