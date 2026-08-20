import { ElementBatchACLDialogComponent } from './batch-acl-dialog.component';

describe('ElementBatchACLDialogComponent', () => {
  function createDialogRef() {
    return {
      updateConfig: jasmine.createSpy('updateConfig'),
      close: jasmine.createSpy('close')
    };
  }

  function createComponent(code: string, details: string[]) {
    const items = details.map(detail => ({
      code,
      error: {
        error: { code, detail }
      }
    }));
    const dialogRef = createDialogRef();

    const component = new ElementBatchACLDialogComponent(
      { code, items },
      null,
      null,
      null,
      null,
      null,
      null,
      dialogRef as any
    );
    component.ngOnInit();
    return { component, dialogRef };
  }

  it('uses the friendly message key for a rejected ACL', () => {
    const { component } = createComponent('acl_reject', [
      'ACL action is reject: Reject (021b33e3-344f-4a24-9ce3-af398a23f344)'
    ]);

    expect(component.messageKey).toBe('ACL reject login asset');
    expect(component.alertType).toBe('error');
    expect(component.titleKey).toBe('Login reminder');
  });

  it('uses the friendly message key for every rejected asset in a batch', () => {
    const { component } = createComponent('acl_reject', ['First ACL detail', 'Second ACL detail']);

    expect(component.items.map(item => item.detail)).toEqual([
      'ACL reject login asset',
      'ACL reject login asset'
    ]);
    expect(component.messageKey).toBe('Batch same type error message');
    expect(component.items.every(item => !component.shouldShowItemDetail(item))).toBe(true);
  });

  it('keeps the server detail for unknown errors', () => {
    const { component } = createComponent('unknown_error', ['Server detail']);

    expect(component.messageKey).toBe('Server detail');
  });

  it('shows the original single-asset review reminder before submit', () => {
    const { component } = createComponent('acl_review', ['Need review']);

    expect(component.messageKey).toBe('Need review for login asset');
    expect(component.alertType).toBe('info');
    expect(component.titleKey).toBe('Login reminder');
    expect(component.showPrimaryAction).toBe(true);
  });

  it('maps no facial features to the original tip and profile link', () => {
    const { component } = createComponent('no_face_feature', ['raw no face detail']);

    expect(component.messageKey).toBe('No facial features');
    expect(component.alertType).toBe('error');
    expect(component.profileLink).toContain('profile');
  });

  it('starts at the original dialog width and expands when a second asset arrives', () => {
    const { component, dialogRef } = createComponent('acl_reject', [
      'ACL action is reject: Reject (id-1)'
    ]);

    expect(dialogRef.updateConfig).toHaveBeenCalledWith({ nzWidth: '450px' });

    component.addItem({
      code: 'acl_reject',
      error: {
        error: { code: 'acl_reject', detail: 'ACL action is reject: Reject (id-2)' }
      }
    });

    expect(dialogRef.updateConfig).toHaveBeenCalledWith({ nzWidth: '680px' });
    expect(component.isBatch).toBe(true);
  });
});
