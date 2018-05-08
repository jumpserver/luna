import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { SshTermComponent } from './ssh-term.component';

describe('SshTermComponent', () => {
  let component: SshTermComponent;
  let fixture: ComponentFixture<SshTermComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ SshTermComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(SshTermComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
