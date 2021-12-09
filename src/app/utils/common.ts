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

export function truncateCenter(s: string, l: number) {
  if (s.length <= l) {
    return s;
  }
  const centerIndex = Math.ceil(l  / 2);
  return s.slice(0, centerIndex - 2) + '...' + s.slice(centerIndex + 1, l);
}

export function canvasWaterMark({
    // 使用 ES6 的函数默认值方式设置参数的默认取值
    // 具体参见 https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Functions/Default_parameters
    container = document.body,
    width = 300,
    height = 300,
    textAlign = 'center',
    textBaseline = 'middle',
    alpha = 0.3,
    font = '20px monaco, microsoft yahei',
    fillStyle = 'rgba(184, 184, 184, 0.8)',
    content = 'JumpServer',
    rotate = -45,
    zIndex = 1000
} = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = width;
  canvas.height = height;
  ctx.globalAlpha = 0.5;

  ctx.font = font;
  ctx.fillStyle = fillStyle;
  ctx.textAlign = <CanvasTextAlign>textAlign;
  ctx.textBaseline = <CanvasTextBaseline>textBaseline;
  ctx.globalAlpha = alpha;

  ctx.translate(0.5 * width, 0.5 * height);
  ctx.rotate((rotate * Math.PI) / 180);

  function generateMultiLineText(_ctx: CanvasRenderingContext2D, _text: string, _width: number, _lineHeight: number) {
    const words = _text.split('\n');
    let line = '';
    const x = 0;
    let y = 0;

    for (let n = 0; n < words.length; n++) {
      line = words[n];
      line = truncateCenter(line, 25);
      _ctx.fillText(line, x, y);
      y += _lineHeight;
    }
  }
  generateMultiLineText(ctx, content, width, 24);

  const base64Url = canvas.toDataURL();
  const watermarkDiv = document.createElement('div');
  const config = { attributes: true, characterData: true };

  // 监听dom节点的style属性变化
  const observer = new MutationObserver(mutations => {
    const record = mutations[0];
    if (record.type === 'attributes' && record.attributeName === 'style') {
      setTimeout(() => {
        observer.disconnect();
        // 重新添加水印
        watermarkDiv.style.backgroundImage = `url('${base64Url}')`;
        observer.observe(watermarkDiv, config);
      });
    }
  });
  observer.observe(watermarkDiv, config);

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

export function windowOpen(url) {
  const a = document.createElement('a');
  a.href = url;
  a.click();
  window.URL.revokeObjectURL(url);
}

export function zeroPad(num, minLength) {
  let str = num.toString();
  // Add leading zeroes until string is long enough
  while (str.length < minLength) {
    str = '0' + str;
  }
  return str;
}

export function formatTimeWithSeconds(seconds) {
  let hour = 0, minute = 0, second = 0;
  const ref = [3600, 60, 1];
  for (let i = 0; i < ref.length; i++) {
    const val = ref[i];
    while (val <= seconds) {
      seconds -= val;
      switch (i) {
        case 0:
          hour++;
          break;
        case 1:
          minute++;
          break;
        case 2:
          second++;
          break;
      }
    }
  }
  return [hour, minute, second];
}

export function formatTime(millis: number) {
  const totalSeconds = millis / 1000;
  const [hour, minute, second] = formatTimeWithSeconds(totalSeconds);
  let time = zeroPad(minute, 2) + ':' + zeroPad(second, 2);
  if (hour > 0) {
    time = zeroPad(hour, 2) + ':' + time;
  }
  return time;
}

/**
 * 判断用户有没有下载jumpServer
 * @param {string} url
 * @param {Function} fail 失败的回调
 */
export function launchLocalApp(url, fail) {
  if (!url) {
    return;
  }

  let isDone = false;
  let decideTimeOut = null;
  const aLink = document.createElement('iframe');
  aLink.style.display = 'none';
  aLink.src = url;
  document.body.appendChild(aLink);
  window.onblur = () => {
    if (decideTimeOut) {
      isDone = true;
    }
  };
  const curDone = function done() {
    isDone = false;
    clearTimeout(decideTimeOut);
    decideTimeOut = null;
    document.body.removeChild(aLink);
  };

  decideTimeOut = setTimeout(() => {
    if (isDone) {
      curDone();
    } else {
      fail();
      curDone();
    }
  }, 3000);
}
