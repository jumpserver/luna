import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ElementsReplayMp4Component } from './mp4.component';

describe('ElementsReplayMp4Component', () => {
  let component: ElementsReplayMp4Component;
  let fixture: ComponentFixture<ElementsReplayMp4Component>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ElementsReplayMp4Component ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ElementsReplayMp4Component);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
