import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ElementTreeComponent } from './tree.component';

describe('R ', () => {
  let component: ElementTreeComponent;
  let fixture: ComponentFixture<ElementTreeComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ElementTreeComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ElementTreeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
