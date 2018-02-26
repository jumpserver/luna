import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ElementLeftbarComponent } from './leftbar.component';

describe('ElementLeftbarComponent', () => {
  let component: ElementLeftbarComponent;
  let fixture: ComponentFixture<ElementLeftbarComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ElementLeftbarComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ElementLeftbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
