import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { ElementelFinderComponent } from './el-finder.component';

describe('ElementelFinderComponent', () => {
  let component: ElementelFinderComponent;
  let fixture: ComponentFixture<ElementelFinderComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ElementelFinderComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ElementelFinderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
