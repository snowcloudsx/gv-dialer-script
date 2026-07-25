// ==UserScript==
// @name         Google Voice — Glass Dialer
// @namespace    http://tampermonkey.net/
// @version      6.8.8
// @description  Autodialer panel with tabbed UI, post-call popup, and backend lead sync
// @match        https://voice.google.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @grant        GM_info
// @connect      127.0.0.1
// @connect      localhost
// @connect      *
// @updateURL    https://raw.githubusercontent.com/snowcloudsx/gv-dialer-script/main/gvautodialer.js.meta.js
// @downloadURL  https://raw.githubusercontent.com/snowcloudsx/gv-dialer-script/main/gvautodialer.js
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  // ── Voice Greeting: inject into call's WebRTC audio ──
  const _gvPCs = [];
  // patch RTCPeerConnection on the PAGE's window (unsafeWindow) — no CSP issues
  (function () {
    try {
      var uw = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
      var _o = uw.RTCPeerConnection || uw.webkitRTCPeerConnection;
      if (!_o) return;
      uw.RTCPeerConnection = function (c) {
        var p = new _o(c);
        _gvPCs.push(p);
        return p;
      };
      uw.RTCPeerConnection.prototype = _o.prototype;
      Object.getOwnPropertyNames(_o).forEach(function (k) {
        if (typeof _o[k] === 'function') try { uw.RTCPeerConnection[k] = _o[k]; } catch (e) {}
      });
    } catch (e) { console.warn('GV Greeting: patch failed', e); }
  })();

  const DEFAULT_API_URL = 'https://gv-dialer-production.up.railway.app';
  function getApiUrl() { return localStorage.getItem('gv-api-url') || DEFAULT_API_URL; }

  const THEMES = {
    glass: {
      label: 'Glass',
      font: "'Inter', system-ui, sans-serif",
      fontImport: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap',
      bg: 'rgba(18, 10, 40, 0.78)',
      border: 'rgba(160, 120, 255, 0.22)',
      text: '#e8e0ff',
      muted: 'rgba(200,180,255,0.45)',
      accent: '#a855f7',
      accentSoft: 'rgba(168,85,247,0.2)',
      startBg: 'rgba(52,211,153,0.2)', startBd: 'rgba(52,211,153,0.35)', startFg: '#6ee7b7',
      stopBg: 'rgba(239,68,68,0.2)', stopBd: 'rgba(239,68,68,0.35)', stopFg: '#fca5a5',
      radius: '18px'
    },
    midnight: {
      label: 'Midnight',
      font: "'DM Sans', system-ui, sans-serif",
      fontImport: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap',
      bg: 'rgba(8, 12, 24, 0.92)',
      border: 'rgba(56, 189, 248, 0.22)',
      text: '#e2e8f0',
      muted: 'rgba(148,163,184,0.7)',
      accent: '#38bdf8',
      accentSoft: 'rgba(56,189,248,0.18)',
      startBg: 'rgba(34,197,94,0.18)', startBd: 'rgba(34,197,94,0.35)', startFg: '#86efac',
      stopBg: 'rgba(248,113,113,0.18)', stopBd: 'rgba(248,113,113,0.35)', stopFg: '#fca5a5',
      radius: '12px'
    },
    forest: {
      label: 'Forest',
      font: "'Source Sans 3', system-ui, sans-serif",
      fontImport: 'https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600&display=swap',
      bg: 'rgba(12, 24, 18, 0.9)',
      border: 'rgba(74, 222, 128, 0.22)',
      text: '#ecfdf5',
      muted: 'rgba(167,243,208,0.55)',
      accent: '#4ade80',
      accentSoft: 'rgba(74,222,128,0.18)',
      startBg: 'rgba(74,222,128,0.2)', startBd: 'rgba(74,222,128,0.4)', startFg: '#bbf7d0',
      stopBg: 'rgba(251,146,60,0.2)', stopBd: 'rgba(251,146,60,0.35)', stopFg: '#fdba74',
      radius: '14px'
    },
    ocean: {
      label: 'Ocean',
      font: "'Nunito', system-ui, sans-serif",
      fontImport: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700&display=swap',
      bg: 'rgba(10, 28, 40, 0.9)',
      border: 'rgba(45, 212, 191, 0.25)',
      text: '#e0f2fe',
      muted: 'rgba(125,211,252,0.55)',
      accent: '#2dd4bf',
      accentSoft: 'rgba(45,212,191,0.18)',
      startBg: 'rgba(45,212,191,0.2)', startBd: 'rgba(45,212,191,0.4)', startFg: '#99f6e4',
      stopBg: 'rgba(244,114,182,0.2)', stopBd: 'rgba(244,114,182,0.35)', stopFg: '#f9a8d4',
      radius: '20px'
    },
    slate: {
      label: 'Slate',
      font: "'IBM Plex Sans', system-ui, sans-serif",
      fontImport: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&display=swap',
      bg: 'rgba(30, 32, 36, 0.94)',
      border: 'rgba(148, 163, 184, 0.28)',
      text: '#f1f5f9',
      muted: 'rgba(148,163,184,0.75)',
      accent: '#94a3b8',
      accentSoft: 'rgba(148,163,184,0.15)',
      startBg: 'rgba(100,116,139,0.25)', startBd: 'rgba(148,163,184,0.4)', startFg: '#e2e8f0',
      stopBg: 'rgba(127,29,29,0.35)', stopBd: 'rgba(248,113,113,0.35)', stopFg: '#fecaca',
      radius: '8px'
    },
    cyberpunk: {
      label: 'Cyberpunk',
      font: "'Space Grotesk', system-ui, sans-serif",
      fontImport: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&display=swap',
      bg: 'rgba(10, 8, 18, 0.94)',
      border: 'rgba(255, 0, 255, 0.28)',
      text: '#f5f3ff',
      muted: 'rgba(212,212,255,0.6)',
      accent: '#ff00ff',
      accentSoft: 'rgba(255,0,255,0.18)',
      startBg: 'rgba(0,255,170,0.2)', startBd: 'rgba(0,255,170,0.4)', startFg: '#7fffd4',
      stopBg: 'rgba(255,0,90,0.2)', stopBd: 'rgba(255,0,90,0.4)', stopFg: '#ff9dbd',
      radius: '10px'
    },

    crimson: {
      label: 'Crimson',
      font: "'Manrope', system-ui, sans-serif",
      fontImport: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700&display=swap',
      bg: 'rgba(28, 8, 12, 0.94)',
      border: 'rgba(239,68,68,0.3)',
      text: '#fff1f2',
      muted: 'rgba(254,202,202,0.55)',
      accent: '#ef4444',
      accentSoft: 'rgba(239,68,68,0.18)',
      startBg: 'rgba(34,197,94,0.18)', startBd: 'rgba(34,197,94,0.35)', startFg: '#bbf7d0',
      stopBg: 'rgba(239,68,68,0.22)', stopBd: 'rgba(239,68,68,0.4)', stopFg: '#fecaca',
      radius: '16px'
    },

    gold: {
      label: 'Gold',
      font: "'Outfit', system-ui, sans-serif",
      fontImport: 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;700&display=swap',
      bg: 'rgba(30, 24, 8, 0.92)',
      border: 'rgba(250,204,21,0.28)',
      text: '#fefce8',
      muted: 'rgba(253,224,71,0.6)',
      accent: '#facc15',
      accentSoft: 'rgba(250,204,21,0.18)',
      startBg: 'rgba(132,204,22,0.2)', startBd: 'rgba(132,204,22,0.35)', startFg: '#d9f99d',
      stopBg: 'rgba(220,38,38,0.2)', stopBd: 'rgba(220,38,38,0.35)', stopFg: '#fecaca',
      radius: '14px'
    },

    rose: {
      label: 'Rose',
      font: "'Poppins', system-ui, sans-serif",
      fontImport: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap',
      bg: 'rgba(40, 12, 28, 0.9)',
      border: 'rgba(244,114,182,0.28)',
      text: '#fff1f2',
      muted: 'rgba(251,207,232,0.6)',
      accent: '#f472b6',
      accentSoft: 'rgba(244,114,182,0.18)',
      startBg: 'rgba(74,222,128,0.2)', startBd: 'rgba(74,222,128,0.35)', startFg: '#bbf7d0',
      stopBg: 'rgba(244,63,94,0.22)', stopBd: 'rgba(244,63,94,0.4)', stopFg: '#fda4af',
      radius: '22px'
    },

    terminal: {
      label: 'Terminal',
      font: "'JetBrains Mono', monospace",
      fontImport: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap',
      bg: 'rgba(5, 10, 5, 0.96)',
      border: 'rgba(34,197,94,0.25)',
      text: '#86efac',
      muted: 'rgba(134,239,172,0.45)',
      accent: '#22c55e',
      accentSoft: 'rgba(34,197,94,0.12)',
      startBg: 'rgba(34,197,94,0.15)', startBd: 'rgba(34,197,94,0.3)', startFg: '#bbf7d0',
      stopBg: 'rgba(220,38,38,0.15)', stopBd: 'rgba(220,38,38,0.3)', stopFg: '#fca5a5',
      radius: '2px'
    },

    sunset: {
      label: 'Sunset',
      font: "'Sora', system-ui, sans-serif",
      fontImport: 'https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600&display=swap',
      bg: 'rgba(42, 18, 12, 0.9)',
      border: 'rgba(251,146,60,0.28)',
      text: '#fff7ed',
      muted: 'rgba(254,215,170,0.6)',
      accent: '#fb923c',
      accentSoft: 'rgba(251,146,60,0.18)',
      startBg: 'rgba(250,204,21,0.2)', startBd: 'rgba(250,204,21,0.35)', startFg: '#fde68a',
      stopBg: 'rgba(239,68,68,0.2)', stopBd: 'rgba(239,68,68,0.35)', stopFg: '#fecaca',
      radius: '24px'
    },

    ice: {
      label: 'Ice',
      font: "'Plus Jakarta Sans', system-ui, sans-serif",
      fontImport: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;700&display=swap',
      bg: 'rgba(235, 248, 255, 0.08)',
      border: 'rgba(125,211,252,0.3)',
      text: '#f8fafc',
      muted: 'rgba(186,230,253,0.65)',
      accent: '#7dd3fc',
      accentSoft: 'rgba(125,211,252,0.18)',
      startBg: 'rgba(34,197,94,0.15)', startBd: 'rgba(34,197,94,0.3)', startFg: '#dcfce7',
      stopBg: 'rgba(239,68,68,0.15)', stopBd: 'rgba(239,68,68,0.3)', stopFg: '#fee2e2',
      radius: '26px'
    },

    dracula: {
      label: 'Dracula',
      font: "'Fira Sans', system-ui, sans-serif",
      fontImport: 'https://fonts.googleapis.com/css2?family=Fira+Sans:wght@400;500;600&display=swap',
      bg: 'rgba(40, 42, 54, 0.95)',
      border: 'rgba(189,147,249,0.28)',
      text: '#f8f8f2',
      muted: 'rgba(189,147,249,0.55)',
      accent: '#bd93f9',
      accentSoft: 'rgba(189,147,249,0.18)',
      startBg: 'rgba(80,250,123,0.18)', startBd: 'rgba(80,250,123,0.35)', startFg: '#caffbf',
      stopBg: 'rgba(255,85,85,0.18)', stopBd: 'rgba(255,85,85,0.35)', stopFg: '#ffadad',
      radius: '12px'
    },

    nord: {
      label: 'Nord',
      font: "'Rubik', system-ui, sans-serif",
      fontImport: 'https://fonts.googleapis.com/css2?family=Rubik:wght@400;500;700&display=swap',
      bg: 'rgba(46, 52, 64, 0.95)',
      border: 'rgba(136,192,208,0.26)',
      text: '#eceff4',
      muted: 'rgba(216,222,233,0.55)',
      accent: '#88c0d0',
      accentSoft: 'rgba(136,192,208,0.16)',
      startBg: 'rgba(163,190,140,0.18)', startBd: 'rgba(163,190,140,0.35)', startFg: '#d8dee9',
      stopBg: 'rgba(191,97,106,0.2)', stopBd: 'rgba(191,97,106,0.35)', stopFg: '#eceff4',
      radius: '10px'
    },

    amoled: {
      label: 'AMOLED',
      font: "'Inter', system-ui, sans-serif",
      fontImport: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap',
      bg: 'rgba(0,0,0,0.98)',
      border: 'rgba(255,255,255,0.08)',
      text: '#ffffff',
      muted: 'rgba(180,180,180,0.6)',
      accent: '#ffffff',
      accentSoft: 'rgba(255,255,255,0.08)',
      startBg: 'rgba(34,197,94,0.15)', startBd: 'rgba(34,197,94,0.3)', startFg: '#86efac',
      stopBg: 'rgba(239,68,68,0.15)', stopBd: 'rgba(239,68,68,0.3)', stopFg: '#fca5a5',
      radius: '6px'
    }
  };

  function loadTheme() {
    return localStorage.getItem('gv-theme') || 'glass';
  }

  function themeVars(t) {
    return `
      --gv-bg: ${t.bg};
      --gv-border: ${t.border};
      --gv-text: ${t.text};
      --gv-muted: ${t.muted};
      --gv-accent: ${t.accent};
      --gv-accent-soft: ${t.accentSoft};
      --gv-start-bg: ${t.startBg};
      --gv-start-bd: ${t.startBd};
      --gv-start-fg: ${t.startFg};
      --gv-stop-bg: ${t.stopBg};
      --gv-stop-bd: ${t.stopBd};
      --gv-stop-fg: ${t.stopFg};
      --gv-radius: ${t.radius};
      --gv-font: ${t.font};
    `;
  }

  function buildCSS(themeKey) {
    const t = THEMES[themeKey] || THEMES.glass;
    return `
    @import url('${t.fontImport}');

    :root { ${themeVars(t)} }

    #gv-panel {
      position: fixed; z-index: 999999;
      top: 20px; right: 20px; width: 320px;
      border-radius: var(--gv-radius);
      background: var(--gv-bg);
      backdrop-filter: blur(24px) saturate(160%);
      -webkit-backdrop-filter: blur(24px) saturate(160%);
      border: 1px solid var(--gv-border);
      box-shadow: 0 12px 40px rgba(0,0,0,0.5);
      color: var(--gv-text);
      font-family: var(--gv-font);
      overflow: hidden;
      transition: opacity .25s, transform .25s;
      user-select: none;
    }
    #gv-panel.hidden {
      opacity: 0; transform: translateY(-10px) scale(0.97); pointer-events: none;
    }

    #gv-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 16px 12px;
      border-bottom: 1px solid var(--gv-border);
      cursor: move;
    }
    .gv-header-left { display: flex; align-items: center; gap: 9px; }
    #gv-dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--gv-accent); box-shadow: 0 0 8px var(--gv-accent);
      animation: gvpulse 2.5s ease-in-out infinite;
    }
    @keyframes gvpulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
    @keyframes gvrecpulse { 0%,100%{opacity:1} 50%{opacity:0.25} }
    .gv-recording { animation: gvrecpulse .8s ease-in-out infinite; color: #ef4444 !important; }

    .gv-title { font-size: 13px; font-weight: 600; color: var(--gv-text); }
    .gv-title-count { font-size: 10px; font-weight: 500; color: var(--gv-accent); margin-left: 6px; }

    .gv-close {
      width: 24px; height: 24px; border-radius: 7px;
      background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; font-size: 12px; color: rgba(255,255,255,0.4);
    }
    .gv-close:hover { background: var(--gv-accent-soft); color: var(--gv-text); }

    /* Tabs */
    #gv-tabs {
      display: flex; border-bottom: 1px solid var(--gv-border);
    }
    .gv-tab {
      flex: 1; padding: 9px 0; font-size: 11px; font-weight: 600;
      text-align: center; cursor: pointer; border: none; background: none;
      color: var(--gv-muted); font-family: inherit; transition: color .15s, box-shadow .15s;
    }
    .gv-tab:hover { color: var(--gv-text); }
    .gv-tab.active {
      color: var(--gv-text);
      box-shadow: inset 0 -2px 0 var(--gv-accent);
    }
    .gv-tab[data-tab="settings"] {
      flex: 0 0 auto; padding: 9px 12px; font-size: 14px;
    }

    .gv-tab-body { display: none; }
    .gv-tab-body.active { display: block; }

    .gv-section { padding: 12px 16px; border-bottom: 1px solid var(--gv-border); }
    .gv-section:last-child { border-bottom: none; }

    .gv-label {
      font-size: 10px; font-weight: 600; letter-spacing: 0.07em;
      color: var(--gv-muted); text-transform: uppercase; margin-bottom: 8px;
    }

    .gv-row { display: flex; align-items: center; justify-content: space-between; padding: 5px 0; }
    .gv-row-name { font-size: 12px; color: var(--gv-text); opacity: 0.9; }

    .gv-toggle { position: relative; width: 32px; height: 18px; }
    .gv-toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
    .gv-track {
      position: absolute; inset: 0; border-radius: 9px;
      background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.08);
      cursor: pointer;
    }
    .gv-track::after {
      content: ''; position: absolute; top: 2px; left: 2px;
      width: 12px; height: 12px; border-radius: 50%;
      background: rgba(255,255,255,0.35); transition: transform .2s, background .2s;
    }
    .gv-toggle input:checked + .gv-track { background: var(--gv-accent-soft); border-color: var(--gv-accent); }
    .gv-toggle input:checked + .gv-track::after { transform: translateX(14px); background: #fff; }

    #gv-vol {
      -webkit-appearance: none; appearance: none;
      width: 100%; height: 3px; border-radius: 2px; outline: none; cursor: pointer;
      background: linear-gradient(to right, var(--gv-accent) var(--v,70%), rgba(255,255,255,0.12) var(--v,70%));
    }
    #gv-vol::-webkit-slider-thumb {
      -webkit-appearance: none; width: 12px; height: 12px; border-radius: 50%;
      background: #fff; cursor: pointer;
    }
    #gv-vol-row { display: flex; align-items: center; gap: 10px; }
    #gv-vol-val { font-size: 11px; color: var(--gv-muted); min-width: 28px; text-align: right; }

    #gv-btns { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
    .gv-btn {
      border-radius: 10px; padding: 9px 8px; font-size: 11px; font-weight: 600;
      cursor: pointer; font-family: inherit; transition: background .15s, transform .1s;
    }
    .gv-btn:active { transform: scale(0.96); }
    .gv-btn-start { background: var(--gv-start-bg); border: 1px solid var(--gv-start-bd); color: var(--gv-start-fg); }
    .gv-btn-stop { background: var(--gv-stop-bg); border: 1px solid var(--gv-stop-bd); color: var(--gv-stop-fg); }
    .gv-btn-ghost { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09); color: var(--gv-muted); }
    .gv-btn-ghost:hover { background: rgba(255,255,255,0.10); color: var(--gv-text); }
    .gv-btn-accent { background: var(--gv-accent-soft); border: 1px solid var(--gv-border); color: var(--gv-text); }

    #gv-theme-row { display: flex; flex-wrap: wrap; gap: 5px; }
    .gv-theme-chip {
      font-size: 10px; padding: 5px 8px; border-radius: 999px; cursor: pointer;
      background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
      color: var(--gv-muted); font-family: inherit;
    }
    .gv-theme-chip.active { background: var(--gv-accent-soft); color: var(--gv-text); border-color: var(--gv-accent); }

    .gv-input {
      width: 100%; box-sizing: border-box; border-radius: 8px; padding: 8px 10px;
      background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.1);
      color: var(--gv-text); font-size: 11px; font-family: inherit; outline: none;
    }
    .gv-input:focus { border-color: var(--gv-accent); }

    #gv-dialer-status, #gv-log-summary, #gv-sync-status {
      margin-top: 8px; font-size: 10.5px; color: var(--gv-muted); text-align: center; min-height: 14px;
    }

    .gv-primary-btn {
      width: 100%; margin-top: 8px; border-radius: 10px; padding: 10px;
      background: var(--gv-accent-soft); border: 1px solid var(--gv-border);
      color: var(--gv-text); font-weight: 600; font-size: 12px; cursor: pointer; font-family: inherit;
    }
    .gv-primary-btn:hover { filter: brightness(1.15); }

    #gv-lead-list { max-height: 380px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
    #gv-lead-list::-webkit-scrollbar { width: 4px; }
    #gv-lead-list::-webkit-scrollbar-thumb { background: var(--gv-accent); border-radius: 2px; }

    .gv-lead-card {
      border-radius: 12px; padding: 10px; background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
    }
    .gv-lead-card.done { opacity: 0.4; }
    .gv-lead-card.active-call { outline: 2px solid var(--gv-accent); }
    .gv-lead-name { font-size: 12px; font-weight: 600; margin-bottom: 6px; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
    .gv-lead-fields { display: flex; flex-direction: column; gap: 3px; }
    .gv-lead-field { display: flex; gap: 6px; align-items: flex-start; font-size: 11px; color: var(--gv-muted); }
    .gv-lead-field-val.clickable { color: var(--gv-accent); cursor: pointer; }
    .gv-lead-actions { display: flex; gap: 6px; margin-top: 8px; }
    .gv-lead-act {
      flex: 1; border-radius: 8px; padding: 7px; font-size: 10px; font-weight: 600;
      cursor: pointer; font-family: inherit; border: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.04); color: var(--gv-muted);
    }
    .gv-outcome-badge {
      font-size: 9px; font-weight: 600; padding: 2px 6px; border-radius: 999px;
      background: var(--gv-accent-soft); border: 1px solid var(--gv-border); color: var(--gv-text);
    }

    #gv-fab {
      position: fixed; bottom: 24px; right: 24px; z-index: 999998;
      width: 52px; height: 52px; border-radius: 16px; border: none;
      background: var(--gv-bg); color: var(--gv-text); border: 1px solid var(--gv-border);
      box-shadow: 0 8px 28px rgba(0,0,0,0.45); cursor: pointer; font-size: 18px;
      display: flex; align-items: center; justify-content: center;
    }

    /* Post-call popup */
    #gv-popup-overlay {
      position: fixed; inset: 0; z-index: 1000000;
      background: rgba(0,0,0,0.6); backdrop-filter: blur(6px);
      display: none; align-items: center; justify-content: center;
    }
    #gv-popup-overlay.show { display: flex; }
    #gv-popup-box {
      border-radius: var(--gv-radius); padding: 28px 24px 20px;
      background: var(--gv-bg); border: 1px solid var(--gv-border);
      box-shadow: 0 16px 48px rgba(0,0,0,0.6);
      text-align: center; min-width: 260px;
      backdrop-filter: blur(24px) saturate(160%);
    }
    #gv-popup-title {
      font-size: 14px; font-weight: 600; color: var(--gv-text); margin-bottom: 6px;
    }
    #gv-popup-sub {
      font-size: 11px; color: var(--gv-muted); margin-bottom: 18px;
    }
    #gv-popup-btns {
      display: flex; flex-direction: column; gap: 8px;
    }
    .gv-popup-btn {
      border-radius: 10px; padding: 11px; font-size: 12px; font-weight: 600;
      cursor: pointer; font-family: inherit; border: 1px solid rgba(255,255,255,0.1);
      background: rgba(255,255,255,0.05); color: var(--gv-text); transition: background .15s;
    }
    .gv-popup-btn:hover { background: var(--gv-accent-soft); border-color: var(--gv-accent); }
    .gv-popup-btn.gv-popup-completed { border-color: rgba(52,211,153,0.4); color: #6ee7b7; }
    .gv-popup-btn.gv-popup-failed { border-color: rgba(239,68,68,0.4); color: #fca5a5; }
    .gv-popup-btn.gv-popup-wrong { border-color: rgba(251,191,36,0.4); color: #fde68a; }

    /* Active call panel */
    #gv-call-panel {
      position: fixed; bottom: 90px; right: 24px; z-index: 999998;
      width: 300px; border-radius: var(--gv-radius);
      background: var(--gv-bg); border: 1px solid var(--gv-accent);
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      backdrop-filter: blur(24px) saturate(160%);
      font-family: var(--gv-font); color: var(--gv-text);
      animation: gvfadein .2s ease;
    }
    @keyframes gvfadein { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    #gv-call-panel-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 14px; border-bottom: 1px solid var(--gv-border);
    }
    #gv-call-panel-title { font-size: 12px; font-weight: 600; color: var(--gv-accent); }
    .gv-call-panel-close {
      width: 20px; height: 20px; border-radius: 6px; display: flex; align-items: center; justify-content: center;
      background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
      cursor: pointer; font-size: 10px; color: rgba(255,255,255,0.4);
    }
    .gv-call-panel-close:hover { background: var(--gv-accent-soft); color: var(--gv-text); }
    #gv-call-panel-body { padding: 12px 14px; }
    #gv-call-panel-lead { font-size: 11px; line-height: 1.6; }
    #gv-call-panel-lead .gv-cpl-name { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
    #gv-call-panel-lead .gv-cpl-row { color: var(--gv-muted); }
    #gv-call-panel-lead .gv-cpl-val { color: var(--gv-text); }
    `;
  }

  const PANEL_HTML = `
    <div id="gv-header">
      <div class="gv-header-left">
        <div id="gv-dot"></div>
        <div class="gv-title">Voice</div>
      </div>
      <div class="gv-close" id="gv-close">✕</div>
    </div>
    <div id="gv-tabs">
      <button class="gv-tab active" data-tab="account">Account</button>
      <button class="gv-tab" data-tab="dialer">Dialer</button>
      <button class="gv-tab" data-tab="leads">Leads</button>
      <button class="gv-tab" data-tab="settings">⚙</button>
    </div>

    <div class="gv-tab-body active" data-tab-body="account">
      <div class="gv-section" id="gv-login-section">
        <div class="gv-label">Login</div>
        <div style="display:grid;gap:6px">
          <input class="gv-input" id="gv-username" placeholder="Username">
          <input class="gv-input" id="gv-password" type="password" placeholder="Password">
          <button class="gv-primary-btn" id="gv-login-btn" type="button">Log in</button>
        </div>
        <div id="gv-sync-status"></div>
      </div>
      <div class="gv-section" id="gv-loggedin-section" style="display:none">
        <div class="gv-label">Account</div>
        <div id="gv-user-name" style="font-size:12px;color:var(--gv-text);margin-bottom:8px"></div>
        <button class="gv-primary-btn" id="gv-sync-btn" type="button">Sync leads</button>
        <button class="gv-primary-btn" id="gv-logout-btn" type="button" style="margin-top:6px;background:rgba(255,255,255,0.04);border-color:rgba(255,255,255,0.08);color:var(--gv-muted);font-size:11px">Log out</button>
        <div id="gv-sync-status2" style="margin-top:8px;font-size:10.5px;color:var(--gv-muted);text-align:center;min-height:14px"></div>
      </div>
    </div>

    <div class="gv-tab-body" data-tab-body="dialer">
      <div class="gv-section">
        <div class="gv-label">Volume</div>
        <div id="gv-vol-row">
          <input type="range" id="gv-vol" min="0" max="100" value="70">
          <div id="gv-vol-val">70%</div>
        </div>
      </div>
      <div class="gv-section">
        <div class="gv-label">Settings</div>
        <div class="gv-row">
          <span class="gv-row-name">Auto Mute</span>
          <label class="gv-toggle"><input type="checkbox" id="gv-automute"><span class="gv-track"></span></label>
        </div>
        <div class="gv-row">
          <span class="gv-row-name">Double Call</span>
          <label class="gv-toggle"><input type="checkbox" id="gv-doublecall"><span class="gv-track"></span></label>
        </div>
        <div class="gv-row">
          <span class="gv-row-name">Pause on connect</span>
          <label class="gv-toggle"><input type="checkbox" id="gv-pauseconnect" checked><span class="gv-track"></span></label>
        </div>
      </div>
      <div class="gv-section">
        <div class="gv-label">Controls</div>
        <div id="gv-btns">
          <button class="gv-btn gv-btn-start" id="gv-start">▶ Start</button>
          <button class="gv-btn gv-btn-stop" id="gv-stop">■ Stop</button>
          <button class="gv-btn gv-btn-ghost" id="gv-call">📞 Call</button>
          <button class="gv-btn gv-btn-accent" id="gv-pause">⏸ Pause</button>
          <button class="gv-btn gv-btn-ghost" id="gv-skip">⏭ Skip</button>
          <button class="gv-btn gv-btn-ghost" id="gv-next">➡ Next</button>
        </div>
        <div id="gv-dialer-status"></div>
        <button class="gv-btn gv-btn-ghost" id="gv-dialer-send-channel" style="margin-top:7px;width:100%">📨 Send to Channel</button>
        <div id="gv-dialer-channel-status" style="font-size:10.5px;color:var(--gv-muted);text-align:center;min-height:14px;margin-top:2px"></div>
      </div>
      <div class="gv-section">
        <div class="gv-label">Voice Greeting</div>
        <div id="gv-greet-controls" style="display:flex;flex-wrap:wrap;gap:6px">
          <button class="gv-btn gv-btn-ghost" id="gv-greet-record" style="flex:1">🎤 Record</button>
          <button class="gv-btn gv-btn-ghost" id="gv-greet-play" style="flex:1;display:none">🔊 Play</button>
          <button class="gv-btn gv-btn-ghost" id="gv-greet-delete" style="padding:8px 10px;display:none">✕</button>
          <button class="gv-btn gv-btn-ghost" id="gv-greet-criminal" style="flex:1">🔊 Criminal</button>
        </div>
        <div id="gv-greet-status" style="font-size:10.5px;color:var(--gv-muted);text-align:center;min-height:14px;margin-top:4px"></div>
      </div>
      <div class="gv-section">
        <div class="gv-label">Log</div>
        <div id="gv-log-btns" style="display:grid;grid-template-columns:1fr 1fr;gap:7px">
          <button class="gv-btn gv-btn-ghost" id="gv-export-log">📥 Export</button>
          <button class="gv-btn gv-btn-ghost" id="gv-reset-progress">↺ Reset</button>
        </div>
        <div id="gv-log-summary"></div>
      </div>
    </div>

    <div class="gv-tab-body" data-tab-body="leads">
      <div class="gv-section">
        <div class="gv-label">Assigned leads <span class="gv-title-count" id="gv-lead-count"></span></div>
        <input class="gv-input" id="gv-lead-search" placeholder="Search name, phone, or email..." style="margin-bottom:8px">
        <div id="gv-lead-list"></div>
        <div id="gv-no-leads" style="text-align:center;padding:20px 0;font-size:11px;color:var(--gv-muted)">No leads loaded. Log in and sync.</div>
      </div>
    </div>

    <div class="gv-tab-body" data-tab-body="settings">
      <div class="gv-section">
        <div class="gv-label">Style</div>
        <div id="gv-theme-row"></div>
      </div>
      <div class="gv-section">
        <div class="gv-label">Server</div>
        <div class="gv-row">
          <span class="gv-row-name">API URL</span>
        </div>
        <input class="gv-input" id="gv-api-url" placeholder="https://your-server.com">
        <div id="gv-api-status" style="margin-top:6px;font-size:10.5px;color:var(--gv-muted);min-height:14px"></div>
      </div>
      <div class="gv-section">
        <div class="gv-label">Auto-Dial</div>
        <div class="gv-row">
          <span class="gv-row-name">Delay between calls (sec)</span>
          <input class="gv-input" id="gv-dial-delay" type="number" min="0" max="60" value="3" style="width:50px;text-align:center">
        </div>
        <div class="gv-row">
          <span class="gv-row-name">Skip voicemail</span>
          <label class="gv-toggle"><input type="checkbox" id="gv-skip-vm" checked><span class="gv-track"></span></label>
        </div>
      </div>
      <div class="gv-section">
        <div class="gv-label">Popup</div>
        <div class="gv-row">
          <span class="gv-row-name">Show after (sec)</span>
          <input class="gv-input" id="gv-popup-threshold" type="number" min="0" max="300" value="60" style="width:50px;text-align:center">
        </div>
        <div style="font-size:10px;color:var(--gv-muted);margin-top:4px">Calls shorter than this skip the popup</div>
      </div>
      <div class="gv-section">
        <div class="gv-label">Data</div>
        <button class="gv-primary-btn" id="gv-reset-position" type="button" style="margin-top:0">Reset panel position</button>
        <button class="gv-primary-btn" id="gv-clear-data" type="button" style="margin-top:6px;background:rgba(239,68,68,0.15);border-color:rgba(239,68,68,0.3);color:#fca5a5">Clear all local data</button>
      </div>
      <div class="gv-section" style="border-bottom:none">
        <div class="gv-label">About</div>
        <div style="font-size:11px;color:var(--gv-muted);line-height:1.6">
          Google Voice Glass Dialer v<span id="gv-settings-version">6.8.2</span><br>
          Auto-update enabled via server
        </div>
      </div>
    </div>

    <div id="gv-popup-overlay">
      <div id="gv-popup-box">
        <div id="gv-popup-title">Call ended</div>
        <div id="gv-popup-sub"></div>
        <div id="gv-popup-btns">
          <button class="gv-popup-btn gv-popup-completed" data-outcome="completed">Completed</button>
          <button class="gv-popup-btn gv-popup-failed" data-outcome="failed">Failed</button>
          <button class="gv-popup-btn gv-popup-wrong" data-outcome="wrong-number">SE Wrong Person</button>
        </div>
      </div>
    </div>

    <!-- Code input modal -->
    <div id="gv-code-modal" style="display:none;position:fixed;inset:0;z-index:1000001;background:rgba(0,0,0,0.6);backdrop-filter:blur(6px);align-items:center;justify-content:center">
      <div style="border-radius:var(--gv-radius);padding:20px;background:var(--gv-bg);border:1px solid var(--gv-border);box-shadow:0 16px 48px rgba(0,0,0,0.6);min-width:280px;max-width:320px;backdrop-filter:blur(24px) saturate(160%);text-align:center">
        <div style="font-size:13px;font-weight:600;color:var(--gv-text);margin-bottom:12px">Enter code from customer</div>
        <input id="gv-code-input" type="text" maxlength="6" style="width:100%;box-sizing:border-box;border-radius:10px;padding:12px;background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.1);color:var(--gv-text);font-size:20px;font-family:monospace;outline:none;text-align:center;letter-spacing:6px" placeholder="000000">
        <div style="display:flex;gap:8px;margin-top:12px">
          <button id="gv-code-cancel" type="button" style="flex:1;border-radius:10px;padding:10px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.05);color:var(--gv-muted)">Cancel</button>
          <button id="gv-code-submit" type="button" style="flex:1;border-radius:10px;padding:10px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;border:1px solid var(--gv-border);background:var(--gv-accent-soft);color:var(--gv-text)">Send</button>
        </div>
      </div>
    </div>

    <div id="gv-call-panel" style="display:none">
      <div id="gv-call-panel-header">
        <span id="gv-call-panel-drag" style="cursor:grab;user-select:none;font-size:14px;opacity:0.5;margin-right:6px;display:inline-flex;align-items:center">⠿</span>
        <span id="gv-call-panel-title">Active Call</span>
        <div class="gv-call-panel-close" id="gv-call-panel-close">✕</div>
      </div>
      <div id="gv-call-panel-body">
        <div id="gv-call-panel-lead"></div>
        <button class="gv-primary-btn" id="gv-send-channel" type="button" style="margin-top:8px">📨 Send to Channel</button>
        <div id="gv-channel-status" style="margin-top:6px;font-size:10.5px;color:var(--gv-muted);min-height:14px"></div>
      </div>
    </div>
  `;

    function gmRequest(opts) {
    return new Promise((resolve, reject) => {
      const req = (typeof GM_xmlhttpRequest === 'function')
        ? GM_xmlhttpRequest
        : (typeof GM !== 'undefined' && GM.xmlHttpRequest);
      if (!req) {
        fetch(opts.url, {
          method: opts.method || 'GET',
          headers: opts.headers || {},
          body: opts.data || undefined
        }).then(async r => {
          const responseType = opts.responseType || 'text';
          const data = responseType === 'arraybuffer' ? await r.arrayBuffer() : await r.text();
          resolve({ status: r.status, response: data, responseText: typeof data === 'string' ? data : '' });
        }).catch(reject);
        return;
      }
      req({
        method: opts.method || 'GET',
        url: opts.url,
        headers: opts.headers || {},
        data: opts.data || undefined,
        responseType: opts.responseType || 'text',
        onload: resolve,
        onerror: reject,
        ontimeout: () => reject(new Error('timeout'))
      });
    });
  }

  function makeDraggable(panel, handle) {
    let mx, my, dragging = false;
    handle.addEventListener('mousedown', e => {
      dragging = true; mx = e.clientX; my = e.clientY;
      panel.style.right = 'auto';
      panel.style.left = panel.getBoundingClientRect().left + 'px';
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      const ox = e.clientX - mx, oy = e.clientY - my;
      mx = e.clientX; my = e.clientY;
      panel.style.left = (panel.offsetLeft + ox) + 'px';
      panel.style.top = (panel.offsetTop + oy) + 'px';
    });
    document.addEventListener('mouseup', () => { dragging = false; });
  }

  function init() {
    console.log('[GV Dialer] v6.8.2 starting');
    let themeKey = loadTheme();
    const style = document.createElement('style');
    style.id = 'gv-style';
    style.textContent = buildCSS(themeKey);
    document.head.appendChild(style);

    const panel = document.createElement('div');
    panel.id = 'gv-panel';
    panel.innerHTML = PANEL_HTML;
    document.body.appendChild(panel);

    const fab = document.createElement('button');
    fab.id = 'gv-fab';
    fab.textContent = '📞';
    document.body.appendChild(fab);

    // ── Tabs ──
    const tabs = panel.querySelectorAll('.gv-tab');
    const tabBodies = panel.querySelectorAll('.gv-tab-body');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tabBodies.forEach(b => b.classList.remove('active'));
        tab.classList.add('active');
        panel.querySelector(`[data-tab-body="${tab.dataset.tab}"]`).classList.add('active');
      });
    });

    // ── Themes ──
    const themeRow = document.getElementById('gv-theme-row');
    Object.keys(THEMES).forEach(key => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'gv-theme-chip' + (key === themeKey ? ' active' : '');
      chip.textContent = THEMES[key].label;
      chip.addEventListener('click', () => {
        themeKey = key;
        localStorage.setItem('gv-theme', key);
        style.textContent = buildCSS(key);
        themeRow.querySelectorAll('.gv-theme-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      });
      themeRow.appendChild(chip);
    });

    // ── Volume ──
    const vol = document.getElementById('gv-vol');
    const volVal = document.getElementById('gv-vol-val');
    vol.style.setProperty('--v', vol.value + '%');
    vol.addEventListener('input', () => {
      volVal.textContent = vol.value + '%';
      vol.style.setProperty('--v', vol.value + '%');
    });

    // ── FAB / Close ──
    fab.addEventListener('click', () => panel.classList.toggle('hidden'));
    document.getElementById('gv-close').addEventListener('click', () => panel.classList.add('hidden'));

    // ── Auth state ──
    let authToken = localStorage.getItem('gv-auth-token') || '';
    function getStoredToken() { return authToken; }
    function setStoredToken(t) { authToken = t; localStorage.setItem('gv-auth-token', t); }
    function clearStoredToken() { authToken = ''; localStorage.removeItem('gv-auth-token'); }

    function setSyncStatus(text) {
      const el = document.getElementById('gv-sync-status');
      const el2 = document.getElementById('gv-sync-status2');
      if (el) el.textContent = text;
      if (el2) el2.textContent = text;
    }

    const loginSection = document.getElementById('gv-login-section');
    const loggedInSection = document.getElementById('gv-loggedin-section');

    function showLoggedIn(name) {
      loginSection.style.display = 'none';
      loggedInSection.style.display = '';
      document.getElementById('gv-user-name').textContent = 'Logged in as ' + name;
    }
    function showLoggedOut() {
      loginSection.style.display = '';
      loggedInSection.style.display = 'none';
    }

    document.getElementById('gv-username').value = localStorage.getItem('gv-username') || '';

    if (authToken) {
      showLoggedIn(localStorage.getItem('gv-username') || 'caller');
      setSyncStatus('Session restored');
    }

    document.getElementById('gv-login-btn').addEventListener('click', async () => {
      const username = document.getElementById('gv-username').value.trim();
      const password = document.getElementById('gv-password').value;
      localStorage.setItem('gv-username', username);
      if (!username || !password) {
        setSyncStatus('Enter username and password');
        return;
      }
      setSyncStatus('Logging in...');
      try {
        const res = await gmRequest({
          method: 'POST',
          url: getApiUrl() + '/api/login',
          headers: { 'Content-Type': 'application/json' },
          data: JSON.stringify({ username, password })
        });
        if (res.status === 401) {
          setSyncStatus('Invalid username or password');
          clearStoredToken();
          return;
        }
        if (res.status < 200 || res.status >= 300) {
          setSyncStatus('Login failed (' + res.status + ')');
          return;
        }
        const data = JSON.parse(res.responseText);
        if (data.token) {
          setStoredToken(data.token);
          document.getElementById('gv-password').value = '';
          showLoggedIn(data.name || username);
          setSyncStatus('Logged in');
          syncLeads();
        } else {
          setSyncStatus('Login failed - no token');
        }
      } catch (e) {
        setSyncStatus('Could not reach server');
        console.warn(e);
      }
    });

    document.getElementById('gv-logout-btn').addEventListener('click', () => {
      clearStoredToken();
      showLoggedOut();
      setSyncStatus('Logged out');
    });

    document.getElementById('gv-password').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('gv-login-btn').click();
    });

    // ── Settings restore ──
    ['gv-automute', 'gv-doublecall', 'gv-pauseconnect'].forEach(id => {
      const el = document.getElementById(id);
      const v = localStorage.getItem(id);
      if (v !== null) el.checked = v === '1';
      el.addEventListener('change', () => localStorage.setItem(id, el.checked ? '1' : '0'));
    });

    document.getElementById('gv-automute').addEventListener('change', e => {
      document.querySelectorAll('audio, video').forEach(el => { el.muted = e.target.checked; });
    });

    // ── Settings tab ──
    const apiUrlInput = document.getElementById('gv-api-url');
    const savedApiUrl = localStorage.getItem('gv-api-url') || getApiUrl();
    apiUrlInput.value = savedApiUrl;
    apiUrlInput.addEventListener('change', () => {
      const v = apiUrlInput.value.trim().replace(/\/+$/, '');
      if (v) localStorage.setItem('gv-api-url', v);
    });

    const dialDelayInput = document.getElementById('gv-dial-delay');
    dialDelayInput.value = localStorage.getItem('gv-dial-delay') || '3';
    dialDelayInput.addEventListener('change', () => {
      localStorage.setItem('gv-dial-delay', dialDelayInput.value);
    });

    const skipVmEl = document.getElementById('gv-skip-vm');
    const savedSkipVm = localStorage.getItem('gv-skip-vm');
    if (savedSkipVm !== null) skipVmEl.checked = savedSkipVm === '1';
    skipVmEl.addEventListener('change', () => localStorage.setItem('gv-skip-vm', skipVmEl.checked ? '1' : '0'));

    const popupThresholdInput = document.getElementById('gv-popup-threshold');
    popupThresholdInput.value = localStorage.getItem('gv-popup-threshold') || '60';
    popupThresholdInput.addEventListener('change', () => {
      localStorage.setItem('gv-popup-threshold', popupThresholdInput.value);
    });

    document.getElementById('gv-reset-position').addEventListener('click', () => {
      panel.style.top = '20px';
      panel.style.right = '20px';
      panel.style.left = 'auto';
    });

    document.getElementById('gv-clear-data').addEventListener('click', () => {
      if (!confirm('This will clear all local data (leads, call log, settings). Continue?')) return;
      const keep = { 'gv-theme': localStorage.getItem('gv-theme') };
      localStorage.clear();
      Object.entries(keep).forEach(([k, v]) => { if (v) localStorage.setItem(k, v); });
      location.reload();
    });

    // ── Leads ──
    function isCompleted(status) {
      return ['completed', 'sale', 'answered'].includes(status);
    }

    function findCardByLead(lead) {
      const cards = document.querySelectorAll('.gv-lead-card');
      for (const c of cards) {
        if (lead.id && c.dataset.leadId === String(lead.id)) return c;
        if (lead.phone && c.dataset.phone === lead.phone) return c;
      }
      return null;
    }

    function renderLeads(leads) {
      const list = document.getElementById('gv-lead-list');
      const noLeads = document.getElementById('gv-no-leads');
      const countEl = document.getElementById('gv-lead-count');
      const searchVal = (document.getElementById('gv-lead-search').value || '').trim().toLowerCase();
      list.innerHTML = '';

      const all = leads;
      const completed = all.filter(l => isCompleted(l._status));
      const sorted = getDialerLeads();
      const filtered = searchVal
        ? all.filter(l => {
            const hay = [l.name, l.phone, l.email, ...(l.addresses || [])].join(' ').toLowerCase();
            return hay.includes(searchVal);
          })
        : sorted;
      if (!filtered.length) {
        noLeads.style.display = '';
        noLeads.textContent = searchVal ? 'No matches for "' + searchVal + '"' : 'No leads loaded. Log in and sync.';
        countEl.textContent = searchVal ? '(0/' + all.length + ')' : '';
        return;
      }
      noLeads.style.display = 'none';
      const shown = filtered.length;
      const total = all.length;
      const hidden = completed.length;
      const prefix = searchVal ? shown + '/' + total : shown;
      const suffix = hidden ? ', ' + hidden + ' done' : '';
      countEl.textContent = '(' + prefix + suffix + ')';

      filtered.forEach((lead, i) => {
        const card = document.createElement('div');
        card.className = 'gv-lead-card' + (isCompleted(lead._status) ? ' done' : '');
        card.dataset.idx = i;
        if (lead.id) card.dataset.leadId = lead.id;
        if (lead.phone) card.dataset.phone = lead.phone;
        let fieldsHTML = '';
        if (lead.email) fieldsHTML += `<div class="gv-lead-field"><span>✉</span><span class="gv-lead-field-val">${lead.email}</span></div>`;
        if (lead.phone) fieldsHTML += `<div class="gv-lead-field"><span>📞</span><span class="gv-lead-field-val clickable gv-dial" data-phone="${lead.phone}">+${lead.phone}</span></div>`;
        (lead.addresses || []).forEach(addr => {
          fieldsHTML += `<div class="gv-lead-field"><span>📍</span><span class="gv-lead-field-val" style="white-space:normal;font-size:10.5px">${addr}</span></div>`;
        });
        card.innerHTML = `
          <div class="gv-lead-name">${lead.name || 'Unknown'}</div>
          <div class="gv-lead-fields">${fieldsHTML}</div>
          <div class="gv-lead-actions">
            <button class="gv-lead-act gv-dial-btn" data-phone="${lead.phone || ''}">📞 Call</button>
            <button class="gv-lead-act gv-done-btn">✓ Done</button>
          </div>`;
        list.appendChild(card);
      });

      list.querySelectorAll('.gv-dial, .gv-dial-btn').forEach(el => {
        el.addEventListener('click', () => {
          const phone = el.dataset.phone;
          if (phone) window.location.hash = '/calls/new?num=%2B' + phone;
        });
      });
      list.querySelectorAll('.gv-done-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const card = btn.closest('.gv-lead-card');
          card.classList.toggle('done');
          const idx = Number(card.dataset.idx);
          const lead = filtered[idx];
          if (lead) {
            if (lead._status) { delete lead._status; } else { lead._status = 'completed'; }
            saveLeads();
          }
        });
      });
    }

    async function syncLeads() {
      const token = getStoredToken();
      if (!token) { setSyncStatus('Please log in first'); return; }
      setSyncStatus('Syncing...');
      try {
        const res = await gmRequest({
          method: 'GET',
          url: getApiUrl() + '/api/leads',
          headers: { Authorization: 'Bearer ' + token }
        });
        if (res.status === 401) {
          setSyncStatus('Session expired - log in again');
          clearStoredToken();
          showLoggedOut();
          return;
        }
        if (res.status < 200 || res.status >= 300) {
          setSyncStatus('Sync failed (' + res.status + ')');
          return;
        }
        const data = JSON.parse(res.responseText);
        const oldLeads = JSON.parse(localStorage.getItem('gv-parsed-leads') || '[]');
        const oldStatus = {};
        oldLeads.forEach(l => { if (l._status) oldStatus[l.id || l.phone] = l._status; });
        const leads = (data.leads || []).map(l => {
          const existingStatus = oldStatus[l.id || l.phone];
          return {
            id: l.id,
            phone: l.phone,
            name: l.name || '',
            email: l.email || '',
            addresses: l.addresses || [],
            flagged: false,
            _status: existingStatus || undefined
          };
        });
        localStorage.setItem('gv-parsed-leads', JSON.stringify(leads));
        dialerIdx = 0;
        renderLeads(leads);
        setSyncStatus('Synced ' + leads.length + ' leads');
        try {
          const me = await gmRequest({
            method: 'GET',
            url: getApiUrl() + '/api/me',
            headers: { Authorization: 'Bearer ' + token }
          });
          if (me.status === 200) {
            const info = JSON.parse(me.responseText);
            showLoggedIn(info.name);
          }
        } catch { /* ignore */ }
      } catch (e) {
        setSyncStatus('Could not reach server');
        console.warn(e);
      }
    }

    document.getElementById('gv-sync-btn').addEventListener('click', syncLeads);

    // ── Lead search ──
    const leadSearchInput = document.getElementById('gv-lead-search');
    leadSearchInput.addEventListener('input', () => {
      const leads = JSON.parse(localStorage.getItem('gv-parsed-leads') || '[]');
      renderLeads(leads);
    });

    // Initial render
    const initLeads = JSON.parse(localStorage.getItem('gv-parsed-leads') || '[]');
    if (initLeads.length) renderLeads(initLeads);

    // ── Active call panel ──
    const callPanel = document.getElementById('gv-call-panel');
    const callPanelLead = document.getElementById('gv-call-panel-lead');
    const channelStatus = document.getElementById('gv-channel-status');

    function showCallPanel(lead) {
      if (!lead) return;
      let html = `<div class="gv-cpl-name">${lead.name || 'Unknown'}</div>`;
      if (lead.phone) html += `<div class="gv-cpl-row">📞 <span class="gv-cpl-val">+${lead.phone}</span></div>`;
      if (lead.email) html += `<div class="gv-cpl-row">✉ <span class="gv-cpl-val">${lead.email}</span></div>`;
      (lead.addresses || []).forEach(a => {
        html += `<div class="gv-cpl-row">📍 <span class="gv-cpl-val">${a}</span></div>`;
      });
      if (lead.notes) html += `<div class="gv-cpl-row">📝 <span class="gv-cpl-val">${lead.notes}</span></div>`;
      callPanelLead.innerHTML = html;
      callPanel.style.display = '';
      channelStatus.textContent = '';
    }

    function hideCallPanel() {
      callPanel.style.display = 'none';
    }

    document.getElementById('gv-call-panel-close').addEventListener('click', hideCallPanel);

    // Draggable call panel
    const panelHeader = document.getElementById('gv-call-panel-header');
    let dragOffX = 0, dragOffY = 0;
    function restorePanelPos() {
      const pos = localStorage.getItem('gv-panel-pos');
      if (pos) {
        const p = JSON.parse(pos);
        callPanel.style.bottom = 'auto'; callPanel.style.right = 'auto';
        callPanel.style.left = p.x + 'px'; callPanel.style.top = p.y + 'px';
      }
    }
    restorePanelPos();
    panelHeader.addEventListener('mousedown', e => {
      if (e.target.closest('.gv-call-panel-close')) return;
      if (e.button !== 0) return;
      e.preventDefault();
      const rect = callPanel.getBoundingClientRect();
      dragOffX = e.clientX - rect.left;
      dragOffY = e.clientY - rect.top;
      callPanel.style.transition = 'none';
      const onMove = me => {
        callPanel.style.bottom = 'auto';
        callPanel.style.right = 'auto';
        callPanel.style.left = Math.max(0, me.clientX - dragOffX) + 'px';
        callPanel.style.top = Math.max(0, me.clientY - dragOffY) + 'px';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp);
        const r = callPanel.getBoundingClientRect();
        localStorage.setItem('gv-panel-pos', JSON.stringify({ x: r.left, y: r.top }));
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    const codeModal = document.getElementById('gv-code-modal');
    const codeInput = document.getElementById('gv-code-input');
    const codeCancel = document.getElementById('gv-code-cancel');
    const codeSubmit = document.getElementById('gv-code-submit');
    let codeResolve = null;

    function showCodeModal() {
      return new Promise(resolve => {
        codeResolve = resolve;
        codeInput.value = '';
        codeModal.style.display = 'flex';
        codeInput.focus();
      });
    }
    function hideCodeModal() { codeModal.style.display = 'none'; codeResolve = null; }

    codeCancel.addEventListener('click', () => {
      const r = codeResolve;
      hideCodeModal();
      if (r) r(null);
    });
    codeSubmit.addEventListener('click', () => {
      const code = codeInput.value.trim();
      if (!code || code.length < 4) { codeInput.focus(); return; }
      const r = codeResolve;
      hideCodeModal();
      if (r) r(code);
    });
    codeInput.addEventListener('input', () => {
      codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
    });
    codeInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); codeSubmit.click(); }
      if (e.key === 'Escape') { codeCancel.click(); }
    });

    async function sendLeadToChannel(lead, statusEl) {
      if (!lead) { statusEl.textContent = 'No lead'; return; }
      const token = getStoredToken();
      if (!token) { statusEl.textContent = 'Not logged in'; return; }
      statusEl.textContent = 'Sending...';
      try {
        const res = await gmRequest({
          method: 'POST',
          url: getApiUrl() + '/api/notify',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          data: JSON.stringify({
            name: lead.name || 'Unknown',
            phone: lead.phone || '',
            email: lead.email || '',
            addresses: (lead.addresses || []).join(', '),
            notes: lead.notes || ''
          })
        });
        if (res.status < 200 || res.status >= 300) {
          statusEl.textContent = 'Send failed (' + res.status + ')';
          return;
        }
      } catch (e) {
        statusEl.textContent = 'Error sending';
        console.warn(e);
        return;
      }
      statusEl.textContent = 'Sent!';
      const code = await showCodeModal();
      if (!code) return;
      statusEl.textContent = 'Sending code...';
      try {
        const res = await gmRequest({
          method: 'POST',
          url: getApiUrl() + '/api/sendcode',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          data: JSON.stringify({ code })
        });
        statusEl.textContent = res.status >= 200 && res.status < 300 ? 'Sent! Code: ' + code : 'Code failed (' + res.status + ')';
      } catch (e) {
        statusEl.textContent = 'Code error';
        console.warn(e);
      }
    }

    document.getElementById('gv-send-channel').addEventListener('click', async () => {
      await sendLeadToChannel(currentLead, channelStatus);
    });

    // ── Dialer state ──
    let dialerRunning = false;
    let dialerPaused = false;
    let skipRequested = false;
    let dialerIdx = 0;
    let dialerLeads = [];
    let callLog = JSON.parse(localStorage.getItem('gv-call-log') || '[]');
    let currentLead = null;
    let callStartTime = 0;

    const RING_TIMEOUT_MS = 30000;
    function getLongCallMs() { return (Number(localStorage.getItem('gv-popup-threshold')) || 60) * 1000; }
    function getDialDelayMs() { return (Number(localStorage.getItem('gv-dial-delay')) || 3) * 1000; }

    function setDot(color, glow) {
      const d = document.getElementById('gv-dot');
      d.style.background = color;
      d.style.boxShadow = `0 0 8px ${glow}`;
      d.style.animation = 'none';
    }

    function setStatus(text) {
      const el = document.getElementById('gv-dialer-status');
      if (el) el.textContent = text;
    }

    function sleep(ms) {
      return new Promise(resolve => {
        const step = 200;
        let elapsed = 0;
        const iv = setInterval(() => {
          elapsed += step;
          if ((!dialerRunning && !dialerPaused) || elapsed >= ms) {
            clearInterval(iv); resolve();
          }
        }, step);
      });
    }

    async function waitWhilePaused() {
      while (dialerPaused && dialerRunning) await sleep(200);
    }

    function waitFor(selector, timeout = 3000) {
      return new Promise(resolve => {
        const found = document.querySelector(selector);
        if (found) return resolve(found);
        const obs = new MutationObserver(() => {
          const el = document.querySelector(selector);
          if (el) { obs.disconnect(); resolve(el); }
        });
        obs.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => { obs.disconnect(); resolve(null); }, timeout);
      });
    }

    function queryCallInput() {
      return document.querySelector('input[placeholder="Enter a name or number"]')
          || document.querySelector('input.input[type="text"]:not([readonly])')
          || null;
    }

    function waitForCallInput(timeout = 4000) {
      return new Promise(resolve => {
        const found = queryCallInput();
        if (found) return resolve(found);
        const obs = new MutationObserver(() => {
          const el = queryCallInput();
          if (el) { obs.disconnect(); resolve(el); }
        });
        obs.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => { obs.disconnect(); resolve(queryCallInput()); }, timeout);
      });
    }

    async function apiOutcome(lead, outcome, notes) {
      const token = getStoredToken();
      if (!token || !lead) return;
      try {
        await gmRequest({
          method: 'POST',
          url: getApiUrl() + '/api/outcome',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          data: JSON.stringify({
            leadId: lead.id || null,
            phone: lead.phone,
            outcome,
            notes: notes || ''
          })
        });
      } catch (e) {
        console.warn('outcome sync failed', e);
      }
    }

    function getDialerLeads() {
      const all = JSON.parse(localStorage.getItem('gv-parsed-leads') || '[]');
      const active = all.filter(l => !l._status);
      const notPickedUp = all.filter(l => l._status && !isCompleted(l._status));
      return [...active, ...notPickedUp];
    }

    function saveLeads() {
      const stored = JSON.parse(localStorage.getItem('gv-parsed-leads') || '[]');
      for (const s of stored) {
        const match = dialerLeads.find(d => d.id && d.id === s.id || d.phone && d.phone === s.phone);
        if (match && match._status) s._status = match._status;
        else delete s._status;
      }
      localStorage.setItem('gv-parsed-leads', JSON.stringify(stored));
    }

    function logCall(lead, outcome) {
      callLog.push({
        name: lead.name || '',
        phone: lead.phone || '',
        outcome,
        time: new Date().toISOString()
      });
      localStorage.setItem('gv-call-log', JSON.stringify(callLog));
      updateLogUI();
      apiOutcome(lead, outcome);
      lead._status = outcome;
      saveLeads();
    }

    function updateLogUI() {
      const summary = document.getElementById('gv-log-summary');
      if (!callLog.length) { summary.textContent = ''; return; }
      const connected = callLog.filter(c =>
        ['completed', 'answered', 'sale'].includes(c.outcome)
      ).length;
      summary.textContent = callLog.length + ' calls \u2022 ' + connected + ' connected \u2022 ' + (callLog.length - connected) + ' other';
    }

    document.getElementById('gv-export-log').addEventListener('click', () => {
      if (!callLog.length) return;
      const header = 'Name,Phone,Outcome,Time\n';
      const rows = callLog.map(c =>
        [c.name, c.phone, c.outcome, c.time]
          .map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')
      ).join('\n');
      const blob = new Blob([header + rows], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'gv-call-log-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    });

    document.getElementById('gv-reset-progress').addEventListener('click', () => {
      if (dialerRunning) { setStatus('Stop the dialer first'); return; }
      if (!confirm('Reset dialer progress and clear the call log?')) return;
      dialerIdx = 0;
      callLog = [];
      localStorage.removeItem('gv-call-log');
      const all = JSON.parse(localStorage.getItem('gv-parsed-leads') || '[]');
      all.forEach(l => delete l._status);
      localStorage.setItem('gv-parsed-leads', JSON.stringify(all));
      renderLeads(all);
      updateLogUI();
      setStatus('Progress reset');
    });

    updateLogUI();

    // ── Post-call popup ──
    const popupOverlay = document.getElementById('gv-popup-overlay');
    const popupSub = document.getElementById('gv-popup-sub');
    let popupResolve = null;

    function showCallPopup(leadName, callDuration) {
      return new Promise(resolve => {
        popupResolve = resolve;
        popupSub.textContent = (leadName || 'Unknown') + ' \u2022 ' + callDuration;
        popupOverlay.classList.add('show');
      });
    }

    function hideCallPopup() {
      popupOverlay.classList.remove('show');
      popupResolve = null;
    }

    popupOverlay.querySelectorAll('.gv-popup-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const outcome = btn.dataset.outcome;
        if (popupResolve) {
          popupResolve(outcome);
          hideCallPopup();
        }
      });
    });

    // ── Dialer logic ──
    async function dialNumber(phone) {
      window.location.hash = '/calls/new';
      const input = await waitForCallInput(4000);
      if (!input) { setStatus('Input not found'); return false; }
      input.focus();
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(120);
      input.value = '+' + phone;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(300);
      const callBtn = await waitFor('[gv-test-id="new-call-button"]', 3000);
      if (!callBtn) { setStatus('Call button not found'); return false; }
      callBtn.click();
      return true;
    }

    function hangupIfPossible() {
      const hangupBtn = document.querySelector('[gv-test-id="in-call-end-call"]');
      if (hangupBtn) hangupBtn.click();
    }

    function markCardOutcome(lead, outcome) {
      const card = findCardByLead(lead);
      if (!card) return;
      card.classList.add('done');
      const nameEl = card.querySelector('.gv-lead-name');
      if (nameEl && !nameEl.querySelector('.gv-outcome-badge')) {
        const badge = document.createElement('span');
        badge.className = 'gv-outcome-badge';
        badge.textContent = outcome.replace(/-/g, ' ');
        nameEl.appendChild(badge);
      }
    }

    async function waitForCallEnd() {
      const start = Date.now();
      let connected = false;
      let connectedAt = null;
      const pauseOnConnect = document.getElementById('gv-pauseconnect').checked;
      const skipVm = document.getElementById('gv-skip-vm').checked;

      while (true) {
        if (!dialerRunning) return { outcome: 'stopped', connected, duration: 0 };
        if (skipRequested) {
          skipRequested = false;
          hangupIfPossible();
          await sleep(400);
          const dur = connected ? Date.now() - connectedAt : 0;
          return { outcome: connected ? 'completed' : 'no-answer', connected, duration: dur };
        }

        await waitWhilePaused();
        if (!dialerRunning) return { outcome: 'stopped', connected, duration: 0 };

        const callStatusHost = document.querySelector('gv-in-call-status');
        const durationEl = document.querySelector('[gv-test-id="in-call-callduration"]');
        const statusTextEl = callStatusHost
          ? callStatusHost.querySelector('span[aria-hidden="false"]')
          : null;
        const hangupBtn = document.querySelector('[gv-test-id="in-call-end-call"]');

        // Check status text first for voicemail/ended — these end the call without pausing
        if (statusTextEl && statusTextEl.textContent.trim()) {
          const txt = statusTextEl.textContent.trim();
          if (!dialerPaused) setStatus(txt);
          if (/voicemail/i.test(txt)) {
            hangupIfPossible();
            await sleep(400);
            dialerPaused = false;
            return { outcome: 'no-answer', connected: false, duration: 0 };
          }
          if (/ended|failed|busy|no answer|declined|unavailable|disconnected/i.test(txt)) {
            const dur = connected ? Date.now() - connectedAt : 0;
            return { outcome: connected ? 'completed' : 'no-answer', connected, duration: dur };
          }
        }

        if (durationEl && durationEl.textContent.trim()) {
          if (!connected) {
            connected = true;
            connectedAt = Date.now();
            callStartTime = Date.now();
            showCallPanel(currentLead);
            if (pauseOnConnect && !skipVm) {
              dialerPaused = true;
              setDot('#fbbf24', 'rgba(251,191,36,0.8)');
              setStatus('Connected \u2022 paused');
            }
          }
          if (skipVm && !dialerPaused) {
            setStatus('Connected (skip VM) \u2022 ' + durationEl.textContent.trim());
          } else if (!dialerPaused) {
            setStatus('Connected \u2022 ' + durationEl.textContent.trim());
          }
        }

        if (!callStatusHost && !hangupBtn) {
          const dur = connected ? Date.now() - connectedAt : 0;
          if (connected) return { outcome: 'completed', connected, duration: dur };
          if (Date.now() - start > 4000) return { outcome: 'no-answer', connected: false, duration: 0 };
        }

        if (!connected && Date.now() - start > RING_TIMEOUT_MS) {
          setStatus('No answer \u2022 hanging up');
          if (hangupBtn) hangupBtn.click();
          await sleep(500);
          return { outcome: 'no-answer', connected: false, duration: 0 };
        }

        await sleep(700);
      }
    }

    function formatDuration(ms) {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return m + ':' + String(sec).padStart(2, '0');
    }

    async function runDialer() {
      dialerLeads = getDialerLeads();
      if (!dialerLeads.length) {
        setStatus('No leads to dial \u2022 Sync first');
        stopDialer();
        return;
      }
      if (dialerIdx >= dialerLeads.length) dialerIdx = 0;

      while (dialerRunning && dialerIdx < dialerLeads.length) {
        await waitWhilePaused();
        if (!dialerRunning) return;

        const lead = dialerLeads[dialerIdx];
        currentLead = lead;
        if (!lead.phone) { dialerIdx++; continue; }

        const card = findCardByLead(lead);
        setStatus('Calling ' + (dialerIdx + 1) + '/' + dialerLeads.length + ': ' + (lead.name || lead.phone) + '...');
        setDot('#34d399', 'rgba(52,211,153,0.8)');
        document.querySelectorAll('.gv-lead-card').forEach(c => c.classList.remove('active-call'));
        if (card) card.classList.add('active-call');

        const ok = await dialNumber(lead.phone);
        if (!dialerRunning) return;
        if (!ok) {
          logCall(lead, 'dial-error');
          markCardOutcome(lead, 'dial-error');
          dialerIdx++;
          await sleep(1500);
          continue;
        }

        await sleep(2000);
        if (!dialerRunning) return;
        if (document.getElementById('gv-automute').checked) {
          const muteBtn = document.querySelector('[gv-test-id="mute-button"]');
          if (muteBtn && muteBtn.getAttribute('aria-pressed') !== 'true') muteBtn.click();
        }

        if (document.getElementById('gv-doublecall').checked) {
          await sleep(3000);
          if (dialerRunning) await dialNumber(lead.phone);
        }
        if (!dialerRunning) return;

        const result = await waitForCallEnd();
        hideCallPanel();
        if (result.outcome === 'stopped') return;

        let finalOutcome = result.outcome;

        if (result.connected && result.duration >= getLongCallMs()) {
          setDot('#fbbf24', 'rgba(251,191,36,0.8)');
          setStatus('Call ended \u2022 ' + formatDuration(result.duration));
          finalOutcome = await showCallPopup(lead.name, formatDuration(result.duration));
          setDot('#34d399', 'rgba(52,211,153,0.8)');
        }

        logCall(lead, finalOutcome);
        markCardOutcome(lead, finalOutcome);
        dialerPaused = false;
        dialerIdx++;
        currentLead = null;

        setStatus('Done (' + finalOutcome + '). Next in ' + (getDialDelayMs() / 1000) + 's...');
        await sleep(getDialDelayMs());
      }

      if (dialerRunning && dialerIdx >= dialerLeads.length) {
        const redo = dialerLeads.filter(l => l._status && !isCompleted(l._status));
        if (redo.length) {
          dialerLeads = [...redo];
          dialerIdx = 0;
          setStatus('Redialing ' + redo.length + ' not-picked-up...');
          await sleep(2000);
          if (dialerRunning) runDialer();
          return;
        }
        setStatus('All leads dialed');
        stopDialer();
      }
    }

    function stopDialer() {
      dialerRunning = false;
      dialerPaused = false;
      skipRequested = false;
      setDot('#ef4444', 'rgba(239,68,68,0.8)');
      document.querySelectorAll('.gv-lead-card').forEach(c => c.classList.remove('active-call'));
    }

    document.getElementById('gv-start').addEventListener('click', () => {
      if (dialerRunning) {
        dialerPaused = false;
        setDot('#34d399', 'rgba(52,211,153,0.8)');
        setStatus('Resumed');
        return;
      }
      dialerLeads = getDialerLeads();
      dialerIdx = 0;
      dialerRunning = true;
      dialerPaused = false;
      setDot('#34d399', 'rgba(52,211,153,0.8)');
      setStatus('Starting...');
      runDialer();
    });

    document.getElementById('gv-stop').addEventListener('click', () => {
      stopDialer();
      setStatus('Stopped');
    });

    document.getElementById('gv-pause').addEventListener('click', () => {
      if (!dialerRunning) { setStatus('Start the dialer first'); return; }
      dialerPaused = !dialerPaused;
      if (dialerPaused) {
        setDot('#fbbf24', 'rgba(251,191,36,0.8)');
        setStatus('Paused');
      } else {
        setDot('#34d399', 'rgba(52,211,153,0.8)');
        setStatus('Resumed');
      }
    });

    document.getElementById('gv-skip').addEventListener('click', () => {
      if (!dialerRunning) return;
      skipRequested = true;
      dialerPaused = false;
      setStatus('Skipping...');
    });

    document.getElementById('gv-next').addEventListener('click', () => {
      if (dialerRunning) {
        skipRequested = true;
        dialerPaused = false;
        setStatus('Jumping to next...');
        return;
      }
      dialerIdx++;
      setStatus('Moved to lead ' + (dialerIdx + 1));
    });

    document.getElementById('gv-call').addEventListener('click', () => {
      window.location.hash = '/calls/new';
    });

    document.getElementById('gv-dialer-send-channel').addEventListener('click', async () => {
      const s = document.getElementById('gv-dialer-channel-status');
      const lead = currentLead || (callLog.length ? callLog[callLog.length - 1] : null);
      await sendLeadToChannel(lead, s);
    });

    // ── Voice Greeting ──
    const greetRecord = document.getElementById('gv-greet-record');
    const greetPlay = document.getElementById('gv-greet-play');
    const greetDelete = document.getElementById('gv-greet-delete');
    const greetCriminal = document.getElementById('gv-greet-criminal');
    const greetStatus = document.getElementById('gv-greet-status');
    const CRIMINAL_DATA = "data:audio/mpeg;base64,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";
    let mediaRecorder = null, recStream = null, recTimer = null, recSecs = 0;

    function hasGreeting() { return !!localStorage.getItem('gv-greeting-audio'); }
    function updateGreetingUI() {
      const has = hasGreeting();
      greetPlay.style.display = has ? '' : 'none';
      greetDelete.style.display = has ? '' : 'none';
      greetStatus.textContent = has ? 'Greeting saved' : '';
    }
    updateGreetingUI();

    async function playAudioThroughCall(dataUrl, label) {
      greetStatus.textContent = 'Finding call...';
      try {
        const pc = _gvPCs.find(function (p) {
          try { return p.connectionState === 'connected' && p.getSenders().some(function (s) { return s.track && s.track.kind === 'audio'; }); } catch (e) { return false; }
        });
        if (!pc) { greetStatus.textContent = 'No active call found (' + _gvPCs.length + ' PCs)'; return; }
        const sender = pc.getSenders().find(function (s) { return s.track && s.track.kind === 'audio'; });
        if (!sender) { greetStatus.textContent = 'No audio sender'; return; }
        const origTrack = sender.track;
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const dest = ctx.createMediaStreamDestination();
        const micSrc = ctx.createMediaStreamSource(micStream);
        micSrc.connect(dest);
        const audio = new Audio(dataUrl);
        await new Promise(function (resolve, reject) {
          if (audio.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) resolve();
          else {
            audio.addEventListener('canplaythrough', resolve, { once: true });
            audio.addEventListener('error', reject, { once: true });
            audio.load();
            setTimeout(function () { reject(new Error('timeout')); }, 8000);
          }
        });
        ctx.createMediaElementSource(audio).connect(dest);
        await sender.replaceTrack(dest.stream.getAudioTracks()[0]);
        if (ctx.state === 'suspended') await ctx.resume();
        await audio.play();
        greetStatus.textContent = (label || 'Playing') + '...';
        audio.onended = async function () {
          try { await sender.replaceTrack(origTrack); } catch (e) {}
          micStream.getTracks().forEach(function (t) { t.stop(); });
          ctx.close();
          greetStatus.textContent = 'Done';
        };
      } catch (e) {
        greetStatus.textContent = 'Error: ' + (e.message || e);
        console.warn('GV Greeting:', e);
      }
    }

    greetRecord.addEventListener('click', () => {
      if (mediaRecorder && mediaRecorder.state === 'recording') { mediaRecorder.stop(); return; }
      navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
        recStream = stream;
        const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
        mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
        const chunks = [];
        mediaRecorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: mime });
          const reader = new FileReader();
          reader.onload = () => {
            localStorage.setItem('gv-greeting-audio', reader.result);
            updateGreetingUI();
            greetStatus.textContent = 'Saved (' + recSecs + 's)';
            greetRecord.textContent = '🎤 Record';
            greetRecord.classList.remove('gv-recording');
          };
          reader.readAsDataURL(blob);
          recStream.getTracks().forEach(t => t.stop()); recStream = null;
          clearInterval(recTimer); recTimer = null;
        };
        recSecs = 0;
        mediaRecorder.start();
        greetRecord.textContent = '🔴 0s'; greetRecord.classList.add('gv-recording');
        greetStatus.textContent = 'Recording...';
        recTimer = setInterval(() => { recSecs++; greetRecord.textContent = '🔴 ' + recSecs + 's'; }, 1000);
      }).catch(() => greetStatus.textContent = 'Microphone access denied');
    });

    greetPlay.addEventListener('click', async () => {
      const data = localStorage.getItem('gv-greeting-audio');
      if (!data) { greetStatus.textContent = 'No greeting saved'; return; }
      await playAudioThroughCall(data, 'Playing greeting');
    });

    greetDelete.addEventListener('click', () => {
      localStorage.removeItem('gv-greeting-audio');
      updateGreetingUI();
      greetStatus.textContent = 'Deleted';
    });

    greetCriminal.addEventListener('click', async () => {
      await playAudioThroughCall(CRIMINAL_DATA, 'Playing criminal');
    });

    makeDraggable(panel, document.getElementById('gv-header'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
