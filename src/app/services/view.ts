import {Injectable} from '@angular/core';
import {View} from '@app/model';


@Injectable()
export class ViewService {
  viewList: Array<View> = [];
  currentView: View;
  num = 0;

  addView(view: View) {
    this.num += 1;
    view.id = 'View_' + this.num;
    this.viewList.push(view);
  }

  activeView(view: View) {
    this.viewList.forEach((v, k) => {
      if (v === view) {
        v.active = true;
        if (view.termComp) {
          setTimeout(() => {
            view.termComp.setActive();
          }, 100);
        }
      } else {
        v.active = false;
      }
    });
    setTimeout(() => {
      const viewEl = document.getElementById(view.id);
      if (viewEl) {
        viewEl.scrollIntoView();
      }
    }, 100);
    this.currentView = view;
  }

  removeView(view: View) {
    const index = this.viewList.indexOf(view);
    this.viewList.splice(index, 1);
  }

  switchView(direction: ('left' | 'right')) {
    const viewList = this.viewList;
    const viewListLength = viewList.length;
    for (let i = 0; i < viewListLength; i++) {
      const current: View = viewList[i];
      if (current.id === this.currentView.id) {
        let nextView: View, nextViewLength: number;
        const next: number = direction === 'left' ? i - 1 : i + 1;
        if (direction === 'left') {
          nextViewLength = next < 0 ? viewListLength - 1 : next;
        } else {
          nextViewLength = next >= viewListLength ? 0 : next;
        }
        nextView = viewList[nextViewLength];
        if (nextView) { this.activeView(nextView); }
        break;
      }
    }
  }
}
