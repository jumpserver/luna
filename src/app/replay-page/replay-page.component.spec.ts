import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ReplayPageComponent } from './replay-page.component';

describe('ReplayPageComponent', () => {
  let component: ReplayPageComponent;
  let fixture: ComponentFixture<ReplayPageComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ReplayPageComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ReplayPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
