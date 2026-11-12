import { ElementRef, NgZone, SimpleChange } from '@angular/core';
import { fakeAsync, tick } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import Guacamole from '@guacamole';
import { ElementReplayGuacamoleComponent } from './guacamole.component';

describe('Guacamole recording component', () => {
  let component: ElementReplayGuacamoleComponent;
  let recording: any;
  let container: HTMLElement;
  let element: HTMLElement;
  let duration: number;
  let playing: boolean;
  let position: number;
  let completions: Array<() => void>;
  let commandData: Subject<any>;
  let recordingFactory: jasmine.Spy;

  beforeEach(() => {
    duration = 1000;
    position = 0;
    playing = false;
    completions = [];
    container = document.createElement('div');
    container.innerHTML =
      '<div id="player" class="player-container"><div class="display"><div id="screen"></div></div></div>';
    document.body.appendChild(container);
    element = document.createElement('div');
    const display = {
      getElement: () => element,
      getWidth: () => 2,
      getHeight: () => 2,
      scale: jasmine.createSpy('scale')
    };
    recording = {
      getDisplay: () => display,
      getDuration: () => duration,
      getPosition: () => position,
      isPlaying: () => playing,
      play: jasmine.createSpy('play').and.callFake(() => {
        playing = true;
        recording.onplay();
      }),
      pause: jasmine.createSpy('pause').and.callFake(() => {
        playing = false;
        recording.onpause();
      }),
      seek: jasmine.createSpy('seek').and.callFake((target, callback) => {
        position = target;
        completions.push(callback);
      }),
      cancel: jasmine.createSpy('cancel'),
      dispose: jasmine.createSpy('dispose')
    };
    recordingFactory = spyOn(Guacamole, 'SessionRecording').and.returnValue(recording);
    commandData = new Subject();
    const zone = {
      run: callback => callback(),
      runOutsideAngular: callback => callback()
    } as any as NgZone;
    component = new ElementReplayGuacamoleComponent(
      { getCommandsData: () => commandData } as any,
      { get: () => of('Seek to command') } as any,
      zone,
      new ElementRef(container)
    );
    component.replay = { src: '/recording', date_start: '2026-01-01T00:00:00Z' } as any;
    component.ngOnChanges({ replay: new SimpleChange(undefined, component.replay, true) });
    component.ngAfterViewInit();
  });

  afterEach(() => {
    component.ngOnDestroy();
    container.parentNode.removeChild(container);
  });

  it('does not resume a user pause as more recording frames are indexed', () => {
    recording.onprogress(1000);
    expect(component.isPlaying).toBe(true);
    component.pause();
    recording.onprogress(2000);
    recording.onload();
    expect(recording.play.calls.count()).toBe(1);
    expect(component.isPlaying).toBe(false);
  });

  it('waits for command seek data and clamps requests when indexing finishes', () => {
    component.pause();
    component.percent = 5000;
    component.runFrom();
    recording.onprogress(1000);
    expect(recording.seek).not.toHaveBeenCalled();
    duration = 3000;
    recording.onload();
    expect(recording.seek.calls.mostRecent().args[0]).toBe(3000);
    completions.pop()();
    expect(component.percent).toBe(3000);
    expect(component.playerRef.className).toBe('player-container');
    expect(component.isSeeking).toBe(false);
    expect(recording.play).not.toHaveBeenCalled();
  });

  it('ignores a replaced seek completion and resumes only after the latest seek', () => {
    recording.onprogress(1000);
    component.percent = 100;
    component.runFrom();
    component.percent = 200;
    component.runFrom();
    completions[0]();
    expect(component.playerRef.className).toBe('player-container seeking');
    expect(component.isSeeking).toBe(true);
    expect(recording.play.calls.count()).toBe(1);
    completions[1]();
    expect(component.playerRef.className).toBe('player-container');
    expect(component.isSeeking).toBe(false);
    expect(recording.play.calls.count()).toBe(2);
  });

  it('cancels a pending seek while preserving a user pause', () => {
    component.pause();
    component.percent = 5000;
    component.runFrom();
    component.cancelSeek({ stopPropagation: () => {} });
    duration = 6000;
    recording.onprogress(6000);
    expect(recording.seek).not.toHaveBeenCalled();
    expect(recording.cancel).toHaveBeenCalled();
    expect(recording.play).not.toHaveBeenCalled();
    expect(component.playerRef.className).toBe('player-container');
    expect(component.isSeeking).toBe(false);
  });

  it('stops autoplay and clears seeking when recording storage fails', () => {
    component.percent = 5000;
    component.runFrom();
    recording.onerror('Not enough browser storage to cache this recording.');
    recording.onprogress(6000);
    component.play();
    expect(component.recordingError).toContain('storage');
    expect(component.playerRef.className).toBe('player-container');
    expect(component.isSeeking).toBe(false);
    expect(recording.play).not.toHaveBeenCalled();
  });

  it('disposes recording resources and unsubscribes from resize on destruction', fakeAsync(() => {
    window.dispatchEvent(new Event('resize'));
    const resizeSubscription = component.winSizeSub;
    const observer = spyOn(component.resizeObserver, 'disconnect').and.callThrough();
    component.ngOnDestroy();
    tick(1000);
    expect(resizeSubscription.closed).toBe(true);
    expect(observer).toHaveBeenCalled();
    expect(recording.dispose.calls.count()).toBe(1);
    expect(recording.onprogress).toBe(null);
    expect(element.parentNode).toBe(null);
    expect(commandData.observed).toBe(false);
  }));

  it('initializes only once for the first input and waits for actual indexing completion', fakeAsync(() => {
    tick(2000);
    expect(recordingFactory.calls.count()).toBe(1);
    expect(component.rangeHideClass).toBe('hideCursor');
    recording.onload();
    expect(component.rangeHideClass).toBe('');
  }));

  it('releases the previous replay and ignores its seek completion after switching parts', fakeAsync(() => {
    component.percent = 500;
    component.runFrom();
    const complete = completions[0];
    component.replay = { src: '/next-recording', date_start: '2026-01-02T00:00:00Z' } as any;
    component.ngOnChanges({ replay: new SimpleChange(null, component.replay, false) });
    expect(recording.dispose.calls.count()).toBe(1);
    expect(commandData.observed).toBe(false);
    tick(50);
    expect(recordingFactory.calls.count()).toBe(2);
    expect(recordingFactory.calls.mostRecent().args[0].stream).toBeDefined();
    complete();
    expect(recording.play).not.toHaveBeenCalled();
    expect(component.isSeeking).toBe(false);
    expect(component.rangeHideClass).toBe('hideCursor');
  }));

  it('cancels delayed replay initialization when the component is destroyed', fakeAsync(() => {
    component.ngOnChanges({ replay: new SimpleChange(null, component.replay, false) });
    component.ngOnDestroy();
    tick(2000);
    expect(recordingFactory.calls.count()).toBe(1);
    expect(recording.dispose.calls.count()).toBe(1);
    expect(component.recording).toBe(null);
  }));

  it('keeps only the latest pending replay change', fakeAsync(() => {
    component.ngOnChanges({ replay: new SimpleChange(null, component.replay, false) });
    tick(25);
    component.ngOnChanges({ replay: new SimpleChange(null, component.replay, false) });
    tick(50);
    expect(recordingFactory.calls.count()).toBe(2);
    expect(recording.dispose.calls.count()).toBe(1);
  }));

  it('notifies the segmented player when recording loading fails', () => {
    const ready = spyOn(component.ready, 'emit');
    recording.onerror('Browser storage is unavailable.');
    expect(ready).toHaveBeenCalled();
    expect(component.recordingError).toContain('storage');
    component.toggle();
    component.restart();
    expect(recording.play).not.toHaveBeenCalled();
    expect(recording.seek).not.toHaveBeenCalled();
  });

  it('resumes the latest seek only when playback was requested', () => {
    recording.onprogress(1000);
    component.percent = 100;
    component.runFrom();
    component.pause();
    completions[0]();
    recording.onprogress(2000);
    expect(recording.play.calls.count()).toBe(1);
    expect(component.isPlaying).toBe(false);
    expect(component.isSeeking).toBe(false);
  });

  it('removes mobile gesture listeners when the replay is released', () => {
    component.destroy();
    spyOnProperty(window, 'innerWidth').and.returnValue(500);
    component.initialize();
    const screen = component.screenRef;
    const seek = spyOn(component, 'runFrom');
    function touch(type: string, x: number) {
      const event = new Event(type);
      Object.defineProperty(event, type === 'touchend' ? 'changedTouches' : 'touches', {
        value: [{ clientX: x, clientY: 0 }]
      });
      screen.dispatchEvent(event);
    }
    touch('touchstart', 0);
    touch('touchend', 100);
    expect(seek.calls.count()).toBe(1);
    component.destroy();
    touch('touchstart', 0);
    touch('touchend', 100);
    expect(seek.calls.count()).toBe(1);
  });
});
