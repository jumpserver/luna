import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { TermPageComponent } from './term-page.component';

describe('TermPageComponent', () => {
  let component: TermPageComponent;
  let fixture: ComponentFixture<TermPageComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ TermPageComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(TermPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
