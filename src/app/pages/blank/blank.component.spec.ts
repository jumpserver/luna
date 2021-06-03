import {async, ComponentFixture, TestBed} from '@angular/core/testing';

import {PagesBlankComponent} from './blank.component';

describe('PagesBlankComponent', () => {
  let component: PagesBlankComponent;
  let fixture: ComponentFixture<PagesBlankComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ PagesBlankComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(PagesBlankComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
