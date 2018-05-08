import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { PagesConnectComponent } from './connect.component';

describe('ConnectPageComponent', () => {
  let component: PagesConnectComponent;
  let fixture: ComponentFixture<PagesConnectComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ PagesConnectComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(PagesConnectComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
