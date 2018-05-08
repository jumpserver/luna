import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ReplayGuacamoleComponent } from './guacamole.component';

describe('ReplayGuacamoleComponent', () => {
  let component: ReplayGuacamoleComponent;
  let fixture: ComponentFixture<ReplayGuacamoleComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ReplayGuacamoleComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ReplayGuacamoleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
