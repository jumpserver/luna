import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { PagesSettingComponent } from './setting.component';

describe('SettingPageComponent', () => {
  let component: PagesSettingComponent;
  let fixture: ComponentFixture<PagesSettingComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ PagesSettingComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(PagesSettingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
