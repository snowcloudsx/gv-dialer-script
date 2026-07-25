// ==UserScript==
// @name         Google Voice — Glass Dialer Loader
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Loader for Google Voice Glass Dialer — fetches latest version from GitHub
// @match        https://voice.google.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      raw.githubusercontent.com
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';
  const SCRIPT_URL = 'https://raw.githubusercontent.com/snowcloudsx/gv-dialer-script/main/gvautodialer.js';
  function gmRequest(opts) {
    return new Promise((resolve, reject) => {
      const req = (typeof GM_xmlhttpRequest === 'function') ? GM_xmlhttpRequest : (typeof GM !== 'undefined' && GM.xmlHttpRequest);
      if (!req) { fetch(opts.url).then(r => r.text()).then(resolve).catch(reject); return; }
      req({ method: opts.method || 'GET', url: opts.url, onload: (r) => resolve(r.responseText), onerror: reject, ontimeout: () => reject(new Error('timeout')) });
    });
  }
  gmRequest({ url: SCRIPT_URL }).then(code => {
    const fn = new Function(code);
    fn();
  }).catch(err => {
    console.error('[GV Dialer Loader] Failed to load script:', err);
  });
})();
