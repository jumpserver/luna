import {Injectable} from '@angular/core';
import {View} from '@app/model';
import {BehaviorSubject} from 'rxjs';

@Injectable()
export class ViewService {
  viewList: Array<View> = [];
  currentView: View;
  num = 0;
  viewIds: Array<string> = [];
  public currentView$ = new BehaviorSubject<Object>({});

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
    this.setCurrentView();
  }

  removeView(view: View) {
    const index = this.viewList.indexOf(view);
    this.viewList.splice(index, 1);
    const idIndex = this.viewIds.indexOf(view.id);
    this.viewIds.splice(idIndex, 1);
    if (this.viewList.length === 0) {
      this.setCurrentView({});
    }
  }

  addSubViewToCurrentView(view: View) {
    this.currentView.subViews.push(view);
    const index = this.currentView.subViews.length;
    this.setCurrentViewTitle(view, index + 1, 'concat');
    this.setCurrentView();
  }

  clearSubViewOfCurrentView(view: View) {
    const index = this.currentView.subViews.indexOf(view);
    this.currentView.subViews.splice(index, 1);
    this.setCurrentViewTitle(view, index + 1, 'delete');
    this.setCurrentView();
  }

  setCurrentViewTitle(view, index, status) {
    const { name } = this.currentView;
    switch (status) {
      case 'concat':
        this.currentView.name = name + '|' + view.name;
        break;
      case 'delete':
        const names = name.split('|');
        if (names[index] === view.name) {
          names.splice(index, 1);
        }
        this.currentView.name = names.join('|');
        break;
    }
    this.setCurrentView();
  }

  keyboardSwitchTab(key) {
    let nextViewId: any = 0;
    let nextActiveView = null;
    const viewIds = this.viewIds;
    const currentViewIndex = viewIds.findIndex(i => i === this.currentView.id);
    if (key === 'alt+shift+right') {
      if (currentViewIndex === viewIds.length - 1 && currentViewIndex !== 0) {
        nextActiveView = this.viewList.find(i => i.id === viewIds[0]);
      } else {
        nextViewId = viewIds[currentViewIndex + 1];
        nextActiveView = this.viewList.find(i => i.id === nextViewId);
      }
    }
    if (key === 'alt+shift+left') {
      if (currentViewIndex === 0) {
        nextActiveView = this.viewList.find(i => i.id === viewIds[viewIds.length - 1]);
      } else {
        nextViewId = viewIds[currentViewIndex - 1];
        nextActiveView = this.viewList.find(i => i.id === nextViewId);
      }
    }
    if (nextActiveView) {
      this.activeView(nextActiveView);
    }
  }

  setCurrentView(view: Object = this.currentView) {
    this.currentView$.next(view);
  }
}
