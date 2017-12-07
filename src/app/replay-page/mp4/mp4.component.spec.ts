import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { Mp4Component } from './mp4.component';

describe('Mp4Component', () => {
  let component: Mp4Component;
  let fixture: ComponentFixture<Mp4Component>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ Mp4Component ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(Mp4Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
