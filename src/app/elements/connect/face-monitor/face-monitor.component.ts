import {Component, OnInit} from '@angular/core';
import {FaceService} from '@app/services/face';
import {DomSanitizer, SafeResourceUrl} from '@angular/platform-browser';

@Component({
  standalone: false,
  selector: 'app-face-monitor',
  templateUrl: 'face-monitor.component.html',
  styleUrls: ['face-monitor.component.scss']
})
export class ElementFaceMonitorComponent implements OnInit {

  constructor(
    private faceMonitorService: FaceService,
    private sanitizer: DomSanitizer
  ) {
    this.faceMonitorService.isVisible$.subscribe(status => {
      this.isVisible = status;
    });
    this.faceMonitorService.monitoringTabCount$.subscribe(count => {
      if (count > 0) {
        this.ready = true;
      }
      this.monitoringTabCount = count;
      if (this.ready && this.monitoringTabCount === 0) {
        this.isVisible = false;
      }
    });
  }

  public faceMonitorUrl: SafeResourceUrl;
  public isMinimized = false;
  public isVisible = true;
  public monitoringTabCount = 0;
  public ready = false;

  ngOnInit() {
    this.faceMonitorUrl = this.sanitizer.bypassSecurityTrustResourceUrl('/facelive/monitor?token=' + this.faceMonitorService.getToken());
  }

  minimizeBox() {
    this.isMinimized = !this.isMinimized;
  }

  closeBox() {
    this.isVisible = false;
  }
}
