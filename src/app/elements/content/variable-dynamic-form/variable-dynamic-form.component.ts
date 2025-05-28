import {Component, EventEmitter, Input, OnInit, Output, SimpleChanges} from '@angular/core';
import {FormGroup} from '@angular/forms';
import {DynamicFormService} from './dynamic-form.service';
import * as _ from 'lodash';

@Component({
  standalone: false,
  selector: 'variable-dynamic-form',
  templateUrl: 'variable-dynamic-form.component.html',
  styleUrls: ['variable-dynamic-form.component.scss'],
})
export class DynamicFormComponent implements OnInit {
  @Input() formConfig: any;
  @Input() command: any;
  @Output() formSubmitted = new EventEmitter<any>();
  dynamicForm: FormGroup;
  fieldKeys: string[];

  constructor(private dynamicFormService: DynamicFormService) {
  }

  ngOnInit(): void {
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['formConfig'] && this.formConfig) {
      this.dynamicForm = this.dynamicFormService.createFormGroup(this.formConfig);
      this.fieldKeys = Object.keys(this.formConfig);
      this.fieldKeys.forEach(fieldKey => {
        const control = this.dynamicForm.get(`jms_${fieldKey}`);
        if (control) {
          control.valueChanges.subscribe(value => {
            this.updateTextarea();
          });
        }
      });
    }
  }

  updateTextarea(): void {
    _.templateSettings.interpolate = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;
    const compiled = _.template(this.command.args);
    const context = {};
    this.fieldKeys.forEach(fieldKey => {
      context[`jms_${fieldKey}`] = this.dynamicForm.get(`jms_${fieldKey}`).value;
    });
    const commandText = compiled(context);
    this.dynamicForm.get('sendCommand').setValue(commandText);
  }

  onSubmit() {
    if (this.dynamicForm.valid) {
      this.formSubmitted.emit(this.dynamicForm.value);
    }
  }
}
