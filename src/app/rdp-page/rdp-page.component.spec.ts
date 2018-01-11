import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { RdpPageComponent } from './rdp-page.component';

describe('RdpPageComponent', () => {
  let component: RdpPageComponent;
  let fixture: ComponentFixture<RdpPageComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ RdpPageComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(RdpPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
