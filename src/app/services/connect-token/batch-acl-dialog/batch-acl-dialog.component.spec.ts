import { ElementBatchACLDialogComponent } from './batch-acl-dialog.component';

describe('ElementBatchACLDialogComponent', () => {
  function createComponent(code: string, details: string[]) {
    const items = details.map(detail => ({
      code,
      error: {
        error: { code, detail }
      }
    }));

    const component = new ElementBatchACLDialogComponent(
      { code, items },
      null,
      null,
      null,
      null,
      null,
      null,
      null
    );
    component.ngOnInit();
    return component;
  }

  it('uses the friendly message key for a rejected ACL', () => {
    const component = createComponent('acl_reject', [
      'ACL action is reject: Reject (021b33e3-344f-4a24-9ce3-af398a23f344)'
    ]);

    expect(component.messageKey).toBe('ACL reject login asset');
  });

  it('uses the friendly message key for every rejected asset in a batch', () => {
    const component = createComponent('acl_reject', ['First ACL detail', 'Second ACL detail']);

    expect(component.items.map(item => item.detail)).toEqual([
      'ACL reject login asset',
      'ACL reject login asset'
    ]);
  });

  it('keeps the server detail for unknown errors', () => {
    const component = createComponent('unknown_error', ['Server detail']);

    expect(component.messageKey).toBe('Server detail');
  });
});
