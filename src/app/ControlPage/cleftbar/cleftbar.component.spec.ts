import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { CleftbarComponent } from './cleftbar.component';

describe('CleftbarComponent', () => {
  let component: CleftbarComponent;
  let fixture: ComponentFixture<CleftbarComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ CleftbarComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(CleftbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });
});
