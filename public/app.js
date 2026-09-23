// 前端交互逻辑：逐句实时流式翻译、语言检测、历史记录、快捷操作、主题切换

(function () {
  'use strict';

  // ---------- DOM 引用 ----------
  const $ = (id) => document.getElementById(id);
  const fromLang = $('fromLang');
  const toLang = $('toLang');
  const swapBtn = $('swapBtn');
  const autoToggle = $('autoTranslate');
  const inputText = $('inputText');
  const outputText = $('outputText');
  const charCount = $('charCount');
  const detectedLang = $('detectedLang');
  const translateBtn = $('translateBtn');
  const btnLabel = translateBtn.querySelector('.btn-label');
  const btnLoading = translateBtn.querySelector('.btn-loading');
  const clearBtn = $('clearBtn');
  const copyBtn = $('copyBtn');
  const messageBox = $('messageBox');
  const themeToggle = $('themeToggle');
  const resetBtn = $('resetBtn');
  const historyToggle = $('historyToggle');
  const historyClear = $('historyClear');
  const historyList = $('historyList');
  const historyCount = $('historyCount');

  const HISTORY_KEY = 'translation_history';
  const HISTORY_LIMIT = 50;
  // 百度免费版 QPS 约 1 次/秒，做最小请求间隔节流
  const MIN_GAP = 1100;
  const STREAM_DEBOUNCE = 260;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- 工具 ----------
  function escapeHtml(s) {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function countStats(text) {
    const trimmed = text.trim();
    if (!trimmed) return '0 字符';
    const total = trimmed.length;
    const cjk = (trimmed.match(/[\u4e00-\u9fff\u3040-\u30ff]/g) || []).length;
    const words = (trimmed.match(/[A-Za-z0-9]+/g) || []).length;
    return `共 ${total} 字符 · 中文 ${cjk} / 英文 ${words}`;
  }

  function showMessage(text, type) {
    messageBox.className = 'message' + (type ? ' ' + type : '');
    messageBox.textContent = text;
  }

  function setLoading(on) {
    translateBtn.disabled = on;
    btnLabel.hidden = on;
    btnLoading.hidden = !on;
  }

  function langName(code) {
    const map = { zh: '中文', en: '英文' };
    return map[code] || code;
  }

  // 句子分隔符
  const DELIMS = /[。！？；!?;\n]/;

  // 把文本切成「完整句 + 末尾未完成片段」
  function segmentize(text) {
    const complete = [];
    let buf = '';
    for (const ch of text) {
      buf += ch;
      if (DELIMS.test(ch)) {
        if (buf.trim()) complete.push(buf);
        buf = '';
      }
    }
    return { complete, partial: buf.trim() };
  }

  // ---------- 流式翻译状态 ----------
  let lines = []; // 已提交的完整句译文
  let liveLine = ''; // 正在输入的片段译文
  let liveTyped = ''; // 已请求的片段原文
  let doneCount = 0; // 已提交的完整句数
  let streamVersion = 0; // 版本号，用于作废清空/互换/手动翻译后早到的旧结果

  // ---------- 历史记录 ----------
  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function saveHistory(list) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, HISTORY_LIMIT)));
    } catch (e) {
      /* ignore */
    }
  }

  function addHistory(entry) {
    const list = getHistory().filter((h) => h.src !== entry.src || h.dst !== entry.dst);
    list.unshift(entry);
    saveHistory(list);
    renderHistory();
  }

  function renderHistory() {
    const list = getHistory();
    historyCount.textContent = list.length ? `(${list.length})` : '';
    historyList.innerHTML = '';

    if (!list.length) {
      const li = document.createElement('li');
      li.className = 'history-item';
      li.innerHTML = '<span class="h-meta">暂无历史记录</span>';
      historyList.appendChild(li);
      return;
    }

    list.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'history-item';
      const date = new Date(item.time).toLocaleTimeString('zh-CN', { hour12: false });
      li.innerHTML =
        '<div class="h-src">' + escapeHtml(item.src) + '</div>' +
        '<div class="h-dst">' + escapeHtml(item.dst) + '</div>' +
        '<div class="h-meta">' + langName(item.from) + ' → ' + langName(item.to) + ' · ' + date + '</div>';
      li.addEventListener('click', () => {
        inputText.value = item.src;
        fromLang.value = item.from;
        toLang.value = item.to;
        resetStream();
        outputText.textContent = item.dst;
        outputText.classList.remove('placeholder');
        copyBtn.disabled = false;
        updateCount();
        showMessage('已从历史记录回填，点击翻译即可重新生成。');
      });
      historyList.appendChild(li);
    });
  }

  function toggleHistory(open) {
    historyList.hidden = !open;
    historyToggle.setAttribute('aria-expanded', String(open));
  }

  // ---------- 主题 ----------
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('theme', theme);
    } catch (e) {
      /* ignore */
    }
  }

  // ---------- 渲染输出 ----------
  function renderOutput() {
    const has = lines.length > 0 || liveLine;
    if (has) {
      const out = lines.concat(liveLine ? [liveLine] : []).join('\n');
      outputText.textContent = out;
      copyBtn.disabled = false;
    } else {
      outputText.innerHTML = '<span class="placeholder">翻译结果会在这里呈现…</span>';
      copyBtn.disabled = true;
    }
  }

  // ---------- 请求百度（带节流队列） ----------
  async function requestBaidu(q, from, to) {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, from, to }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      const err = new Error(data.error || '翻译失败');
      err.code = data.error_code;
      throw err;
    }
    return data;
  }

  let queue = [];
  let pumping = false;
  let lastRequestTs = 0;

  function enqueue(task) {
    queue.push(task);
    pump();
  }

  async function pump() {
    if (pumping) return;
    pumping = true;
    while (queue.length) {
      const task = queue.shift();
      const since = Date.now() - lastRequestTs;
      if (since < MIN_GAP) await sleep(MIN_GAP - since);
      try {
        const data = await requestBaidu(task.q, task.from, task.to);
        lastRequestTs = Date.now();
        detectedLang.textContent = data.from
          ? `检测到原文：${langName(data.from)}`
          : '';
        task.onResult((data.result || []).join('\n'));
        showMessage('');
      } catch (e) {
        lastRequestTs = Date.now();
        showMessage(e.message || '网络异常，请稍后重试。');
        task.onError && task.onError();
      }
    }
    pumping = false;
  }

  // ---------- 流式处理 ----------
  let streamTimer = null;

  function scheduleStream() {
    if (streamTimer) clearTimeout(streamTimer);
    streamTimer = setTimeout(runStream, STREAM_DEBOUNCE);
  }

  function runStream() {
    if (!autoToggle.checked) return;
    const text = inputText.value;
    if (!text.trim()) {
      clearLive();
      return;
    }
    const from = fromLang.value;
    const to = toLang.value;
    const { complete, partial } = segmentize(text);

    // 提交新出现的完整句（顺序翻译，按产生顺序追加）
    if (doneCount < complete.length) {
      const newSegs = complete.slice(doneCount);
      const v = streamVersion;
      newSegs.forEach(function (seg) {
        const segText = seg.trim();
        enqueue({
          q: segText,
          from,
          to,
          onResult: function (dst) {
            if (v !== streamVersion) return;
            lines.push(dst);
            renderOutput();
            scheduleHistory();
          },
        });
      });
      doneCount = complete.length;
    }

    // 处理末尾未完成片段：实时输出
    if (partial && partial !== liveTyped) {
      const v = streamVersion;
      liveTyped = partial;
      liveLine = '';
      renderOutput();
      enqueue({
        q: partial,
        from,
        to,
        onResult: (dst) => {
          if (v !== streamVersion) return;
          const cur = segmentize(inputText.value);
          if (cur.partial === partial) {
            liveLine = dst;
            renderOutput();
          }
        },
      });
    } else if (!partial) {
      clearLive();
    }
  }

  function clearLive() {
    if (liveLine || liveTyped) {
      liveLine = '';
      liveTyped = '';
      renderOutput();
    }
  }

  function resetStream() {
    lines = [];
    liveLine = '';
    liveTyped = '';
    doneCount = 0;
    streamVersion += 1;
  }

  // ---------- 历史（防抖保存） ----------
  let historyTimer = null;
  function scheduleHistory() {
    if (historyTimer) clearTimeout(historyTimer);
    historyTimer = setTimeout(commitHistory, 1600);
  }
  function commitHistory() {
    const src = inputText.value.trim();
    if (!src) return;
    const dst = outputText.textContent.trim();
    if (!dst) return;
    addHistory({
      src,
      dst,
      from: fromLang.value,
      to: toLang.value,
      time: Date.now(),
    });
  }

  // ---------- 手动翻译 ----------
  async function manualTranslate() {
    const q = inputText.value.trim();
    if (!q) {
      showMessage('请输入要翻译的内容。');
      inputText.focus();
      return;
    }
    setLoading(true);
    showMessage('');
    const from = fromLang.value;
    const to = toLang.value;
    try {
      const data = await requestBaidu(q, from, to);
      const dst = (data.result || []).join('\n');
      resetStream();
      lines = dst ? [dst] : [];
      renderOutput();
      detectedLang.textContent = data.from ? `检测到原文：${langName(data.from)}` : '';
      addHistory({ src: q, dst, from: data.from || from, to: data.to || to, time: Date.now() });
      showMessage('翻译完成', 'success');
    } catch (e) {
      showMessage(e.message || '翻译失败，请稍后重试。');
    } finally {
      setLoading(false);
    }
  }

  // ---------- 事件绑定 ----------
  translateBtn.addEventListener('click', manualTranslate);

  inputText.addEventListener('input', () => {
    updateCount();
    scheduleStream();
  });

  inputText.addEventListener('blur', () => {
    if (historyTimer) clearTimeout(historyTimer);
    commitHistory();
  });

  autoToggle.addEventListener('change', () => {
    if (autoToggle.checked) scheduleStream();
  });

  function updateCount() {
    charCount.textContent = countStats(inputText.value);
  }

  clearBtn.addEventListener('click', () => {
    inputText.value = '';
    resetStream();
    renderOutput();
    detectedLang.textContent = '';
    showMessage('');
    updateCount();
    inputText.focus();
  });

  resetBtn.addEventListener('click', () => {
    inputText.value = '';
    resetStream();
    renderOutput();
    detectedLang.textContent = '';
    showMessage('');
    fromLang.value = 'auto';
    toLang.value = 'zh';
    autoToggle.checked = true;
    swapBtn.disabled = true;
    updateCount();
    inputText.focus();
  });

  copyBtn.addEventListener('click', async () => {
    const text = inputText.value.trim() ? outputText.textContent : '';
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      const orig = copyBtn.textContent;
      copyBtn.textContent = '已复制 ✓';
      setTimeout(() => (copyBtn.textContent = orig), 1500);
    } catch (e) {
      showMessage('复制失败，请手动选择复制。');
    }
  });

  swapBtn.addEventListener('click', () => {
    if (fromLang.value === 'auto') return;
    const f = fromLang.value;
    const t = toLang.value;
    fromLang.value = t;
    toLang.value = f;
    const tmpSrc = inputText.value;
    inputText.value = outputText.textContent && !outputText.classList.contains('placeholder') ? outputText.textContent : '';
    if (inputText.value) {
      outputText.innerHTML = escapeHtml(tmpSrc);
      outputText.classList.remove('placeholder');
      copyBtn.disabled = false;
    } else {
      outputText.innerHTML = '<span class="placeholder">翻译结果会在这里呈现…</span>';
      copyBtn.disabled = true;
    }
    resetStream();
    detectedLang.textContent = '';
    showMessage('');
    updateCount();
    if (autoToggle.checked) scheduleStream();
  });

  fromLang.addEventListener('change', () => {
    detectedLang.textContent = '';
  });

  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

  historyToggle.addEventListener('click', () => {
    toggleHistory(historyList.hidden);
  });

  historyClear.addEventListener('click', () => {
    saveHistory([]);
    renderHistory();
    showMessage('历史记录已清空。', 'success');
  });

  // 快捷键：Ctrl/Cmd + Enter 翻译，Ctrl/Cmd + K 清空
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      manualTranslate();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      clearBtn.click();
    }
  });

  // ---------- 初始化 ----------
  updateCount();
  renderHistory();
  renderOutput();
  swapBtn.disabled = fromLang.value === 'auto';
})();