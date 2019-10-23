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
