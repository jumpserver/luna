import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ElementSettingsComponent } from './settings.component';

describe('ElementSettingsComponent', () => {
  let component: ElementSettingsComponent;
  let fixture: ComponentFixture<ElementSettingsComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ElementSettingsComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ElementSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
