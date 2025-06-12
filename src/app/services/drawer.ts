import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

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

  message$ = this.messageSource.asObservable();

  getState(): DrawerState {
    return this.stateSubject.value;
  }

  updateState(partialState: Partial<DrawerState>): void {
    const currentState = this.stateSubject.value;
    const newState = { ...currentState, ...partialState };
    this.stateSubject.next(newState);
  }

  resetState(): void {
    this.stateSubject.next(this.initialState);
  }

  sendComponentMessage(message: any): void {
    this.messageSource.next(message);
  }
}
