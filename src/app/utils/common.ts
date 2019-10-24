import {Terminal} from 'xterm';

export function groupBy(array, f) {
    const groups = {};
    array.forEach( function( o ) {
        const group = JSON.stringify( f(o) );
        groups[group] = groups[group] || [];
        groups[group].push( o );
    });
    return Object.keys(groups).map( function( group ) {
        return groups[group];
    });
}

export function newTerminal(fontSize?: number) {
  if (!fontSize || fontSize < 5 || fontSize > 50) {
    fontSize = 13;
  }
  const ua = navigator.userAgent.toLowerCase();
  let lineHeight = 1;
  if (ua.indexOf('windows') !== -1) {
    lineHeight = 1.2;
  }
  return new Terminal({
      fontFamily: 'monaco, Consolas, "Lucida Console", monospace',
      lineHeight: lineHeight,
      fontSize: fontSize,
      rightClickSelectsWord: true,
      theme: {
        background: '#1f1b1b'
      }
  });
}

export function getCookie(name: string): string {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            // Does this cookie string begin with the name we want?
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}
