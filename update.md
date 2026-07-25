# v7 UI + Callback Overhaul

## Goals
- Reduce visual bulk, improve scanability
- Simplify leads page
- Promote Active Call Window to a full floating window (like main panel)
- Add always-on call watcher so inbound callbacks also show lead info + outcome popup
- Keep all existing functionality

## Order of implementation

### 1. Themes → Dropdown
- Replace `.gv-theme-chip` flex-wrap row in Settings tab with a `<select>` dropdown
- Rebuild `renderThemes()` to populate a select element
- CSS: remove `#gv-theme-row` flex-wrap, style select to match panel aesthetic
- Keep theme switching logic unchanged

### 2. Settings accordions
- Settings sections: Auto-Dial, Popup, Data, About become `<details>`/`<summary>` accordions
- Style `<summary>` as a `.gv-label` row with a collapse arrow (▶/▼)
- Style `details` with no extra padding/border, just the content inside
- First section (Style + Server) stays open by default, no accordion wrapper

### 3. Leads page — simplified cards
- Remove `.gv-lead-actions` div (Call + Done buttons) from each card
- Keep name, phone, email, addresses, outcome badge
- Phone is clickable (dial) via existing `.gv-dial` class
- Completed leads already hidden from list (v6.9.0 behavior kept)
- `getDialerLeads()` unchanged — still returns active + not-picked-up

### 4. Active Call Window — full floating window
- CSS: match main panel sizing/styling (wider, same visual language)
- Header: dot + "Active Call" title + close button
- Header is drag target (already works)
- Body: lead info + outcome buttons inline (Completed / Failed / Wrong Person)
- No separate popup modal for post-call outcomes when call window is visible
- Position defaults to bottom-right (below main panel) — draggable, position saved to localStorage
- **Always visible** when there's an active call (auto-show), auto-hide when call ends

### 5. Always-on call watcher
- Runs independently from dialer `waitForCallEnd`
- Polls every 1s: checks for active call indicators in GV DOM
- Looks for: `[gv-test-id="in-call-callduration"]` or call status text
- When active call detected:
  - Extract phone number from call UI
  - Search ALL leads (`gv-parsed-leads` + `gv-reused-leads`) for match by phone
  - If matched: call `showCallPanel(lead)` with found lead — overrides existing match
  - If unmatched: show "Unknown caller" in call panel
- When call ends (no call indicators):
  - If dialer is NOT running AND panel was showing a lead → show outcome popup
  - Allow agent to mark outcome for the callback
  - Log outcome via existing `logCall` and `apiOutcome`
- Coexists with dialer: when dialer is running, dialer's own `showCallPanel` and outcome flow takes priority

### 6. Dialer tab adjustments
- **2-tier button layout:**
  - Row 1 (primary, prominent): Start (green) | Stop (red) | Pause
  - Row 2 (secondary, ghost): Call | Skip | Next — smaller, 3-col grid
- **Voice Greeting compact:** Single `flex` row, no wrapping, smaller buttons
- **Group collapsibles:**
  - "Settings" accordion: Volume, Auto Mute, Double Call, Pause on connect
  - "Voice Greeting" accordion (if compact row isn't enough)
  - "Log" accordion: Export + Reset buttons + summary

### 7. Post-call popup → horizontal (for cases when call window isn't open)
- Keep fallback popup for when call panel isn't visible
- Buttons in horizontal row (`flex-direction: row`)
- Same 3 outcomes: Completed / Failed / Wrong Person

### 8. Bump version
- Change `6.9.0` → `7.0.0` in version display and auto-update check

## Non-goals
- No backend changes (no new API endpoints, no DB changes)
- No changes to Telegram bot commands
- No changes to lead sync / storage logic
- No changes to dialer core loop
