import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ElementFooterComponent } from './footer.component';

describe('FooterComponent', () => {
  let component: ElementFooterComponent;
  let fixture: ComponentFixture<ElementFooterComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ElementFooterComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ElementFooterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
