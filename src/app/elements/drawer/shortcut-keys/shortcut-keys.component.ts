import { Component, OnInit, Input } from '@angular/core';
import { IframeCommunicationService } from '@app/services';

interface ShortcutKey {
  icon: string;
  label: string;
  keywords: string[];
  click: () => void;
}

@Component({
  standalone: false,
  selector: 'elements-shortcut-keys',
  templateUrl: 'shortcut-keys.component.html',
  styleUrls: ['shortcut-keys.component.scss']
})
export class ElementShortcutKeysComponent implements OnInit {
  @Input() currentViewId: string | null = null;
  @Input() terminalContent: any = null;

  shortcutKeys: ShortcutKey[] = [
    {
      icon: 'stop',
      label: 'Cancel + C',
      keywords: ['Ctrl', 'C'],
      click: () => {
        this.sendShortcutKey('\x03');
      }
    },
    {
      icon: 'arrow-up',
      label: 'UpArrow',
      keywords: ['↑'],
      click: () => {
        this.sendShortcutKey('\x1b[A');
      }
    },
    {
      icon: 'arrow-down',
      label: 'DownArrow',
      keywords: ['↓'],
      click: () => {
        this.sendShortcutKey('\x1b[B');
      }
    },
    {
      icon: 'arrow-left',
      label: 'LeftArrow',
      keywords: ['←'],
      click: () => {
        this.sendShortcutKey('\x1b[D');
      }
    },
    {
      icon: 'arrow-right',
      label: 'RightArrow',
      keywords: ['→'],
      click: () => {
        this.sendShortcutKey('\x1b[C');
      }
    }
  ];

  constructor(private readonly _iframeSvc: IframeCommunicationService) {}

  ngOnInit(): void {}

  get isTerminalConnected(): boolean {
    const connected = Boolean(this.currentViewId && this.terminalContent);

    return connected;
  }

  get currentTerminalId(): string | null {
    return this.getTerminalIdByViewId();
  }

  sendShortcutKey(key: string) {
    const terminalId = this.getTerminalIdByViewId();

    if (!terminalId) {
      return;
    }

    this._iframeSvc.sendMessage({
      name: 'CMD',
      data: key,
    });
  }

  private getTerminalIdByViewId(): string | null {
    if (!this.currentViewId || !this.terminalContent) {
      return null;
    }

    if (this.terminalContent.terminalId) {
      return this.terminalContent.terminalId;
    }

    // 兼容其他可能的字段名称
    if (typeof this.terminalContent === 'object') {
      const possibleFields = ['terminal_id', 'sessionId', 'session_id', 'id'];

      for (const field of possibleFields) {
        if (this.terminalContent[field]) {
          return this.terminalContent[field];
        }
      }
    }

    return null;
  }
}
