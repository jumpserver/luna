import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ElementRdpComponent } from './rdp.component';

describe('ElementRdpComponent', () => {
  let component: ElementRdpComponent;
  let fixture: ComponentFixture<ElementRdpComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ElementRdpComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ElementRdpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
