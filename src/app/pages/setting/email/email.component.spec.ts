import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { SettingPageEmailComponent } from './email.component';

describe('SettingPageEmailComponent', () => {
  let component: SettingPageEmailComponent;
  let fixture: ComponentFixture<SettingPageEmailComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ SettingPageEmailComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(SettingPageEmailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
