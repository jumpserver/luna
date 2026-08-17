import { ElementAssetTreeComponent } from './asset-tree.component';

describe('ElementAssetTreeComponent', () => {
  let component: ElementAssetTreeComponent;
  let filterCallback: (node: any) => boolean;

  beforeEach(() => {
    component = Object.create(ElementAssetTreeComponent.prototype);
    spyOn(component, '_filterZTree').and.callFake((_keyword, _tree, callback) => {
      filterCallback = callback;
      return null;
    });
  });

  it('matches parent nodes by name when filtering a fully loaded tree', () => {
    component.filterAssetsLocal('Production', {});

    expect(filterCallback({ isParent: true, name: 'Production Servers' })).toBeTrue();
    expect(filterCallback({ isParent: true, name: 'Development Servers' })).toBeFalse();
  });

  it('continues to match asset nodes by name or address', () => {
    component.filterAssetsLocal('database', {});

    expect(
      filterCallback({
        isParent: false,
        meta: { data: { name: 'Database 01', address: '10.0.0.1' } }
      })
    ).toBeTrue();

    component.filterAssetsLocal('10.0.0.1', {});

    expect(
      filterCallback({
        isParent: false,
        meta: { data: { name: 'Database 01', address: '10.0.0.1' } }
      })
    ).toBeTrue();
  });

  it('ignores nodes with missing searchable data', () => {
    component.filterAssetsLocal('database', {});

    expect(filterCallback({ isParent: true })).toBeFalse();
    expect(filterCallback({ isParent: false })).toBeFalse();
  });

  it('includes descendants from every branch of a matched parent node', () => {
    const firstLeaf = { isParent: false, name: 'First leaf' };
    const secondLeaf = { isParent: false, name: 'Second leaf' };
    const firstBranch = { isParent: true, name: 'First branch', children: [firstLeaf] };
    const secondBranch = { isParent: true, name: 'Second branch', children: [secondLeaf] };
    const root = { isParent: true, name: 'Root', children: [firstBranch, secondBranch] };

    expect(component.recurseChildren(root)).toEqual([
      firstBranch,
      firstLeaf,
      secondBranch,
      secondLeaf
    ]);
  });
});
