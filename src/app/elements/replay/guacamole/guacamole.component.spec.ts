import {NgZone} from '@angular/core';
import {fakeAsync, tick} from '@angular/core/testing';
import {of} from 'rxjs';
import Guacamole from '@guacamole';
import {ElementReplayGuacamoleComponent} from './guacamole.component';

describe('Guacamole recording component', () => {
  let component: ElementReplayGuacamoleComponent;
  let recording: any;
  let container: HTMLElement;
  let element: HTMLElement;
  let duration: number;
  let playing: boolean;
  let position: number;
  let completions: Array<() => void>;

  beforeEach(() => {
    duration = 1000;
    position = 0;
    playing = false;
    completions = [];
    container = document.createElement('div');
    container.innerHTML = '<div id="player"><div id="display"><div id="screen"></div></div></div>';
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
    spyOn(Guacamole, 'SessionRecording').and.returnValue(recording);
    const zone = {run: callback => callback(), runOutsideAngular: callback => callback()} as any as NgZone;
    component = new ElementReplayGuacamoleComponent(
      {getCommandsData: () => of({results: []})} as any,
      {get: () => of('Seek to command')} as any,
      zone
    );
    component.replay = {src: '/recording', date_start: '2026-01-01T00:00:00Z'} as any;
    component.ngOnInit();
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
    expect(component.playerRef.className).toBe('');
    expect(recording.play).not.toHaveBeenCalled();
  });

  it('ignores a replaced seek completion and resumes only after the latest seek', () => {
    recording.onprogress(1000);
    component.percent = 100;
    component.runFrom();
    component.percent = 200;
    component.runFrom();
    completions[0]();
    expect(component.playerRef.className).toBe('seeking');
    expect(recording.play.calls.count()).toBe(1);
    completions[1]();
    expect(component.playerRef.className).toBe('');
    expect(recording.play.calls.count()).toBe(2);
  });

  it('cancels a pending seek while preserving a user pause', () => {
    component.pause();
    component.percent = 5000;
    component.runFrom();
    component.cancelSeek({stopPropagation: () => {}});
    duration = 6000;
    recording.onprogress(6000);
    expect(recording.seek).not.toHaveBeenCalled();
    expect(recording.cancel).toHaveBeenCalled();
    expect(recording.play).not.toHaveBeenCalled();
    expect(component.playerRef.className).toBe('');
  });

  it('stops autoplay and clears seeking when recording storage fails', () => {
    component.percent = 5000;
    component.runFrom();
    recording.onerror('Not enough browser storage to cache this recording.');
    recording.onprogress(6000);
    component.play();
    expect(component.recordingError).toContain('storage');
    expect(component.playerRef.className).toBe('');
    expect(recording.play).not.toHaveBeenCalled();
  });

  it('disposes recording resources and unsubscribes from resize on destruction', fakeAsync(() => {
    window.dispatchEvent(new Event('resize'));
    component.ngOnDestroy();
    tick(300);
    expect(component.winSizeSub.closed).toBe(true);
    expect(recording.dispose.calls.count()).toBe(1);
    expect(recording.onprogress).toBe(null);
    expect(element.parentNode).toBe(null);
  }));
});
