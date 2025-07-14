import { Replay } from '@app/model';
import { ActivatedRoute } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { HttpService, I18nService, LogService } from '@app/services';
import { ChangeDetectorRef, Component, Input, OnInit, HostListener } from '@angular/core';

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
  standalone: false,
  selector: 'elements-replay-parts',
  templateUrl: 'parts.component.html',
  styleUrls: ['parts.component.scss']
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

  @HostListener('window:resize', ['$event'])
  onResize(event) {
    this.cdRef.detectChanges();
  }

  constructor(
    public _i18n: I18nService,
    private _http: HttpService,
    private _logger: LogService,
    private route: ActivatedRoute,
    private _translate: TranslateService,
    private cdRef: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      const replayData = await this._http.getReplayData(this.replay.src).toPromise();

      if (replayData) {
        this.replayData = replayData;
        this.replayType = replayData.type;
        this.startTime = this.toSafeLocalDateStr(new Date(Date.parse(replayData.date_start)));
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
    const currentLang = this.getUserLang();
    const isZhCN = currentLang === 'zh-hans';

    if (!duration) {
      return isZhCN ? '0 秒' : '0 s';
    }

    const seconds = Math.floor(duration / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    const timeUnits = [
      { value: hours, zhLabel: '小时', enLabel: 'hour' },
      { value: minutes, zhLabel: '分', enLabel: 'min' },
      { value: remainingSeconds, zhLabel: '秒', enLabel: 's' }
    ];

    let result = timeUnits
      .filter(
        unit =>
          unit.value > 0 ||
          (unit.value === 0 && unit === timeUnits[2] && hours === 0 && minutes === 0)
      )
      .map(unit => `${unit.value} ${isZhCN ? unit.zhLabel : unit.enLabel}`)
      .join(' ');

    return result;
  }

  /**
   * 获取录像源的逻辑
   *
   * @param item
   * @param sessionId
   * @param isFirstPush
   */
  async fetchSection(item: IFile, sessionId: string, isFirstPush: boolean): Promise<boolean> {
    let section: Section;
    try {
      const res: Replay = await this._http.getPartFileReplay(sessionId, item.name).toPromise();

      if (res) {
        // 3.5 的 TS 版本无法使用 ?.
        // @ts-ignore
        const data = res.type ? res : res.resp ? res.resp.data : undefined;

        if (data && data.src && res.status !== 'running') {
          section = {
            id: this.id,
            account: data.account,
            asset: data.asset,
            date_end: data.date_end,
            date_start: data.date_start,
            download_url: data.download_url,
            src: data.src,
            type: data.type,
            user: data.user,
            size: this.formatFileSize(item.size),
            name: `Part ${this.folders.length + 1}`,
            updated: this.formatDuration(item.duration)
          };

          this.folders.push(section);

          if (isFirstPush && section.src) {
            this.currentVideo = section;
            this.videoLoading = true;
            this.cdRef.detectChanges();

            setTimeout(() => {
              this.videoLoading = false;
              this.cdRef.detectChanges();
            }, 200);

            return false;
          }
        } else if (res && res.status === 'running') {
          this.alertShown = true;
          await this.delay(3000);
          return await this.fetchSection(item, sessionId, isFirstPush);
        }
      }
    } catch (e) {
      this._logger.error(e);
    } finally {
      this.alertShown = false;
    }
    return isFirstPush;
  }

  /**
   * 分割 File 对象
   * @param file
   * @param sessionId
   */
  async handlePartFileReplay(file: IFile[], sessionId: string) {
    let isFirstPush = true;

    for (const item of file) {
      isFirstPush = await this.fetchSection(item, sessionId, isFirstPush);
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
      return console.warn('sessionId is not set');
    }

    await this.handlePartFileReplay(file, sessionId);
  }

  /**
   * @description点击列表的回调
   */
  selectPart(folder: Section) {
    if (!folder || !folder.src) {
      return;
    }

    this.currentVideo = null;
    this.videoLoading = true;

    this.cdRef.detectChanges();

    setTimeout(() => {
      this.currentVideo = { ...folder };
      this.cdRef.detectChanges();

      setTimeout(() => {
        this.videoLoading = false;
        this.cdRef.detectChanges();
      }, 100);
    }, 50);
  }

  getUserLang() {
    const userLangZh = document.cookie.indexOf('django_language=zh-hans');

    if (userLangZh >= 0) {
      return 'zh-hans';
    } else {
      return 'en';
    }
  }

  toSafeLocalDateStr(d) {
    const date_s = d.toLocaleString(this.getUserLang(), { hour12: false });
    return date_s.split('/').join('-');
  }
}
