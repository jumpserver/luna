import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ElementSftpComponent } from './sftp.component';

describe('ElementSftpComponent', () => {
  let component: ElementSftpComponent;
  let fixture: ComponentFixture<ElementSftpComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ElementSftpComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ElementSftpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
