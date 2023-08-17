import {Injectable} from '@angular/core';
import {View} from '@app/model';


@Injectable()
export class ViewService {
  viewList: Array<View> = [];
  currentView: View;
  num = 0;
  viewIds: Array<string> = [];

  addView(view: View) {
    this.num += 1;
    view.id = 'View_' + this.num;
    this.viewList.push(view);
    this.viewIds.push(view.id);
  }

  activeView(view: View) {
    this.viewList.forEach((v, k) => {
      if (v === view) {
        v.active = true;
        if (view.termComp && typeof view.termComp.setActive === 'function') {
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
    const idIndex = this.viewIds.indexOf(view.id);
    this.viewIds.splice(idIndex, 1);
  }
}
