// ==UserScript==
// @name         Google Voice — Glass Dialer
// @namespace    http://tampermonkey.net/
// @version      6.4.0
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
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

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
        <div id="gv-greet-controls" style="display:flex;gap:6px">
          <button class="gv-btn gv-btn-ghost" id="gv-greet-record" style="flex:1">🎤 Record</button>
          <button class="gv-btn gv-btn-ghost" id="gv-greet-play" style="flex:1;display:none">🔊 Play</button>
          <button class="gv-btn gv-btn-ghost" id="gv-greet-delete" style="padding:8px 10px;display:none">✕</button>
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
          Google Voice Glass Dialer v<span id="gv-settings-version">6.4.0</span><br>
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

    <div id="gv-call-panel" style="display:none">
      <div id="gv-call-panel-header">
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
          const text = await r.text();
          resolve({ status: r.status, responseText: text });
        }).catch(reject);
        return;
      }
      req({
        method: opts.method || 'GET',
        url: opts.url,
        headers: opts.headers || {},
        data: opts.data || undefined,
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
    function renderLeads(leads) {
      const list = document.getElementById('gv-lead-list');
      const noLeads = document.getElementById('gv-no-leads');
      const countEl = document.getElementById('gv-lead-count');
      const searchVal = (document.getElementById('gv-lead-search').value || '').trim().toLowerCase();
      list.innerHTML = '';
      const filtered = searchVal
        ? leads.filter(l => {
            const hay = [l.name, l.phone, l.email, ...(l.addresses || [])].join(' ').toLowerCase();
            return hay.includes(searchVal);
          })
        : leads;
      if (!filtered.length) {
        noLeads.style.display = '';
        noLeads.textContent = searchVal ? 'No matches for "' + searchVal + '"' : 'No leads loaded. Log in and sync.';
        countEl.textContent = searchVal ? '(0/' + leads.length + ')' : '';
        return;
      }
      noLeads.style.display = 'none';
      noLeads.textContent = 'No leads loaded. Log in and sync.';
      countEl.textContent = searchVal ? '(' + filtered.length + '/' + leads.length + ')' : '(' + leads.length + ')';

      filtered.forEach((lead, i) => {
        const card = document.createElement('div');
        card.className = 'gv-lead-card' + (lead._done ? ' done' : '');
        card.dataset.idx = i;
        if (lead.id) card.dataset.leadId = lead.id;
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
        btn.addEventListener('click', () => btn.closest('.gv-lead-card').classList.toggle('done'));
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
        const leads = (data.leads || []).map(l => ({
          id: l.id,
          phone: l.phone,
          name: l.name || '',
          email: l.email || '',
          addresses: l.addresses || [],
          flagged: false
        }));
        localStorage.setItem('gv-parsed-leads', JSON.stringify(leads));
        dialerIdx = 0; saveIdx();
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

    document.getElementById('gv-send-channel').addEventListener('click', async () => {
      if (!currentLead) { channelStatus.textContent = 'No active call'; return; }
      const token = getStoredToken();
      if (!token) { channelStatus.textContent = 'Not logged in'; return; }
      channelStatus.textContent = 'Sending...';
      try {
        const res = await gmRequest({
          method: 'POST',
          url: getApiUrl() + '/api/notify',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          data: JSON.stringify({
            name: currentLead.name || 'Unknown',
            phone: currentLead.phone || '',
            email: currentLead.email || '',
            addresses: (currentLead.addresses || []).join(', '),
            notes: currentLead.notes || ''
          })
        });
        if (res.status >= 200 && res.status < 300) {
          channelStatus.textContent = 'Sent!';
        } else {
          channelStatus.textContent = 'Failed (' + res.status + ')';
        }
      } catch (e) {
        channelStatus.textContent = 'Error sending';
        console.warn(e);
      }
    });

    // ── Dialer state ──
    let dialerRunning = false;
    let dialerPaused = false;
    let skipRequested = false;
    let dialerIdx = Number(localStorage.getItem('gv-dialer-idx') || 0);
    let dialerLeads = [];
    let callLog = JSON.parse(localStorage.getItem('gv-call-log') || '[]');
    let currentLead = null;
    let callStartTime = 0;

    const RING_TIMEOUT_MS = 20000;
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

    function saveIdx() {
      localStorage.setItem('gv-dialer-idx', String(dialerIdx));
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
      dialerIdx = 0; saveIdx();
      callLog = [];
      localStorage.removeItem('gv-call-log');
      document.querySelectorAll('.gv-lead-card.done').forEach(c => c.classList.remove('done'));
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

    function markCardOutcome(idx, outcome) {
      const card = document.querySelector('.gv-lead-card[data-idx="' + idx + '"]');
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
          if (/ended|failed|busy|no answer|declined|unavailable|disconnected|voicemail/i.test(txt)) {
            const dur = connected ? Date.now() - connectedAt : 0;
            if (/voicemail/i.test(txt)) {
              hangupIfPossible();
              await sleep(400);
              return { outcome: 'no-answer', connected: false, duration: 0 };
            }
            return { outcome: connected ? 'completed' : 'no-answer', connected, duration: dur };
          }
        }

        if (durationEl && durationEl.textContent.trim()) {
          if (!connected) {
            connected = true;
            connectedAt = Date.now();
            callStartTime = Date.now();
            showCallPanel(currentLead);
            if (pauseOnConnect) {
              dialerPaused = true;
              setDot('#fbbf24', 'rgba(251,191,36,0.8)');
              setStatus('Connected \u2022 paused');
            }
          }
          if (!dialerPaused) setStatus('Connected \u2022 ' + durationEl.textContent.trim());
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
      dialerLeads = JSON.parse(localStorage.getItem('gv-parsed-leads') || '[]');
      if (!dialerLeads.length) {
        setStatus('No leads \u2022 Sync first');
        stopDialer();
        return;
      }
      if (dialerIdx >= dialerLeads.length) dialerIdx = 0;

      while (dialerRunning && dialerIdx < dialerLeads.length) {
        await waitWhilePaused();
        if (!dialerRunning) return;

        const lead = dialerLeads[dialerIdx];
        currentLead = lead;
        if (!lead.phone) { dialerIdx++; saveIdx(); continue; }

        const card = document.querySelector('.gv-lead-card[data-idx="' + dialerIdx + '"]');
        if (card && card.classList.contains('done')) { dialerIdx++; saveIdx(); continue; }

        setStatus('Calling ' + (dialerIdx + 1) + '/' + dialerLeads.length + ': ' + (lead.name || lead.phone) + '...');
        setDot('#34d399', 'rgba(52,211,153,0.8)');
        document.querySelectorAll('.gv-lead-card').forEach(c => c.classList.remove('active-call'));
        if (card) card.classList.add('active-call');

        const ok = await dialNumber(lead.phone);
        if (!dialerRunning) return;
        if (!ok) {
          logCall(lead, 'dial-error');
          markCardOutcome(dialerIdx, 'dial-error');
          dialerIdx++; saveIdx();
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
        markCardOutcome(dialerIdx, finalOutcome);
        dialerPaused = false;
        dialerIdx++;
        saveIdx();
        currentLead = null;

        setStatus('Done (' + finalOutcome + '). Next in ' + (getDialDelayMs() / 1000) + 's...');
        await sleep(getDialDelayMs());
      }

      if (dialerRunning && dialerIdx >= dialerLeads.length) {
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
      const leads = JSON.parse(localStorage.getItem('gv-parsed-leads') || '[]');
      if (dialerIdx >= leads.length) dialerIdx = 0;
      dialerRunning = true;
      dialerPaused = false;
      setDot('#34d399', 'rgba(52,211,153,0.8)');
      setStatus(dialerIdx > 0 ? 'Resuming from lead ' + (dialerIdx + 1) + '...' : 'Starting...');
      runDialer();
    });

    document.getElementById('gv-stop').addEventListener('click', () => {
      stopDialer();
      setStatus('Stopped at lead ' + (dialerIdx + 1));
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
      saveIdx();
      setStatus('Moved to lead ' + (dialerIdx + 1));
    });

    document.getElementById('gv-call').addEventListener('click', () => {
      window.location.hash = '/calls/new';
    });

    document.getElementById('gv-dialer-send-channel').addEventListener('click', async () => {
      const s = document.getElementById('gv-dialer-channel-status');
      const lead = currentLead || (callLog.length ? callLog[callLog.length - 1] : null);
      if (!lead) { s.textContent = 'No leads to send'; return; }
      const token = getStoredToken();
      if (!token) { s.textContent = 'Not logged in'; return; }
      s.textContent = 'Sending...';
      try {
        const res = await gmRequest({
          method: 'POST', url: getApiUrl() + '/api/notify',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          data: JSON.stringify({
            name: lead.name || 'Unknown', phone: lead.phone || '',
            email: lead.email || '', addresses: (lead.addresses || []).join(', '),
            notes: lead.notes || ''
          })
        });
        s.textContent = res.status >= 200 && res.status < 300 ? 'Sent!' : 'Failed (' + res.status + ')';
      } catch (e) { s.textContent = 'Error'; console.warn(e); }
    });

    // ── Voice Greeting ──
    const greetRecord = document.getElementById('gv-greet-record');
    const greetPlay = document.getElementById('gv-greet-play');
    const greetDelete = document.getElementById('gv-greet-delete');
    const greetStatus = document.getElementById('gv-greet-status');
    let mediaRecorder = null, recStream = null, recTimer = null, recSecs = 0;

    if (localStorage.getItem('gv-greeting-audio')) {
      greetPlay.style.display = ''; greetDelete.style.display = '';
      greetStatus.textContent = 'Greeting saved';
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
            greetPlay.style.display = ''; greetDelete.style.display = '';
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

    greetPlay.addEventListener('click', () => {
      const data = localStorage.getItem('gv-greeting-audio');
      if (!data) { greetStatus.textContent = 'No greeting saved'; return; }
      const a = new Audio(data);
      a.onended = () => greetStatus.textContent = 'Done';
      a.play().then(() => greetStatus.textContent = 'Playing...').catch(() => greetStatus.textContent = 'Playback failed');
    });

    greetDelete.addEventListener('click', () => {
      localStorage.removeItem('gv-greeting-audio');
      greetPlay.style.display = 'none'; greetDelete.style.display = 'none';
      greetStatus.textContent = 'Deleted';
    });

    makeDraggable(panel, document.getElementById('gv-header'));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
