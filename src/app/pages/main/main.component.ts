import {Component, HostListener, OnInit} from '@angular/core';
import {DataStore, User} from '@app/globals';
import {environment} from '@src/environments/environment';

@Component({
  selector: 'pages-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.css'],
})
export class PageMainComponent implements OnInit {
  User = User;
  store = DataStore;

  ngOnInit(): void {
  }

  dragSplitBtn(evt) {
    window.dispatchEvent(new Event('resize'));
  }

  @HostListener('window:beforeunload', ['$event'])
  unloadNotification($event: any) {
    const notInIframe = window.self === window.top;
    const notInReplay = location.pathname.indexOf('/luna/replay') === -1;
    return !(environment.production && notInIframe && notInReplay);
  }
}
