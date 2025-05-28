import {Component, Inject, OnInit} from '@angular/core';
import {NZ_MODAL_DATA} from "ng-zorro-antd/modal";

@Component({
  standalone: false,
  selector: 'elements-asset-tree-dialog',
  templateUrl: 'download-dialog.component.html',
  styles: ['download-dialog.component.scss']
})
export class ElementDownloadDialogComponent implements OnInit {
  public ignoreRemind = false;

  constructor(
    @Inject(NZ_MODAL_DATA) public data: any,
  ) {
    this.ignoreRemind = data?.ignoreRemind || false;
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
