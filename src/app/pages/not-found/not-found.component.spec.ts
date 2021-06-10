import {async, ComponentFixture, TestBed} from '@angular/core/testing';

import {PagesNotFoundComponent} from './not-found.component';

describe('PagesNotFoundComponent', () => {
  let component: PagesNotFoundComponent;
  let fixture: ComponentFixture<PagesNotFoundComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ PagesNotFoundComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(PagesNotFoundComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });
});
