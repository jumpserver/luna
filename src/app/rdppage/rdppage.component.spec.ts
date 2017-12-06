import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { RdppageComponent } from './rdppage.component';

describe('RdppageComponent', () => {
  let component: RdppageComponent;
  let fixture: ComponentFixture<RdppageComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ RdppageComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(RdppageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
