import {Component, OnInit} from '@angular/core';

@Component({
  selector: 'elements-asset-tree-dialog',
  templateUrl: 'download-dialog.component.html',
  styles: ['./download-dialog.component.scss']
})
export class ElementDownloadDialogComponent implements OnInit {
  public ignoreRemind = false;

  constructor() {
  }

  ngOnInit() {
    if (localStorage.getItem('hasDownLoadApp') === '1') {
      this.ignoreRemind = true;
    }
  }

  onCancel(): void {
    if (this.ignoreRemind) {
      localStorage.setItem('hasDownLoadApp', '1');
    }
  }

  onConfirm(): void {
    if (this.ignoreRemind) {
      localStorage.setItem('hasDownLoadApp', '1');
    }
    window.open('/core/download/', '_blank');
  }
}
