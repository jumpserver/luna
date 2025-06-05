import { Injectable } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';

@Injectable({
  providedIn: 'root'
})
export class DynamicFormService {
  createFormGroup(fields: any): FormGroup {
    const group: any = {};
    for (const field in fields) {
      const fieldDefinition = fields[field];
      const validators = [];
      if (fieldDefinition.required) {
        validators.push(Validators.required);
      }
      group['jms_' + field] = new FormControl(fieldDefinition.default || '', validators);
    }
    group['sendCommand'] = new FormControl('');
    return new FormGroup(group);
  }
}
