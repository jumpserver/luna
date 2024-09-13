import { Replay } from '@app/model';
import { HttpService, LogService } from '@app/services';
import { TranslateService } from '@ngx-translate/core';
import {Component, Input, OnInit} from '@angular/core';
import * as Guacamole from 'guacamole-common-js/dist/guacamole-common';
import { ActivatedRoute } from '@angular/router';
import {MatDialog} from '@angular/material/dialog';
import { ChangeDetectorRef } from '@angular/core';

export interface Section extends Replay {
  name: string;
  updated: Date;
}

export interface IFile {
  duration: number;
  end: number;
  name: string;
  size: number;
  start: number;
}

@Component({
  selector: 'elements-replay-parts',
  templateUrl: './parts.component.html',
  styleUrls: ['./parts.component.scss'],
})
export class ElementsPartsComponent implements OnInit {
  @Input() replay: Replay;

  replayData: any;
  startTime = null;
  id: string;
  replayType: string;
  currentVideo: Section;

  files: IFile[] = [];
  folders: Section[] = [];

  loading = false;
  alertShown = false;

  constructor(
    private _http: HttpService,
    private _dialog: MatDialog,
    private _logger: LogService,
    private route: ActivatedRoute,
    private _translate: TranslateService,
    private cdRef: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      const replayData = await this._http
        .getReplayData(this.replay.src)
        .toPromise();

      if (replayData) {
        this.replayData = replayData;
        this.replayType = replayData.type;
        this.startTime = this.toSafeLocalDateStr(
          new Date(Date.parse(replayData.date_start))
        );
        this.files = replayData.files;
        this.id = replayData.id;

        await this.getAllVideos(this.files);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async handlePartFileReplay(file: IFile[], sessionId: string) {
    for (const item of file) {
      let res: Replay;
      let retry = true;

      while (retry) {
        try {
          res = await this._http
            .getPartFileReplay(sessionId, item.name)
            .toPromise();

          if (res && res.status !== 'running') {
            this.folders.push({
              id: this.id,
              account: res.account,
              asset: res.asset,
              date_end: res.date_end,
              date_start: res.date_start,
              download_url: res.download_url,
              src: res.src,
              type: res.type,
              user: res.user,
              name: item.name,
              updated: new Date(Date.parse(res.date_start)),
            });
            retry = false;
          } else {
            if (!this.alertShown) {
              alert('录像正在上传中，请稍候');
              this.alertShown = true;
            }

            this.loading = true;
            await this.delay(3000);
          }
        } catch (e) {
          this._logger.error(e);
          retry = false;
        } finally {
          this.loading = false;
        }
      }
    }
  }

  delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * @description 获取视频列表
   *
   * @param file
   * @returns
   */
  async getAllVideos(file: IFile[]): Promise<void> {
    let sessionId: string = '';

    this.route.params.subscribe((params: any) => {
      sessionId = params['sid'];
    });

    if (!sessionId) {
      return console.warn('sessionId 未设置');
    }

    await this.handlePartFileReplay(file, sessionId);
  }

  /**
   * @description点击列表的回调
   */
  selectPart(folder: Section) {
    switch (folder.type) {
      case 'guacamole': {
        this.currentVideo = {...folder};
        this.cdRef.detectChanges();
        break;
      }
    }
  }

  getUserLang() {
    const userLangEN = document.cookie.indexOf('django_language=en');
    if (userLangEN === -1) {
      return 'zh-CN';
    } else {
      return 'en-US';
    }
  }

  toSafeLocalDateStr(d) {
    const date_s = d.toLocaleString(this.getUserLang(), { hour12: false });
    return date_s.split('/').join('-');
  }
}
