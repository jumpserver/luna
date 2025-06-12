import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { ViewService } from './view';

interface DrawerState {
  onLineUsers: any[];
  iframeURL: string;
}

@Injectable({
  providedIn: 'root'
})
export class DrawerStateService {
  private initialState: DrawerState = {
    onLineUsers: [],
    iframeURL: ''
  };
  private messageSource = new Subject<any>();
  private stateSubject = new BehaviorSubject<DrawerState>(this.initialState);
  public state$ = this.stateSubject.asObservable();

  constructor(private viewService: ViewService) {
    // 订阅视图状态变化
    this.viewService.state$.subscribe(evt => {
      // 根据视图状态更新抽屉状态
      this.updateDrawerState(evt);
    });
  }

  message$ = this.messageSource.asObservable();

  getState(): DrawerState {
    return this.stateSubject.value;
  }

  updateState(partialState: Partial<DrawerState>): void {
    const currentState = this.stateSubject.value;
    const newState = { ...currentState, ...partialState };
    this.stateSubject.next(newState);
  }

  updateDrawerState(evt: any): void {
    // 根据视图状态更新抽屉状态
    if (evt.action === 'active') {
      this.sendComponentMessage({
        name: 'TAB_VIEW_CHANGE',
        data: evt.view.id
      });
    } else if (evt.action === 'close') {
      this.sendComponentMessage({
        name: 'TAB_VIEW_CLOSE',
        data: evt.view.id
      });
      if (this.viewService.viewList.length === 0) {
        this.sendComponentMessage({
          name: 'ALL_VIEWS_CLOSED'
        });
      }
    }
  }

  resetState(): void {
    this.stateSubject.next(this.initialState);
  }

  sendComponentMessage(message: any): void {
    this.messageSource.next(message);
  }
}
