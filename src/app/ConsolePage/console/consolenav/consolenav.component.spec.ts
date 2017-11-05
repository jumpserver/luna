import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ConsolenavComponent } from './consolenav.component';

describe('ConsolenavComponent', () => {
  let component: ConsolenavComponent;
  let fixture: ComponentFixture<ConsolenavComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ConsolenavComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ConsolenavComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });
});
