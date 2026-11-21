/* The "under works" page: it asks /api/health every 15 seconds while the tab is visible, and goes back to the app (/) as soon
   as the server answers. The logic is a function of its environment so it can be tested without a browser. */
(function (root) {
  'use strict';

  var PERIOD_MS = 15000;

  /** The environment of the page; `env` is replaceable in tests. */
  function createWatcher(env) {
    var timer = null;
    var busy = false;

    function ask() {
      if (busy) return Promise.resolve('busy');
      busy = true;
      env.onChecking();
      return env
        .fetch('/api/health', { cache: 'no-store' })
        .then(function (res) {
          return res && res.ok ? 'back' : 'off';
        })
        .catch(function () {
          return 'off';
        })
        .then(function (state) {
          busy = false;
          if (state === 'back') env.go('/');
          else env.onOff(env.now());
          return state;
        });
    }

    function schedule() {
      stop();
      timer = env.setInterval(function () {
        if (env.isVisible()) ask();
      }, PERIOD_MS);
    }
    function stop() {
      if (timer !== null) env.clearInterval(timer);
      timer = null;
    }

    return {
      /** Checks now (start, retry button, tab visible again) and keeps checking. */
      start: function () {
        schedule();
        return ask();
      },
      check: ask,
      stop: stop,
    };
  }

  function languageOf(navigatorLanguages) {
    var first = (navigatorLanguages && navigatorLanguages[0]) || '';
    return String(first).toLowerCase().indexOf('es') === 0 ? 'es' : 'en';
  }

  root.ObrasPage = { createWatcher: createWatcher, languageOf: languageOf, PERIOD_MS: PERIOD_MS };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ObrasPage;
  if (typeof document === 'undefined') return;

  // ---- the browser wiring ----
  var doc = document;
  doc.documentElement.lang = languageOf(navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]);

  function show(state) {
    var items = doc.querySelectorAll('[data-state]');
    for (var i = 0; i < items.length; i++) items[i].hidden = items[i].getAttribute('data-state') !== state;
  }
  var retry = doc.querySelector('[data-retry]');

  var watcher = createWatcher({
    fetch: function (url, init) {
      return root.fetch(url, init);
    },
    now: function () {
      return new Date();
    },
    isVisible: function () {
      return doc.visibilityState === 'visible';
    },
    go: function (path) {
      root.location.replace(path);
    },
    setInterval: function (fn, ms) {
      return root.setInterval(fn, ms);
    },
    clearInterval: function (id) {
      root.clearInterval(id);
    },
    onChecking: function () {
      if (retry) retry.disabled = true;
    },
    onOff: function (when) {
      if (retry) retry.disabled = false;
      var times = doc.querySelectorAll('[data-time]');
      for (var i = 0; i < times.length; i++) {
        times[i].textContent = when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        times[i].setAttribute('datetime', when.toISOString());
      }
      show('off');
    },
  });

  if (retry) retry.addEventListener('click', function () { watcher.check(); });
  doc.addEventListener('visibilitychange', function () {
    if (doc.visibilityState === 'visible') watcher.check();
  });
  show('waiting');
  watcher.start();
})(typeof window !== 'undefined' ? window : globalThis);
