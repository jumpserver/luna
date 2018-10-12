import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { SftpComponent } from './sftp.component';

describe('SftpComponent', () => {
  let component: SftpComponent;
  let fixture: ComponentFixture<SftpComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ SftpComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(SftpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
