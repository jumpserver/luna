import {Component, OnInit } from '@angular/core';
import 'rxjs/add/operator/toPromise';
import {NzModalRef} from 'ng-zorro-antd';

@Component({
  selector: 'elements-asset-tree-dialog',
  templateUrl: 'download-dialog.component.html',
  styles: ['./download-dialog.component.scss']
})
export class ElementDownloadDialogComponent implements OnInit {
  public hasDownLoad = false;

  constructor(
    private dialogRef: NzModalRef
  ) {
    if (localStorage.getItem('hasDownLoadApp') === '1') {
      this.hasDownLoad = true;
    }
  }

  ngOnInit() {
  }

  onCancel(): void {
    if (this.hasDownLoad) {
      localStorage.setItem('hasDownLoadApp', '1');
    }
    this.dialogRef.close();
  }

  onConfirm(): void {
    if (this.hasDownLoad) {
      localStorage.setItem('hasDownLoadApp', '1');
    }
    this.dialogRef.close();
    window.open('/core/download/', '_blank');
  }
}
