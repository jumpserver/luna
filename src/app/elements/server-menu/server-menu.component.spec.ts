import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ElementServerMenuComponent } from './server-menu.component';

describe('ElementServerMenuComponent', () => {
  let component: ElementServerMenuComponent;
  let fixture: ComponentFixture<ElementServerMenuComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ElementServerMenuComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ElementServerMenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
