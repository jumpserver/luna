import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ElementElfinderComponent } from './elfinder.component';

describe('ElementElfinderComponent', () => {
  let component: ElementElfinderComponent;
  let fixture: ComponentFixture<ElementElfinderComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ElementElfinderComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ElementElfinderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
