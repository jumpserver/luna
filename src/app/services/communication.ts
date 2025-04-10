import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class IframeCommunicationService {
  private messageSource = new Subject<any>();

  message$ = this.messageSource.asObservable();

  sendMessage(message: any) {
    this.messageSource.next(message);
  }
}
