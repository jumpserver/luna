import {Terminal} from 'xterm';
import {TreeNode} from '@app/model';

export function groupBy(array, f) {
  const groups = {};
  array.forEach(function (o) {
    const group = JSON.stringify(f(o));
    groups[group] = groups[group] || [];
    groups[group].push(o);
  });
  return Object.keys(groups).map(function (group) {
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

export function setCookie(name, value, seconds) {
  const d = new Date();
  d.setTime(d.getTime() + seconds * 1000);
  const expires = 'expires=' + d.toUTCString();
  document.cookie = name + '=' + value + '; ' + expires;
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

export function getCsrfTokenFromCookie(): string {
  let prefix = getCookie('SESSION_COOKIE_NAME_PREFIX');
  if (!prefix || [`""`, `''`].indexOf(prefix) > -1) {
    prefix = '';
  }
  const name = `${prefix}csrftoken`;
  return getCookie(name);
}

export function groupByProp(xs, key) {
  return xs.reduce(function (rv, x) {
    (rv[x[key]] = rv[x[key]] || []).push(x);
    return rv;
  }, {});
}

export function truncateCenter(s: string, l: number) {
  if (s.length <= l) {
    return s;
  }
  const centerIndex = Math.ceil(l / 2);
  return s.slice(0, centerIndex - 2) + '...' + s.slice(centerIndex + 1, l);
}

function createWatermarkDiv(content, {
  width = 300,
  height = 300,
  textAlign = 'center',
  textBaseline = 'middle',
  alpha = 0.3,
  font = '20px monaco, microsoft yahei',
  fillStyle = 'rgba(184, 184, 184, 0.8)',
  rotate = -45,
  zIndex = 1000
}) {
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
  return {watermark: watermarkDiv, base64: base64Url};
}

export function canvasWaterMark({
                                  // 使用 ES6 的函数默认值方式设置参数的默认取值
                                  // 具体参见 https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Functions/Default_parameters
                                  container = document.body,
                                  content = 'JumpServer',
                                  settings = {}
                                } = {}) {

  container.style.position = 'relative';
  const res = createWatermarkDiv(content, settings);
  const watermarkDiv = res.watermark;
  container.insertBefore(watermarkDiv, container.firstChild);

  const config = {childList: true, attributes: true, subtree: true};
  // 监听dom节点的style属性变化
  const observer = new MutationObserver(mutations => {
    console.log('Fond style changed, re-render watermark.');
    setTimeout(() => {
      const parent = watermarkDiv.parentElement;
      parent.removeChild(watermarkDiv);
      canvasWaterMark({container, content, settings});
    });
  });
  observer.observe(watermarkDiv, config);

  const containerObserver = new MutationObserver(mutations => {
    const removed = mutations.filter(m => m.type === 'childList' && m.removedNodes.length > 0);
    if (removed.length === 0) {
      return;
    }
    const removedNodes = removed[0].removedNodes;
    if (removedNodes.length === 0) {
      return;
    }
    const removedHtml = removedNodes[0]['outerHTML'];
    if (removedHtml.indexOf(res.base64) < 0) {
      return;
    }
    setTimeout(() => {
      canvasWaterMark({container, content, settings});
    });
  });
  containerObserver.observe(container, config);
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
  }, 2000);
}

/**
 * 打开新页卡
 * @param {Object} node
 * @param {String} newWindowMode
 */
export function connectOnNewPage(node: TreeNode, newWindowMode?: string) {
  const url = `/luna/connect?login_to=${node.id}&type=${node.meta.type}`;
  let params = 'toolbar=yes,scrollbars=yes,resizable=yes';
  if (newWindowMode === 'auto') {
    let count: number;
    let top = 50;
    count = parseInt(window.sessionStorage.getItem('newWindowCount'), 10);
    if (isNaN(count)) {
      count = 0;
    }
    let left = 100 + count * 100;
    if (left + screen.width / 3 > screen.width) {
      // 支持两排足以
      top = screen.height / 3;
      count = 1;
      left = 100;
    }
    params = params + `,top=${top},left=${left},width=${screen.width / 3},height=${screen.height / 3}`;
    window.sessionStorage.setItem('newWindowCount', `${count + 1}`);
    window.open(url, '_blank', params);
  } else if (newWindowMode === 'new') {
    params = params + `,top=50,left=100,width=${window.innerWidth},height=${window.innerHeight}`;
    window.open(url, '_blank', params);
  } else {
    window.open(url, '_blank');
  }
}

export function getQueryParamFromURL(queryKey) {
  let result = null,
    tmp = [];
  location.search
    .substr(1)
    .split('&')
    .forEach(function (item) {
      tmp = item.split('=');
      if (tmp[0] === queryKey) {
        result = tmp[1];
      }
    });
  return result;
}
