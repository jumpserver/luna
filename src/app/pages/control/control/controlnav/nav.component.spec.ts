import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { PagesControlNavComponent } from './nav.component';

describe('ControlPagesControlNavComponent', () => {
  let component: PagesControlNavComponent;
  let fixture: ComponentFixture<PagesControlNavComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ PagesControlNavComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(PagesControlNavComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });
});
