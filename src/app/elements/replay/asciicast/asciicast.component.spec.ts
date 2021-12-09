import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ElementReplayAsciicastComponent } from './asciicast.component';

describe('AsciicastComponent', () => {
  let component: ElementReplayAsciicastComponent;
  let fixture: ComponentFixture<ElementReplayAsciicastComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ElementReplayAsciicastComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ElementReplayAsciicastComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
