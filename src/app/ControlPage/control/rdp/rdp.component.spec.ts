import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { RdpComponent } from './rdp.component';

describe('RdpComponent', () => {
  let component: RdpComponent;
  let fixture: ComponentFixture<RdpComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ RdpComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(RdpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });
});
