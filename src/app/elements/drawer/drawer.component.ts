import { Component, OnInit, input, output } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { LogService } from '@app/services';

interface Panel {
  name: string;

  type: 'command' | 'graphic' | 'tree';

  active: boolean;
}

@Component({
  standalone: false,
  selector: 'elements-drawer',
  templateUrl: 'drawer.component.html',
  styleUrls: ['drawer.component.scss']
})
export class ElementDrawerComponent implements OnInit {
  visible = input<boolean>(false);

  visibleChange = output<boolean>();

  validateForm!: FormGroup;

  // 字体选项
  fontFamilies = [
    { label: 'Monaco', value: 'Monaco' },
    { label: 'Consolas', value: 'Consolas' },
    { label: 'Courier New', value: 'Courier New' },
    { label: 'Source Code Pro', value: 'Source Code Pro' }
  ];

  // 光标样式选项
  cursorStyles = [
    { label: '线条', value: 'line' },
    { label: '下划线', value: 'underline' },
    { label: '竖线', value: 'block' }
  ];

  // RDP 分辨率选项
  rdpResolutions = [
    { label: '1920x1080', value: '1920x1080' },
    { label: '1680x1050', value: '1680x1050' },
    { label: '1440x900', value: '1440x900' },
    { label: '1366x768', value: '1366x768' },
    { label: '1280x1024', value: '1280x1024' },
    { label: '1024x768', value: '1024x768' },
    { label: '自适应', value: 'auto' }
  ];

  // RDP 颜色质量选项
  rdpColorQualities = [
    { label: '高 (32 bit)', value: '32' },
    { label: '低 (16 bit)', value: '16' }
  ];

  // 显示选项
  displayOptions = [
    { label: '键盘布局', value: 'keyboard' },
    { label: '全屏', value: 'fullscreen' },
    { label: '多屏显示', value: 'multiscreen' },
    { label: '磁盘挂载', value: 'disk' }
  ];

  // 连接类型选项
  connectionTypes = [
    { label: 'Web', value: 'web' },
    { label: '客户端', value: 'client' }
  ];

  readonly panels: Panel[] = [
    {
      active: true,
      name: '命令行配置',
      type: 'command'
    },
    {
      active: false,
      name: '图形化配置',
      type: 'graphic'
    },
    {
      active: false,
      name: '资产树加载',
      type: 'tree'
    }
  ];

  readonly nzBodyStyle = {
    backgroundColor: 'var(--el-assets-extend-bg-color)'
  };

  readonly customStyle = {
    background: '#f7f7f7',
    'border-radius': '4px',
    border: '0px'
  };

  constructor(
    private _logger: LogService,
    private fb: FormBuilder
  ) {}

  ngOnInit(): void {
    this.validateForm = this.fb.group({
      // 命令行配置
      cursorBlink: [true],
      leftClickCopy: [true],
      rightClickPaste: [true],
      backspaceAsCtrlH: [true],
      cursorStyle: ['line'],
      fontFamily: ['Monaco'],
      fontSize: [14, [Validators.required, Validators.min(8), Validators.max(72)]],

      // 图形化配置
      rdpSmartSize: [false],
      rdpResolution: ['自动'],
      rdpColorQuality: ['32'],
      connectionType: ['web'],
      displayOptions: [['keyboard', 'fullscreen']],

      // 资产树配置
      treeAsync: [false]
    });
  }

  close() {
    this.visibleChange.emit(false);
  }

  onSubmit(): void {
    if (this.validateForm.valid) {
      console.log('Form values:', this.validateForm.value);
    } else {
      Object.values(this.validateForm.controls).forEach(control => {
        if (control.invalid) {
          control.markAsDirty();
          control.updateValueAndValidity({ onlySelf: true });
        }
      });
    }
  }
}
