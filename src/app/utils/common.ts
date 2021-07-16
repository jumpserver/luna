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

export function groupByProp(xs, key) {
  return xs.reduce(function(rv, x) {
    (rv[x[key]] = rv[x[key]] || []).push(x);
    return rv;
  }, {});
}

export function canvasWaterMark({
    // 使用 ES6 的函数默认值方式设置参数的默认取值
    // 具体参见 https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Functions/Default_parameters
    container = document.body,
    width = '300px',
    height = '300px',
    textAlign = 'left',
    textBaseline = 'middle',
    font = '20px monaco, microsoft yahei',
    fillStyle = 'rgba(184, 184, 184, 0.8)',
    content = 'JumpServer',
    rotate = 30,
    zIndex = 1000
} = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.setAttribute('width', width);
  canvas.setAttribute('height', height);

  ctx.font = font;
  ctx.fillStyle = fillStyle;
  ctx.textAlign = <CanvasTextAlign>textAlign;
  ctx.textBaseline = <CanvasTextBaseline>textBaseline;

  ctx.translate(70, -80);
  ctx.rotate(Math.PI / 180 * rotate);
  ctx.fillText(content, parseFloat(width) / 2, parseFloat(height) / 2);

  const base64Url = canvas.toDataURL();
  const watermarkDiv = document.createElement('div');
  watermarkDiv.setAttribute('style', `
          position:absolute;
          top:0;
          left:0;
          width:100%;
          height:100%;
          z-index:${zIndex};
          pointer-events:none;
          background-repeat:repeat;
          background-image:url('${base64Url}')`
  );

  container.style.position = 'relative';
  container.insertBefore(watermarkDiv, container.firstChild);
}
