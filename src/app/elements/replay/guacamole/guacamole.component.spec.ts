import {async, ComponentFixture, TestBed} from '@angular/core/testing';

import {ElementReplayGuacamoleComponent} from './guacamole.component';

describe('ReplayGuacamoleComponent', () => {
  let component: ElementReplayGuacamoleComponent;
  let fixture: ComponentFixture<ElementReplayGuacamoleComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ElementReplayGuacamoleComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ElementReplayGuacamoleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
