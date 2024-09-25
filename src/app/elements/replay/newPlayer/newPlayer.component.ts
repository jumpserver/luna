import {HttpService, LogService} from '@app/services';
import { TranslateService } from '@ngx-translate/core';

import { Component, Input, NgZone, OnInit } from '@angular/core';
import { StaticHTTPTunnel, SessionRecording } from '@glokon/guacamole-common-js';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Display } from '@glokon/guacamole-common-js/types/Display';
import { formatTime } from '@app/utils/common';
import { Command } from '@app/model';
import { fromEvent, Observable, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Section } from '@app/elements/replay/parts/parts.component';

interface IReplay {
  id?: string;
  src?: string;
  type?: string;
  status?: string;
  timelist?: Array<number>;
  totalTime?: number;
  json?: any;
  user?: string;
  asset?: string;
  system_user?: string;
  date_start?: string;
  date_end?: string;
  height?: number;
  width?: number;
  download_url?: string;
  account?: string;
}
interface IControls {
  isShow?: boolean;
  iconName?: string;
  click?: (e: MouseEvent) => void;
  iconTips?: string;
}

@Component({
  selector: 'elements-new-player',
  templateUrl: './newPlayer.component.html',
  styleUrls: ['./newPlayer.component.scss']
})
export class ElementReplayNewPlayerComponent implements OnInit {
  @Input() replay: IReplay;
  @Input() folders: Section[];

  public page: number;
  public percent: number;
  public rangeMax: number;
  public currentRange: number;
  public startTimeStamp: number;
  public mouseMoveTime: string;
  public startTime: string;
  public totalDuration: string;
  public currentPosition: string;
  public isPause: boolean;
  public isLoading: boolean;
  public isShowControl: boolean;
  public commands: Command[];
  public controls: IControls[];

  public tunnel: StaticHTTPTunnel;
  public screenRef: HTMLElement;
  public recording: SessionRecording;
  public winSizeSub: Subscription;
  public progressTimeout: any;
  public recordingElement: HTMLElement;
  public recordingDisplay: Display;
  public currentFolder: Section;

  constructor(
    private _ngZone: NgZone,
    private _http: HttpService,
    private _logger: LogService,
    private _snackBar: MatSnackBar,
    private _translate: TranslateService,
  ) {}

   async ngOnInit(): Promise<void> {
    this.screenRef = document.getElementById('screen');

    this.page = 0;
    this.rangeMax = 100;
    this.currentRange = 0;
    this.totalDuration = '00:00';
    this.currentPosition = '00:00';
    this.commands = [];
    this.controls = [
       {
         isShow: !this.isPause,
         iconTips: '播放',
         iconName: 'play_arrow',
         click: (e: MouseEvent) => {
           this.handleToggle(e);
         }
       },
       {
         isShow: this.isPause,
         iconTips: '暂停',
         iconName: 'pause_circle',
         click: (e: MouseEvent) => {
           this.handleToggle(e);
         }
       },
      {
        isShow: true,
        iconTips: '下一集',
        iconName: 'skip_next',
        click: async (e: MouseEvent) => {
          await this.handleNextFolder();
        }
      },
       {
         isShow: true,
         iconTips: '重新播放',
         iconName: 'refresh',
         click: (e: MouseEvent) => {
           this.rePlay();
         }
       }
     ];
    this.isPause = true;
    this.isLoading = false;
    this.isShowControl = false;
    this.startTimeStamp = this.replay ? Date.parse(this.replay.date_start) : 0;

    if (this.folders) {
     await this.selectPart(this.folders[0]);
    }
  }

  updateControls() {
    this.controls[0].isShow = this.isPause;
    this.controls[1].isShow = !this.isPause;
  }

  /**
   * @description 获取 i18n
   */
  getUserLang(): string {
    const userLangEN: number = document.cookie.indexOf('django_language=en');

    if (userLangEN === -1) {
      return 'zh-CN';
    } else {
      return 'en-US';
    }
  }

  /**
   * @description 设置时间
   */
  initDateTime(): void {
    const date: Date = new Date(Date.parse(this.replay.date_start));
    this.startTime = date.toLocaleString(this.getUserLang(), { hour12: false }).split('/').join('-');
  }

  /**
   * @description 播放下一个
   */
  async handleNextFolder() {
    const index = this.folders.findIndex(folder => folder === this.currentFolder);

    const nextIndex = (index + 1) % this.folders.length;

    const nextFolder = this.folders[nextIndex];

    await this.selectPart(nextFolder);
  }

  /**
   * @description 初始化 Guacamole 播放器
   */
  initGuacamolePlayer(): void {
    if (!this.replay || !this.replay.src) {
      this._snackBar.open('Source URL is missing', '', {
        duration: 20000,
        verticalPosition: 'top'
      });

      return;
    }

    this.tunnel = new StaticHTTPTunnel(this.replay.src, true);
    this.recording = new SessionRecording(this.tunnel);

    this.recordingDisplay = this.recording.getDisplay();
    this.recordingElement = this.recordingDisplay.getElement();

    const width = this.screenRef.offsetWidth;
    const height = this.screenRef.offsetHeight;
    this.recordingDisplay.resize(this.recordingDisplay.getDefaultLayer(), width, height);

    this.screenRef.appendChild(this.recordingElement);

    this.initRecordingEvent();
  }

  /**
   * @description 初始化播放器事件
   */
  initRecordingEvent(): void {
    this.recording.connect();

    this.recording.onplay = () => {
      console.log('Recording is playing');

      this.isPause = false;
      this.isShowControl = true;

      this.updateControls();
    };

    this.recording.onpause = () => {
      console.log('pause');
    };

    this.recording.onseek = (position: number, _current: number, _total: number) => {
      // 二者为 1 表示正常速率播放，没有进行 seek
      if (_current === 1 || _total === 1) {
        this.currentPosition = formatTime(position);
        this.currentRange = position;

        return;
      }

      if (!_current || !_total ) {
        this.recording.play();
      }
    };

    this.recording.onprogress = (duration: number, _parsedSize: number) => {
      if (this.progressTimeout) {
        clearTimeout(this.progressTimeout);
      }

      // 只处理最后一次的 duration 值，以便解决视频时长一直变化的问题
      this.progressTimeout = setTimeout(() => {
        this._logger.info('Final duration to process:', duration);

        this.recording.seek(duration, () => {
          this.isLoading = false;
          this.rangeMax = duration;
          this.totalDuration = formatTime(duration);
          this.currentPosition = '00:00';
          this.recording.seek(0);
        });
      }, 300);
    };

    this.recording.onerror = (error) => {
      console.log('Recording error:', error);

      this.isShowControl = false;

      this._snackBar.open('播放时发生错误', '', {
        duration: 2000,
        verticalPosition: 'top'
      });
    };

    this.recordingDisplay.onresize = (_width: number, height: number) => {
      if (!height) {
        return;
      }

      this.recordingDisplay.scale(this.getPropScale());
    };
  }

  /**
   * @description 进度条鼠标按下
   *
   * @param _e
   */
   async jumpPosition(_e: Event) {
    _e.stopPropagation();
    this.handleToggle();

    const position = this.gerAbsolutelyPosition(_e);

    this.currentPosition = formatTime(position);
    this.recording.seek(position);
  }

  gerAbsolutelyPosition(_e: Event) {
    const target: HTMLInputElement = _e.target as HTMLInputElement;

    // 获取 input 的边界
    const rect = target.getBoundingClientRect();

    // @ts-ignore 鼠标相对于 input 元素的 X 坐标
    const mouseX = _e.clientX - rect.left;

    // 进度条宽度
    const width = rect.width;

    let newValue = (mouseX / width) * (Number(target.max) - Number(target.min)) + Number(target.min);
    newValue = Math.max(Number(target.min), Math.min(newValue, Number(target.max)));

    return newValue;
  }

  /**
   * 鼠标悬浮进度条展示时间信息
   * @param _e
   */
  showTime(_e: Event) {
    const position = this.gerAbsolutelyPosition(_e);
    this.mouseMoveTime = formatTime(position);
  }

  /**
   * 快进
   */
  fastForward() {
    this.recording.pause();

    const currentPosition = this.recording.getPosition();
    const newPosition = currentPosition + 10000;

    if (newPosition >= 0 && newPosition <= this.recording.getDuration()) {
      this.recording.seek(newPosition, () => {
        this.currentPosition = formatTime(newPosition);
      });
    }
  }

  /**
   * 重播
   */
  rePlay(): void {
    this.currentRange = 0;

    this.recording.seek(this.currentRange);
  }

  /**
   * @description 主要针对 window 的 resize 事件
   */
  initWindowEvent() {
    const winSizeChange$: Observable<Event> = fromEvent(window, 'resize').pipe(
      debounceTime(300),
      distinctUntilChanged()
    );

    // 订阅 Observable 并处理事件
    this.winSizeSub = winSizeChange$.subscribe(() => {

      console.log('Window resized');

      if (this.recordingDisplay) {
        this.recordingDisplay.scale(this.getPropScale());
      }
    });
  }

  /**
   * @description Gua 播放器的自适应缩放
   */
  getPropScale(): number {
    let scale = 1;

    if (this.recordingDisplay) {
      const width = this.recordingDisplay.getWidth();
      const height = this.recordingDisplay.getHeight();

      if (!width || !height) {
        return scale;
      }

      const widthScale = this.screenRef.offsetWidth / width;
      const heightScale = this.screenRef.offsetHeight / height;

      scale = Math.min(widthScale, heightScale);
    }

    return scale;
  }

  /**
   * @description 指令列表的指令的回调
   *
   * @param item
   */
  commandClick(item: Command) {
    const time: number = (item.timestamp - 10) * 1000 - this.startTimeStamp;

    this.percent = time <= 0 ? 0 : time;
  }

  /**
   * @description 播放状态的转换
   */
  handleToggle(e?: MouseEvent) {
    // tslint:disable-next-line:no-unused-expression
    e ? e.stopPropagation() : '';

    if (this.recording.isPlaying()) {
      this.isPause = true;
      this.recording.pause();
    } else {
      this.isPause = false;
      this.recording.play();
    }

    this.updateControls();
  }

  /**
   * @description 获取命令列表
   *
   * @param page
   */
  async getCommands(page: number) {
    if (!this.startTimeStamp) {
      return;
    }

    if (!this.replay || !this.replay.id) {
      return;
    }

    try {
      const commandData = await this._http.getCommandsData(this.replay.id, page).toPromise();

      if (!commandData) {
        return this._snackBar.open('没找到命令记录', '', {
          duration: 1500,
          verticalPosition: 'top'
        });
      }

      const results = commandData.results;

      // todo)) 修改 any 类型
      results.map((result: any) => {
        result.atime = formatTime(result.timestamp * 1000 - this.startTimeStamp);
      });

      this.commands = this.commands.concat(results);
    } catch (e) {}
  }

  /**
   * @description 命令列表滑动至底部的回调
   */
  async onScroll() {
   await this.getCommands(++this.page);
  }

  async selectPart(folder: Section) {

    this.isShowControl = false;
    this.currentFolder = folder;

    if (this.recording) {
      // 断开当前的播放会话
      this.recording.disconnect();

      if (this.recordingElement && this.recordingElement.parentNode) {
        this.recordingElement.parentNode.removeChild(this.recordingElement);
      }

      // 重置 recordingDisplay 以确保新的会话不会受到影响
      this.recordingDisplay = null;
      this.recordingElement = null;
    }

    switch (folder.type) {
      case 'guacamole': {
        this.isLoading = true;
        this.replay = folder;

        this.initDateTime();
        this.initWindowEvent();
        this.initGuacamolePlayer();

        await this.getCommands(this.page);

        break;
      }
    }
  }
}
