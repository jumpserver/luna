import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { PagesReplayComponent } from './replay-page.component';

describe('ReplayPageComponent', () => {
  let component: PagesReplayComponent;
  let fixture: ComponentFixture<PagesReplayComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ PagesReplayComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(PagesReplayComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
