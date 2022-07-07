import {Component, OnInit, Inject} from '@angular/core';
import 'rxjs/add/operator/toPromise';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material';

@Component({
  selector: 'elements-asset-tree-dialog',
  templateUrl: 'download-dialog.component.html',
  styles: ['./download-dialog.component.scss']
})
export class ElementDownloadDialogComponent implements OnInit {
  public hasDownLoad = false;

  constructor(public dialogRef: MatDialogRef<ElementDownloadDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {}

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
