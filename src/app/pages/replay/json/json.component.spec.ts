import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { JsonComponent } from './json.component';

describe('JsonComponent', () => {
  let component: JsonComponent;
  let fixture: ComponentFixture<JsonComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ JsonComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(JsonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
