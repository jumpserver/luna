import { Replay } from '@app/model';
import { HttpService, I18nService, LogService } from '@app/services';
import { TranslateService } from '@ngx-translate/core';
import { Component, Input, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { ChangeDetectorRef } from '@angular/core';

export interface Section extends Replay {
  name: string;
  updated: string;
  size: string;
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

  alertShown = true;
  videoLoading = false;

  constructor(
    public _i18n: I18nService,
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

  /**
   * 格式化文件大小
   * @param size
   */
  formatFileSize(size: number): string {
    const kb = 1024;
    const mb = kb * 1024;
    const gb = mb * 1024;

    let result = '';

    if (size >= gb) {
      result = (size / gb).toFixed(2) + ' GB';
    } else if (size >= mb) {
      result = (size / mb).toFixed(2) + ' MB';
    } else {
      result = (size / kb).toFixed(2) + ' KB';
    }

    return result;
  }

  /**
   * 格式化时间
   * @param duration
   */
  formatDuration(duration: number): string {
    const seconds = Math.floor(duration / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    let result = '';
    const currentLang = this.getUserLang();

    if (hours > 0) {
      result += currentLang === 'zh-CN' ? `${hours} 小时 ` : `${hours} hour `;
    }
    if (minutes > 0) {
      result += currentLang === 'zh-CN' ? `${minutes} 分 ` : `${minutes} min `;
    }
    if (remainingSeconds > 0 || (!hours && !minutes)) {
      result +=  currentLang === 'zh-CN' ?  `${remainingSeconds} 秒` : `${remainingSeconds} s`;
    }

    return result.trim();
  }

  /**
   * 分割 File 对象
   * @param file
   * @param sessionId
   */
  async handlePartFileReplay(file: IFile[], sessionId: string) {
    let isFirstPush = true;

    for (const item of file) {
      let res: Replay;
      let retry = true;

      while (retry) {
        try {
          res = await this._http
            .getPartFileReplay(sessionId, item.name)
            .toPromise();

          if (res && res.status !== 'running') {
            const section: Section = {
              id: this.id,
              account: res.account,
              asset: res.asset,
              date_end: res.date_end,
              date_start: res.date_start,
              download_url: res.download_url,
              src: res.src,
              type: res.type,
              user: res.user,
              size: this.formatFileSize(item.size),
              name: `Part ${this.folders.length + 1}`,
              updated: this.formatDuration(item.duration),
            };

            this.folders.push(section);

            if (isFirstPush) {
              this.currentVideo = section;
              this.videoLoading = true;
              this.cdRef.detectChanges();

              setTimeout(() => {
                this.videoLoading = false;
              }, 300);

              isFirstPush = false;
            }

            retry = false;
          } else if (res && res.status === 'running') {
            this.alertShown = true;
            await this.delay(3000);
          }
        } catch (e) {
          this._logger.error(e);
          retry = false;
        } finally {
          this.alertShown = false;
        }
      }
    }
  }

  /**
   * 延时执行函数
   * @param ms
   */
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
        this.videoLoading = true;
        this.currentVideo = {...folder};

        this.cdRef.detectChanges();

        setTimeout(() => {
          this.videoLoading = false;
        }, 500);

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
