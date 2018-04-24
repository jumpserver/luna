import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { PagesIndexComponent } from './index.component';

describe('PagesIndexComponent', () => {
  let component: PagesIndexComponent;
  let fixture: ComponentFixture<PagesIndexComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ PagesIndexComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(PagesIndexComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });
});
