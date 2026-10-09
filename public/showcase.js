(() => {
  const modes = ['app', 'pages', 'board'];
  const labels = { app: '体验 App', pages: '页面总览', board: '交互画板' };
  const descriptions = {
    app: '像使用 App 一样，直接点击体验完整流程。',
    pages: '浏览真实页面截图，点击任意页面查看或体验。',
    board: '按功能检查全部页面、入口与交互状态。',
  };
  const base = new URL('./', location.href);
  const frames = new Map();
  const buttons = [...document.querySelectorAll('[data-mode]')];
  const returnButton = document.getElementById('return-app');
  let activeMode = 'app';
  let appKind = 'app';
  let toastTimer;

  function appUrl(route = '#home', scene = null) {
    const url = new URL(base);
    if (scene !== null) url.searchParams.set('board-preview', scene);
    url.hash = route || '#home';
    return url;
  }

  function currentState() {
    const params = new URL(location.href).searchParams;
    const mode = modes.includes(params.get('view')) ? params.get('view') : 'app';
    const scene = params.has('scene') ? params.get('scene') : null;
    return { mode, scene, route: location.hash || '#home' };
  }

  function writeUrl(method = 'replace') {
    const url = new URL('showcase.html', base);
    url.searchParams.set('view', activeMode);
    if (activeMode === 'app') {
      const app = frames.get(appKind);
      if (appKind === 'preview') url.searchParams.set('scene', app.url.searchParams.get('board-preview') || 'default');
      url.hash = app?.url.hash || '#home';
    }
    if (url.href !== location.href) history[method === 'push' ? 'pushState' : 'replaceState'](null, '', url);
  }

  function updateDescription() {
    const preview = activeMode === 'app' && appKind === 'preview';
    document.getElementById('mode-description').textContent = preview
      ? '正在体验画板中的示例页面。'
      : descriptions[activeMode];
    returnButton.hidden = !preview;
  }

  function ensureFrame(key, url) {
    if (frames.has(key)) return frames.get(key);
    const panel = document.getElementById('panel-' + (key === 'preview' ? 'app' : key));
    const loading = document.createElement('div');
    loading.className = 'loading';
    loading.setAttribute('role', 'status');
    const spinner = document.createElement('span');
    spinner.className = 'spinner';
    spinner.setAttribute('aria-hidden', 'true');
    const message = document.createElement('p');
    message.textContent = '正在打开' + (key === 'preview' ? '示例页面' : labels[key]) + '…';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = '重新加载';
    retry.hidden = true;
    loading.append(spinner, message, retry);
    const frame = document.createElement('iframe');
    frame.title = key === 'preview' ? 'Oops 示例 App' : 'Oops ' + labels[key];
    frame.dataset.frame = key;
    const entry = { frame, loading, message, retry, url: new URL(url), timer: null, loaded: false };
    frames.set(key, entry);
    function startLoading() {
      entry.loaded = false;
      loading.hidden = false;
      retry.hidden = true;
      clearTimeout(entry.timer);
      entry.timer = setTimeout(() => {
        message.textContent = '加载时间较长，可以重新试一下。';
        retry.hidden = false;
      }, 15000);
    }
    entry.startLoading = startLoading;
    retry.addEventListener('click', () => {
      startLoading();
      frame.contentWindow.location.replace(entry.url.href);
    });
    frame.addEventListener('load', () => {
      if (frame.contentWindow.location.href === 'about:blank') return;
      entry.loaded = true;
      clearTimeout(entry.timer);
      loading.hidden = true;
      if (key === 'pages' || key === 'board') connectBoard(frame);
    });
    startLoading();
    frame.src = entry.url.href;
    panel.append(frame, loading);
    return entry;
  }

  function setAppTarget(url) {
    const kind = url.searchParams.has('board-preview') ? 'preview' : 'app';
    const entry = ensureFrame(kind, url);
    appKind = kind;
    if (entry.url.href !== url.href) {
      const sameScene = entry.url.search === url.search;
      entry.url = new URL(url);
      if (!sameScene) entry.startLoading();
      // Replacement avoids adding hidden iframe entries to the browser's history.
      entry.frame.contentWindow.location.replace(url.href);
    }
  }

  function show(mode, { method = 'push', target = null } = {}) {
    const previousFrame = activeMode === 'app' ? frames.get(appKind) : frames.get(activeMode);
    previousFrame?.frame.contentDocument?.activeElement?.blur?.();
    if (mode === 'app') {
      if (target) setAppTarget(target);
      else ensureFrame(appKind, appUrl());
    } else {
      ensureFrame(mode, new URL(mode === 'pages' ? 'board.html' : 'interactive-board.html', base));
    }
    activeMode = mode;
    for (const button of buttons) {
      const selected = button.dataset.mode === mode;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      document.getElementById('panel-' + button.dataset.mode).hidden = !selected;
    }
    for (const kind of ['app', 'preview']) {
      const entry = frames.get(kind);
      if (entry) {
        entry.frame.hidden = appKind !== kind;
        entry.loading.hidden = appKind !== kind || entry.loaded;
      }
    }
    updateDescription();
    if (method !== 'none') writeUrl(method);
    document.title = 'Oops · ' + labels[mode] + ' · 产品体验中心';
  }

  function connectBoard(frame) {
    const doc = frame.contentDocument;
    if (!doc || doc.documentElement.dataset.showcaseConnected) return;
    doc.documentElement.dataset.showcaseConnected = 'true';
    const external = doc.getElementById('external');
    if (external) external.textContent = '在 App 中体验 →';
    const appLink = doc.getElementById('app-link');
    if (appLink) appLink.textContent = '切换到 App →';
    doc.addEventListener('click', event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest?.('a[href]');
      if (!link) return;
      const url = new URL(link.href, base);
      if (url.origin !== base.origin) return;
      let mode;
      if (url.pathname === new URL('board.html', base).pathname) mode = 'pages';
      if (url.pathname === new URL('interactive-board.html', base).pathname) mode = 'board';
      if (url.pathname === base.pathname || url.pathname === new URL('index.html', base).pathname) mode = 'app';
      if (!mode) return;
      event.preventDefault();
      // Overview links resume the visitor's App; individual page links use isolated examples.
      show(mode, { target: mode === 'app' && link.id !== 'app-link' ? url : null });
    }, true);
  }

  buttons.forEach(button => {
    button.addEventListener('click', () => show(button.dataset.mode));
    button.addEventListener('keydown', event => {
      const index = buttons.indexOf(button);
      const next = event.key === 'ArrowRight' ? (index + 1) % buttons.length
        : event.key === 'ArrowLeft' ? (index + buttons.length - 1) % buttons.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : null;
      if (next === null) return;
      event.preventDefault();
      buttons[next].focus();
      show(buttons[next].dataset.mode);
    });
  });

  function restoreLocation() {
    const state = currentState();
    show(state.mode, { method: 'none', target: state.mode === 'app' ? appUrl(state.route, state.scene) : null });
  }
  window.addEventListener('popstate', restoreLocation);
  window.addEventListener('hashchange', restoreLocation);
  window.addEventListener('message', event => {
    if (event.origin !== base.origin || event.data?.type !== 'oops:route' || typeof event.data.href !== 'string') return;
    const entry = [...frames.entries()].find(([, value]) => value.frame.contentWindow === event.source);
    if (!entry || !['app', 'preview'].includes(entry[0])) return;
    const url = new URL(event.data.href, base);
    if (url.origin !== base.origin || url.pathname !== base.pathname) return;
    entry[1].url = url;
    if (activeMode === 'app' && appKind === entry[0]) writeUrl();
  });

  returnButton.addEventListener('click', () => {
    frames.get(appKind)?.frame.contentDocument?.activeElement?.blur?.();
    appKind = 'app';
    show('app');
  });
  document.querySelector('.skip-link').addEventListener('click', event => {
    event.preventDefault();
    document.getElementById('showcase-content').focus();
  });
  document.getElementById('share').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      const toast = document.getElementById('toast');
      toast.textContent = '链接已复制，可以发给朋友了';
      toast.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
    } catch {
      const dialog = document.getElementById('share-dialog');
      const input = document.getElementById('share-url');
      input.value = location.href;
      dialog.showModal();
      input.focus();
      input.select();
    }
  });
  document.getElementById('close-share').addEventListener('click', () => document.getElementById('share-dialog').close());

  restoreLocation();
  writeUrl();
  fetch(new URL('board-manifest.json', base)).then(response => {
    if (!response.ok) throw new Error('Unable to load page counts');
    return response.json();
  }).then(({ metadata }) => {
    for (const element of document.querySelectorAll('[data-count]')) {
      const count = metadata?.[element.dataset.count];
      if (Number.isInteger(count) && count > 0) element.textContent = count;
    }
  }).catch(() => { /* The current release counts remain available offline. */ });
})();
