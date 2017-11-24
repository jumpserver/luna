import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { TermpageComponent } from './termpage.component';

describe('TermpageComponent', () => {
  let component: TermpageComponent;
  let fixture: ComponentFixture<TermpageComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ TermpageComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(TermpageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
