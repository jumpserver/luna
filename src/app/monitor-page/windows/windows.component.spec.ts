import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { WindowsComponent } from './windows.component';

describe('WindowsComponent', () => {
  let component: WindowsComponent;
  let fixture: ComponentFixture<WindowsComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ WindowsComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(WindowsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
