import {async, ComponentFixture, TestBed} from '@angular/core/testing';

import {ElementAssetTreeComponent} from './asset-tree.component';

describe('R ', () => {
  let component: ElementAssetTreeComponent;
  let fixture: ComponentFixture<ElementAssetTreeComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ ElementAssetTreeComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(ElementAssetTreeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
