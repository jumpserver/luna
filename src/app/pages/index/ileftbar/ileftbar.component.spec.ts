import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { IleftbarComponent } from './ileftbar.component';

describe('IleftbarComponent', () => {
  let component: IleftbarComponent;
  let fixture: ComponentFixture<IleftbarComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ IleftbarComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(IleftbarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });
});
