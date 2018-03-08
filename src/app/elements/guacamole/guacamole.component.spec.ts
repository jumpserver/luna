import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ElementGuacamoleComponent } from './guacamole.component';

describe('ElementGuacamoleComponent', () => {
  let component: ElementGuacamoleComponent;
  let fixture: ComponentFixture<ElementGuacamoleComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ElementGuacamoleComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ElementGuacamoleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
