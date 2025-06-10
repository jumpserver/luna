import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

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
    iframeURL: '',
  };

  private stateSubject = new BehaviorSubject<DrawerState>(this.initialState);
  public state$ = this.stateSubject.asObservable();

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
}
