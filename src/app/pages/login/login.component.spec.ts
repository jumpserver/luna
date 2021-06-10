import {async, ComponentFixture, TestBed} from '@angular/core/testing';

import {PagesLoginComponent} from './login.component';

describe('PagesLoginComponent', () => {
  let component: PagesLoginComponent;
  let fixture: ComponentFixture<PagesLoginComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ PagesLoginComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(PagesLoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });
});
