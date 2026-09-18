// ==UserScript==
// @name         DOMjudge ICPC-style Browser Resolver
// @namespace    https://www.domjudge.org/
// @version      3.6.0
// @description  Browser-only DOMjudge resolver with ICPC Tools Resolver-style stepping, award flow, and final free scrolling on jury pages.
// @author       OpenAI
// @match        
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const juryPos = location.pathname.indexOf('/jury');
  if (juryPos < 0) return;

  const BASE_PATH = location.pathname.slice(0, juryPos);
  const APP_ID = 'dj-icpc-browser-resolver';
  const ROWS_PER_SCREEN = 12;
  const DELAY = {
    SELECT_TEAM: 1300,
    SELECT_PROBLEM: 1000,
    SOLVED_MOVE: 2250,
    SOLVED_STAY: 1500,
    FAILED: 850,
    DESELECT: 250,
    SELECT_SUBMISSION: 450,
  };

  // ICPC Tools stable 2.6 scoreboard colours.
  const COLORS = {
    pending: 'rgba(54,94,201,0.822)',
    solved: 'rgba(0,189,0,0.822)',
    fts: 'rgb(0,100,0)',
    ftsCell: 'rgba(0,82,0,0.822)',
    failed: 'rgba(197,0,0,0.822)',
    selection: 'rgba(92,138,231,0.941)',
    stripe: 'rgb(60,60,60)',
    plain: 'rgb(40,40,40)',
    teamList: 'rgb(40,192,192)',
    gold: 'rgba(205,127,50,0.376)',
    silver: 'rgba(230,232,250,0.376)',
    bronze: 'rgba(166,125,61,0.376)',
  };

  const clone = (x) => typeof structuredClone === 'function' ? structuredClone(x) : JSON.parse(JSON.stringify(x));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const cssEscape = (s) => window.CSS?.escape ? CSS.escape(String(s)) : String(s).replace(/["\\]/g, '\\$&');
  const pick = (o, ...keys) => {
    for (const k of keys) if (o != null && o[k] != null) return o[k];
    return null;
  };
  const arr = (x, key) => Array.isArray(x) ? x : (Array.isArray(x?.[key]) ? x[key] : []);

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function cookie(name) {
    const prefix = `${name}=`;
    for (const part of document.cookie.split(';')) {
      const p = part.trim();
      if (p.startsWith(prefix)) return decodeURIComponent(p.slice(prefix.length));
    }
    return null;
  }

  // ICPC API duration -> milliseconds. Handles H:MM:SS(.fff), D days H:MM:SS, ISO 8601 and numbers.
  function durationMs(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'number') return Math.round(value * 1000);
    const s0 = String(value).trim();
    if (/^-?\d+(\.\d+)?$/.test(s0)) return Math.round(Number(s0) * 1000);
    let sign = 1;
    let s = s0;
    if (s.startsWith('-')) { sign = -1; s = s.slice(1); }
    const iso = s.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i);
    if (iso) {
      return sign * Math.round(((Number(iso[1] || 0) * 86400) + (Number(iso[2] || 0) * 3600) + (Number(iso[3] || 0) * 60) + Number(iso[4] || 0)) * 1000);
    }
    const day = s.match(/^(?:(\d+)\s+days?\s+)?(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/i);
    if (day) {
      return sign * Math.round(((Number(day[1] || 0) * 86400) + (Number(day[2]) * 3600) + (Number(day[3]) * 60) + Number(day[4])) * 1000);
    }
    const short = s.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/);
    if (short) return sign * Math.round((Number(short[1]) * 60 + Number(short[2])) * 1000);
    return null;
  }

  const timeMin = (ms) => Math.floor(Math.max(0, Number(ms) || 0) / 60000);

  const css = `
    #${APP_ID}-launch {
      position: fixed; right: 18px; bottom: 18px; z-index: 2147482500;
      border: 1px solid #555; border-radius: 4px; padding: 8px 12px;
      background: #1b1b1b; color: #fff; cursor: pointer; font: 600 13px system-ui,sans-serif;
    }
    #${APP_ID} { position: fixed; inset: 0; z-index: 2147483640; display: none; background: #000; color: #fff; overflow: hidden; }
    #${APP_ID}.open { display: block; }
    #${APP_ID}, #${APP_ID} * { box-sizing: border-box; }
    #${APP_ID} { font-family: Helvetica, Arial, sans-serif; user-select: none; }
    #${APP_ID} .djr-stage { position: absolute; inset: 0; background: #000; overflow: hidden; cursor: default; }

    /* Setup / errors are intentionally plain; the presentation itself has no toolbar. */
    #${APP_ID} .djr-setup {
      position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:#101010;
      font: 14px/1.55 system-ui,sans-serif; color:#eee;
    }
    #${APP_ID} .djr-card { width:min(760px,88vw); background:#1d1d1d; border:1px solid #555; padding:24px 28px; border-radius:4px; box-shadow:0 18px 60px #000; }
    #${APP_ID} .djr-card h2 { margin:0 0 14px; font-size:20px; }
    #${APP_ID} .djr-card pre { white-space:pre-wrap; color:#ddd; max-height:52vh; overflow:auto; }
    #${APP_ID} .djr-card select, #${APP_ID} .djr-card button {
      background:#2b2b2b; color:#fff; border:1px solid #666; padding:8px 10px; border-radius:3px; font:inherit;
    }
    #${APP_ID} .djr-card button { cursor:pointer; }
    #${APP_ID} .djr-setup-actions { display:flex; gap:8px; margin-top:16px; align-items:center; }

    /* Splash */
    #${APP_ID} .djr-splash { position:absolute; inset:0; display:none; background:#000; overflow:hidden; }
    #${APP_ID} .djr-splash.on { display:block; }
    #${APP_ID} .djr-splash-title {
      position:absolute; top:5.5vh; left:5vw; right:5vw; text-align:center; color:#fff;
      font-weight:700; font-size:clamp(34px,5.2vh,76px); line-height:1.08;
    }
    #${APP_ID} .djr-splash-pending {
      position:absolute; top:16vh; left:0; right:0; text-align:center; color:#fff;
      font-weight:700; font-size:clamp(16px,2.0vh,28px);
    }
    #${APP_ID} .djr-splash-banner {
      position:absolute; left:10vw; right:10vw; top:22vh; height:42vh; object-fit:contain; margin:auto; max-width:80vw;
    }
    #${APP_ID} .djr-splash-resolver {
      position:absolute; left:50%; transform:translateX(-50%); bottom:22vh;
      padding:.55em 1.05em; border:0; border-radius:14px; background:linear-gradient(#426ff5,#243b81);
      font:400 clamp(24px,3.2vh,46px) Helvetica,Arial,sans-serif; color:#fff; white-space:nowrap;
      cursor:pointer; appearance:none; -webkit-appearance:none;
    }
    #${APP_ID} .djr-splash-resolver:hover { filter:brightness(1.08); }
    #${APP_ID} .djr-splash-resolver:active { transform:translateX(-50%) translateY(1px); filter:brightness(.94); }
    #${APP_ID} .djr-splash-resolver:focus-visible { outline:3px solid #fff; outline-offset:4px; }
    #${APP_ID} .djr-splash-foot {
      position:absolute; left:0; right:0; bottom:7vh; text-align:center; color:#bdbdbd;
      font-size:clamp(12px,1.4vh,20px); line-height:1.6;
    }

    /* Official-style scoreboard */
    #${APP_ID} .djr-board { position:absolute; inset:0; display:none; background:#000; overflow:hidden; --header-h:2.2vh; }
    #${APP_ID} .djr-board.on { display:block; }
    #${APP_ID} .djr-header {
      position:absolute; z-index:10000; left:0; right:0; top:0; height:var(--header-h);
      min-height:21px; background:#000; color:#fff; border-bottom:1px solid #fff;
      font-weight:700; font-style:italic; font-size:var(--header-font,20px);
    }
    #${APP_ID} .djr-header span {
      position:absolute; top:0; bottom:auto; height:100%; display:flex; align-items:center; white-space:nowrap; line-height:1;
    }
    #${APP_ID} .djr-header-rank { left:var(--rank-left,8px); width:var(--rank-w,70px); justify-content:center; text-align:center; }
    #${APP_ID} .djr-header-name { left:var(--name-left,130px); font-style:normal; justify-content:flex-start; }
    #${APP_ID} .djr-header-solved { left:var(--header-solved-left,1080px); width:var(--header-solved-w,70px); justify-content:flex-start; text-align:left; }
    #${APP_ID} .djr-header-time { left:var(--header-time-left,1180px); width:var(--header-time-w,80px); justify-content:flex-start; text-align:left; font-style:normal; }
    #${APP_ID} .djr-row {
      position:absolute; left:0; right:0; height:var(--row-h,72px); top:var(--header-px,22px);
      color:#fff; transform:translate3d(0,var(--y,0px),0);
      overflow:hidden; will-change:transform; font-weight:700;
    }
    #${APP_ID} .djr-row.even::before { content:""; position:absolute; inset:0; background:${COLORS.stripe}; z-index:-2; }
    #${APP_ID} .djr-row.selected::after, #${APP_ID} .djr-row.highlight::after { content:""; position:absolute; inset:0; background:${COLORS.selection}; z-index:-1; }
    #${APP_ID} .djr-row.fts::after, #${APP_ID} .djr-row.fts-highlight::after { content:""; position:absolute; inset:0; background:${COLORS.fts}; z-index:-1; }
    #${APP_ID} .djr-row.team-list::after { content:""; position:absolute; inset:0; background:${COLORS.teamList}; z-index:-1; }
    #${APP_ID} .djr-row.highlight::before, #${APP_ID} .djr-row.fts-highlight::before { content:""; position:absolute; inset:0; border:1px solid #fff; z-index:20; pointer-events:none; }
    #${APP_ID} .djr-rank {
      position:absolute; left:var(--rank-left,8px); top:5px; width:var(--rank-w,70px); text-align:center;
      font-size:var(--row-font,34px); font-style:italic; line-height:1;
    }
    #${APP_ID} .djr-logo-wrap {
      position:absolute; left:var(--logo-left,80px); top:5px; bottom:5px; width:var(--logo-w,62px); display:flex; align-items:center; justify-content:center;
    }
    #${APP_ID} .djr-logo { max-width:100%; max-height:100%; object-fit:contain; }
    #${APP_ID} .djr-name {
      position:absolute; left:var(--name-left,160px); right:var(--name-right,190px); top:5px; height:var(--name-h,38px);
      font-size:var(--row-font,34px); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1;
    }
    #${APP_ID} .djr-problems {
      position:absolute; left:var(--name-left,160px); top:var(--problem-top,38px); height:var(--cube-h,18px);
      display:flex; gap:5px;
    }
    #${APP_ID} .djr-problem {
      position:relative; flex:0 0 var(--cube-w,120px); width:var(--cube-w,120px); height:var(--cube-h,18px); min-width:0; border-radius:7px; background:${COLORS.plain};
      display:flex; align-items:center; justify-content:center; color:rgba(196,196,196,.77);
      font-size:var(--status-font,18px); font-weight:700; overflow:visible;
      box-shadow:inset 0 1px rgba(255,255,255,.14), inset 0 -1px rgba(0,0,0,.55);
    }
    #${APP_ID} .djr-problem.pending { background:${COLORS.pending}; color:#fff; }
    #${APP_ID} .djr-problem.solved { background:${COLORS.solved}; color:#fff; }
    #${APP_ID} .djr-problem.fts { background:${COLORS.ftsCell}; color:#fff; outline:2px solid rgb(0,230,0); outline-offset:-1px; }
    #${APP_ID} .djr-problem.failed { background:${COLORS.failed}; color:#fff; }
    #${APP_ID} .djr-problem.focus { animation:djr-pending-focus .571s steps(1,end) infinite; }
    @keyframes djr-pending-focus {
      0%,59% { box-shadow:0 0 0 3px #ff0, inset 0 1px rgba(255,255,255,.14), inset 0 -1px rgba(0,0,0,.55); }
      60%,100% { box-shadow:inset 0 1px rgba(255,255,255,.14), inset 0 -1px rgba(0,0,0,.55); }
    }
    #${APP_ID} .djr-solved {
      position:absolute; left:var(--solved-left,1080px); top:5px; width:var(--solved-w,70px); text-align:center;
      font-size:var(--row-font,34px); font-style:italic; line-height:1;
    }
    #${APP_ID} .djr-time {
      position:absolute; left:var(--time-left,1180px); top:5px; width:var(--time-w,80px); text-align:center;
      font-size:var(--row-font,34px); line-height:1;
    }
    #${APP_ID} .djr-info {
      position:absolute; z-index:15000; min-width:360px; max-width:min(70vw,980px);
      left:50%; transform:translateX(-50%); background:${COLORS.selection}; border:1px solid #fff;
      padding:15px 18px; color:#fff; font-size:clamp(13px,1.6vh,22px); display:none;
    }
    #${APP_ID} .djr-info.on { display:block; }
    #${APP_ID} .djr-info-title { font-weight:700; margin-bottom:8px; }
    #${APP_ID} .djr-info-runs { display:flex; gap:6px; flex-wrap:wrap; }
    #${APP_ID} .djr-info-run { background:${COLORS.pending}; border-radius:7px; min-width:60px; padding:7px 9px; text-align:center; }

    /* Team award presentation */
    #${APP_ID} .djr-award { position:absolute; inset:0; display:none; background:#000; overflow:hidden; }
    #${APP_ID} .djr-award.on { display:block; }
    #${APP_ID} .djr-award-photo { position:absolute; inset:0 0 23vh 0; margin:auto; max-width:100%; max-height:77vh; object-fit:contain; }
    #${APP_ID} .djr-award-band { position:absolute; left:0; right:0; bottom:0; min-height:23vh; background:#3c3c3c; padding:3.5vh 5vw 3vh; }
    #${APP_ID} .djr-award-logo { position:absolute; left:3vw; top:3vh; width:15vh; height:15vh; object-fit:contain; }
    #${APP_ID} .djr-award-text { margin-left:18vh; margin-right:3vw; }
    #${APP_ID} .djr-award-team { font-size:clamp(28px,5vh,72px); font-weight:700; line-height:1.05; }
    #${APP_ID} .djr-award-citation { font-size:clamp(18px,3vh,44px); color:#ddd; line-height:1.18; margin-top:.3em; }

    #${APP_ID} .djr-toast {
      position:absolute; z-index:31000; right:16px; bottom:14px; background:rgba(0,0,0,.78); border:1px solid #666;
      color:#fff; padding:7px 10px; border-radius:3px; font:12px system-ui,sans-serif; opacity:0; pointer-events:none; transition:opacity .15s;
    }
    #${APP_ID} .djr-toast.on { opacity:1; }
    #${APP_ID} .djr-help {
      position:absolute; z-index:32000; inset:8vh 12vw; background:rgba(10,10,10,.97); border:1px solid #888; color:#eee;
      padding:28px 34px; font:15px/1.7 system-ui,sans-serif; display:none; overflow:auto;
    }
    #${APP_ID} .djr-help.on { display:block; }
    #${APP_ID} .djr-help h2 { margin-top:0; }
    #${APP_ID} .djr-help kbd { display:inline-block; min-width:28px; padding:1px 6px; border:1px solid #777; border-radius:3px; text-align:center; background:#222; }
  `;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = APP_ID;
  root.innerHTML = `
    <div class="djr-stage" data-role="stage">
      <div class="djr-setup" data-role="setup"><div class="djr-card"><h2>Resolver</h2><div data-role="setup-body">Loading DOMjudge Contest API…</div></div></div>
      <div class="djr-splash" data-role="splash">
        <div class="djr-splash-title" data-role="splash-title"></div>
        <div class="djr-splash-pending" data-role="splash-pending"></div>
        <img class="djr-splash-banner" data-role="splash-banner" alt="">
        <button type="button" class="djr-splash-resolver" data-act="splash-next">ICPC Resolver</button>
        <div class="djr-splash-foot">Frozen scoreboard resolution</div>
      </div>
      <div class="djr-board" data-role="board">
        <div class="djr-header">
          <span class="djr-header-rank">Rank</span><span class="djr-header-name">Name</span>
          <span class="djr-header-solved">Solved</span><span class="djr-header-time">Time</span>
        </div>
        <div data-role="rows"></div>
        <div class="djr-info" data-role="info"></div>
      </div>
      <div class="djr-award" data-role="award">
        <img class="djr-award-photo" data-role="award-photo" alt="">
        <div class="djr-award-band">
          <img class="djr-award-logo" data-role="award-logo" alt="">
          <div class="djr-award-text"><div class="djr-award-team" data-role="award-team"></div><div data-role="award-citations"></div></div>
        </div>
      </div>
      <div class="djr-toast" data-role="toast"></div>
      <div class="djr-help" data-role="help">
        <h2>Resolver controls</h2>
        <div><kbd>Enter</kbd> next resolver stop</div>
        <div><kbd>Backspace</kbd> previous resolver stop</div>
        <div><kbd>0</kbd> reset to the beginning</div>
        <div><kbd>[</kbd> / <kbd>]</kbd> row/scroll animation speed</div>
        <div>After completion: mouse wheel / <kbd>↑</kbd><kbd>↓</kbd> / PageUp PageDown scroll the final standings</div>
        <div><kbd>i</kbd> toggle pending-submission information</div>
        <div><kbd>?</kbd> toggle this help</div>
        <div><kbd>Esc</kbd> close help / resolver</div>
      </div>
    </div>`;
  document.body.appendChild(root);

  const launch = document.createElement('button');
  launch.id = `${APP_ID}-launch`;
  launch.type = 'button';
  launch.textContent = 'Resolver';
  document.body.appendChild(launch);

  const nav = document.querySelector('#menuDefault ul.navbar-nav.me-auto');
  if (nav) {
    const li = document.createElement('li');
    li.className = 'nav-item';
    li.innerHTML = '<a class="nav-link" href="#">resolver</a>';
    li.addEventListener('click', (e) => { e.preventDefault(); openResolver(); });
    nav.appendChild(li);
    launch.style.display = 'none';
  }

  const ui = {
    stage: root.querySelector('[data-role="stage"]'),
    setup: root.querySelector('[data-role="setup"]'),
    setupBody: root.querySelector('[data-role="setup-body"]'),
    splash: root.querySelector('[data-role="splash"]'),
    splashTitle: root.querySelector('[data-role="splash-title"]'),
    splashPending: root.querySelector('[data-role="splash-pending"]'),
    splashBanner: root.querySelector('[data-role="splash-banner"]'),
    splashNext: root.querySelector('[data-act="splash-next"]'),
    board: root.querySelector('[data-role="board"]'),
    rows: root.querySelector('[data-role="rows"]'),
    info: root.querySelector('[data-role="info"]'),
    award: root.querySelector('[data-role="award"]'),
    awardPhoto: root.querySelector('[data-role="award-photo"]'),
    awardLogo: root.querySelector('[data-role="award-logo"]'),
    awardTeam: root.querySelector('[data-role="award-team"]'),
    awardCitations: root.querySelector('[data-role="award-citations"]'),
    toast: root.querySelector('[data-role="toast"]'),
    help: root.querySelector('[data-role="help"]'),
  };

  const model = {
    apiRoot: null,
    contests: [],
    cid: null,
    contest: null,
    teams: new Map(),
    organizations: new Map(),
    problems: [],
    submissions: [],
    submissionById: new Map(),
    submissionsByTeamProblem: new Map(),
    judgementTypes: new Map(),
    judgementBySubmission: new Map(),
    awards: [],
    finalScoreboard: null,
    freezeMs: null,
    durationMs: null,
    penaltyMinutes: 20,
    steps: [],
    pauseIndices: [],
    pauseViews: [],
    frames: [],
    frameIndex: 0,
    currentStepIndex: -1,
    currentPause: 0,
    view: null,
    busy: false,
    delayFactor: 1,
    scrollFactor: 1,
    showInfo: false,
    loadSeq: 0,
    lastActionAt: 0,
    motionUntil: 0,
    renderedView: null,
    manualScrollTop: null,
  };

  async function fetchRaw(path, options = {}) {
    const res = await fetch(`${model.apiRoot}${path}`, {
      credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json', ...(options.headers || {}) }, ...options,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`${res.status} ${res.statusText}: ${path}${text ? `\n${text.slice(0, 600)}` : ''}`);
    }
    return res;
  }

  async function json(path) { return (await fetchRaw(path)).json(); }

  async function tryJson(paths, fallback = []) {
    let last = null;
    for (const p of paths) {
      try { return await json(p); } catch (e) { last = e; }
    }
    if (fallback !== undefined) return fallback;
    throw last;
  }

  async function detectApi() {
    for (const rootPath of [`${BASE_PATH}/api/v4`, `${BASE_PATH}/api`]) {
      try {
        const r = await fetch(`${rootPath}/contests?onlyActive=false`, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
        if (r.ok) {
          model.apiRoot = rootPath;
          return await r.json();
        }
      } catch (_) {}
    }
    throw new Error('DOMjudge Contest API に接続できません。jury でログインしたページから実行してください。');
  }

  function idOf(x) { return String(pick(x, 'id', 'externalid', 'team_id', 'teamId', 'problem_id', 'problemId') ?? ''); }
  function contestIdOf(x) { return String(pick(x, 'id', 'externalid', 'cid') ?? ''); }
  function teamName(id) {
    const t = model.teams.get(String(id));
    return String(pick(t, 'display_name', 'displayName', 'name', 'label') ?? id);
  }
  function teamOrgId(id) {
    const t = model.teams.get(String(id));
    return String(pick(t, 'organization_id', 'organizationId', 'affiliation_id', 'affiliationId') ?? '');
  }

  function normalizeProblem(p, index) {
    return {
      id: idOf(p),
      label: String(pick(p, 'label', 'shortname', 'short_name') ?? String.fromCharCode(65 + index)),
      ordinal: Number(pick(p, 'ordinal') ?? index),
      name: String(pick(p, 'name') ?? ''),
      rgb: String(pick(p, 'rgb', 'color') ?? '').replace(/^#/, ''),
    };
  }

  function normalizeSubmission(s) {
    const ct = durationMs(pick(s, 'contest_time', 'contestTime'));
    return {
      id: String(pick(s, 'id', 'externalid') ?? ''),
      teamId: String(pick(s, 'team_id', 'teamId') ?? ''),
      problemId: String(pick(s, 'problem_id', 'problemId') ?? ''),
      contestTime: ct,
      raw: s,
    };
  }

  function normalizeJudgement(j) {
    return {
      id: String(pick(j, 'id', 'externalid') ?? ''),
      submissionId: String(pick(j, 'submission_id', 'submissionId') ?? ''),
      typeId: String(pick(j, 'judgement_type_id', 'judgementTypeId', 'result') ?? ''),
      score: pick(j, 'score'),
      endTime: String(pick(j, 'end_time', 'endTime') ?? ''),
      raw: j,
    };
  }

  function normalizeJudgementType(jt) {
    const id = String(pick(jt, 'id', 'externalid') ?? '');
    let solved = pick(jt, 'solved');
    let penalty = pick(jt, 'penalty');
    if (solved == null) solved = /^(AC|accepted|correct)$/i.test(id);
    if (penalty == null) penalty = !solved && !/^(CE|JE|compile-error|compiler-error|judgement-error|judging-error)$/i.test(id);
    return { id, solved: Boolean(solved), penalty: Boolean(penalty), raw: jt };
  }

  function normalizeScoreboard(sb) {
    const rows = arr(sb, 'rows');
    return rows.map((r, idx) => ({
      teamId: String(pick(r, 'team_id', 'teamId') ?? ''),
      rank: String(pick(r, 'rank') ?? idx + 1),
      numSolved: Number(pick(r?.score, 'num_solved', 'numSolved') ?? 0),
      totalTime: Number(pick(r?.score, 'total_time', 'totalTime') ?? 0),
      problems: arr(r?.problems, 'problems').map((p) => ({
        problemId: String(pick(p, 'problem_id', 'problemId') ?? ''),
        numJudged: Number(pick(p, 'num_judged', 'numJudged') ?? 0),
        numPending: Number(pick(p, 'num_pending', 'numPending') ?? 0),
        solved: Boolean(pick(p, 'solved')),
        time: pick(p, 'time') == null ? null : Number(pick(p, 'time')),
      })),
    }));
  }

  function buildIndexes() {
    model.submissionById = new Map(model.submissions.map((s) => [s.id, s]));
    model.submissionsByTeamProblem = new Map();
    for (const s of model.submissions) {
      const key = `${s.teamId}\u0000${s.problemId}`;
      if (!model.submissionsByTeamProblem.has(key)) model.submissionsByTeamProblem.set(key, []);
      model.submissionsByTeamProblem.get(key).push(s);
    }
    for (const list of model.submissionsByTeamProblem.values()) list.sort((a, b) => a.contestTime - b.contestTime || a.id.localeCompare(b.id));
  }

  function judgementTypeForSubmission(submissionId) {
    const j = model.judgementBySubmission.get(String(submissionId));
    if (!j) return null;
    return model.judgementTypes.get(j.typeId) || normalizeJudgementType({ id: j.typeId });
  }

  function blankResult() {
    return { status: 'UNATTEMPTED', numPending: 0, numJudged: 0, time: 0, penalty: 0, pendingPenalty: 0, score: 0, fts: false };
  }

  function consideredJudgement(sub, revealed) {
    const j = model.judgementBySubmission.get(sub.id);
    if (!j) return null;
    const jt = model.judgementTypes.get(j.typeId) || normalizeJudgementType({ id: j.typeId });
    if (sub.contestTime < model.freezeMs || revealed.has(sub.id)) return { j, jt };
    // ResolverLogic.cleanOutlierSubmissions(): non-penalty post-freeze results are not kept pending.
    if (!jt.solved && !jt.penalty) return { j, jt };
    return null;
  }

  function addSubmissionToResult(result, sub, considered) {
    if (result.status === 'SOLVED') return;
    if (!considered) {
      result.numPending++;
      result.status = 'SUBMITTED';
      result.time = sub.contestTime;
      return;
    }
    const { jt } = considered;
    if (jt.solved) {
      result.status = 'SOLVED';
      result.numJudged++;
      result.penalty = result.pendingPenalty;
      result.score = 1;
    } else if (jt.penalty) {
      result.status = 'FAILED';
      result.pendingPenalty += model.penaltyMinutes;
      result.numJudged++;
    }
    result.time = sub.contestTime;
  }

  function computeContest(revealed) {
    const results = new Map();
    for (const teamId of model.finalTeamIds) {
      const ps = new Map();
      for (const p of model.problems) ps.set(p.id, blankResult());
      results.set(teamId, ps);
    }

    const consideredMap = new Map();
    for (const s of model.submissions) {
      if (s.contestTime == null || s.contestTime < 0 || s.contestTime >= model.durationMs) continue;
      if (!results.has(s.teamId)) continue;
      const r = results.get(s.teamId).get(s.problemId);
      if (!r) continue;
      const c = consideredJudgement(s, revealed);
      consideredMap.set(s.id, c);
      addSubmissionToResult(r, s, c);
    }

    // FTS calculation follows Contest.calculateResultsAndStandings: an earlier pending run blocks later FTS.
    const ftsToken = new Map();
    for (const p of model.problems) ftsToken.set(p.id, null);
    for (const s of model.submissions) {
      if (s.contestTime == null || s.contestTime < 0 || s.contestTime >= model.durationMs) continue;
      if (!results.has(s.teamId) || !results.get(s.teamId).has(s.problemId)) continue;
      if (ftsToken.get(s.problemId) != null) continue;
      const c = consideredMap.get(s.id);
      if (c?.jt?.solved) {
        ftsToken.set(s.problemId, s.id);
        results.get(s.teamId).get(s.problemId).fts = true;
      } else if (!c) {
        ftsToken.set(s.problemId, 'waiting');
      }
    }

    const standings = new Map();
    for (const teamId of model.finalTeamIds) {
      let numSolved = 0;
      let penalty = 0;
      let lastSolution = -1;
      for (const p of model.problems) {
        const r = results.get(teamId).get(p.id);
        penalty += r.penalty;
        if (r.status === 'SOLVED') {
          const t = timeMin(r.time);
          penalty += t;
          numSolved++;
          if (t > lastSolution) lastSolution = t;
        }
      }
      standings.set(teamId, { numSolved, time: penalty, lastSolution, rank: '' });
    }

    const order = [...model.finalTeamIds];
    order.sort((a, b) => {
      const sa = standings.get(a), sb = standings.get(b);
      if (sa.numSolved !== sb.numSolved) return sb.numSolved - sa.numSolved;
      if (sa.time !== sb.time) return sa.time - sb.time;
      if (sa.lastSolution !== sb.lastSolution) return sa.lastSolution - sb.lastSolution;
      return teamName(a).localeCompare(teamName(b), 'en', { numeric: true, sensitivity: 'variant' });
    });

    let groupStart = 0;
    while (groupStart < order.length) {
      const a = standings.get(order[groupStart]);
      let next = groupStart + 1;
      while (next < order.length) {
        const b = standings.get(order[next]);
        if (a.numSolved !== b.numSolved || a.time !== b.time || a.lastSolution !== b.lastSolution) break;
        next++;
      }
      for (let i = groupStart; i < next; i++) standings.get(order[i]).rank = String(groupStart + 1);
      groupStart = next;
    }

    return { revealed: new Set(revealed), results, standings, order };
  }

  function resultOf(state, teamId, problemIndex) {
    const p = model.problems[problemIndex];
    return state.results.get(teamId)?.get(p?.id) || null;
  }

  function orderOf(state, teamId) { return state.order.indexOf(teamId); }

  function getNextResolve(state) {
    for (let i = state.order.length - 1; i >= 0; i--) {
      const teamId = state.order[i];
      for (let j = 0; j < model.problems.length; j++) {
        if (resultOf(state, teamId, j)?.status === 'SUBMITTED') return { teamId, problemIndex: j };
      }
    }
    return null;
  }

  function revealProblem(sim, info) {
    const oldState = sim.contestState;
    const oldResult = resultOf(oldState, info.teamId, info.problemIndex);
    if (!oldResult || oldResult.status !== 'SUBMITTED') return { solved: false, moved: false, state: oldState };
    const problem = model.problems[info.problemIndex];
    const list = model.submissionsByTeamProblem.get(`${info.teamId}\u0000${problem.id}`) || [];
    const beforeOrder = orderOf(oldState, info.teamId);
    for (const sub of list) {
      if (sub.contestTime < model.freezeMs || sim.revealed.has(sub.id)) continue;
      const jt = judgementTypeForSubmission(sub.id);
      if (!jt || (!jt.solved && !jt.penalty)) continue;
      sim.revealed.add(sub.id);
      sim.contestState = computeContest(sim.revealed);
      const nr = resultOf(sim.contestState, info.teamId, info.problemIndex);
      if (nr?.score > oldResult.score) break;
    }
    const nr = resultOf(sim.contestState, info.teamId, info.problemIndex);
    const solved = nr?.status === 'SOLVED';
    const afterOrder = orderOf(sim.contestState, info.teamId);
    return { solved, moved: solved && beforeOrder !== afterOrder, state: sim.contestState, beforeOrder, afterOrder };
  }

  function cloneView(v) {
    return {
      contestState: v.contestState,
      presentation: v.presentation,
      scrollRow: v.scrollRow,
      selectedTeamIds: [...v.selectedTeamIds],
      selectType: v.selectType,
      selectedProblem: v.selectedProblem ? { ...v.selectedProblem } : null,
      awardTeamId: v.awardTeamId,
      awardList: v.awardList ? [...v.awardList] : null,
      recent: v.recent ? { ...v.recent } : null,
    };
  }

  function awardType(id) {
    if (id === 'winner') return 'winner';
    if (/^rank-/.test(id)) return 'rank';
    if (/-medal$/.test(id)) return 'medal';
    if (/^first-to-solve-/.test(id)) return 'fts';
    if (/^group-winner-/.test(id)) return 'group';
    return 'other';
  }

  function buildResolution() {
    const sim = { revealed: new Set(), contestState: null };
    sim.contestState = computeContest(sim.revealed);
    const initialState = sim.contestState;
    const steps = [];
    const pauseIndices = [];
    const pauseViews = [];
    let pauseNo = 0;
    let view = {
      contestState: initialState, presentation: 'splash', scrollRow: -1, selectedTeamIds: [], selectType: 'normal',
      selectedProblem: null, awardTeamId: null, awardList: null, recent: null,
    };

    const emit = (type, patch = {}, meta = {}) => {
      Object.assign(view, patch);
      const v = cloneView(view);
      steps.push({ type, view: v, ...meta });
      return steps[steps.length - 1];
    };
    const delay = (kind) => steps.push({ type: 'delay', kind, ms: DELAY[kind] || 0 });
    const pause = () => {
      const p = { type: 'pause', num: pauseNo++, view: cloneView(view) };
      steps.push(p); pauseIndices.push(steps.length - 1); pauseViews.push(p.view);
    };
    const timing = (mode, kind) => {
      if (mode === 'pause') {
        if (kind === 'DESELECT' || kind === 'SELECT_SUBMISSION') return;
        pause();
      } else {
        if (kind === 'SELECT_SUBMISSION') return;
        delay(kind);
      }
    };

    // Official ResolverLogic.resolveFrom() initial pause sequence.
    emit('presentation', { presentation: 'splash', contestState: sim.contestState });
    pause();
    emit('scroll', { scrollRow: 0 });
    emit('presentation', { presentation: 'scoreboard' });
    pause();
    emit('scroll', { scrollRow: sim.contestState.order.length - 1 });
    pause();

    const bottom = sim.contestState.order[sim.contestState.order.length - 1];
    if (bottom != null) emit('select-team', { selectedTeamIds: [bottom], selectType: 'normal' });
    pause();

    // Default single-step threshold used by ICPC Tools when awards exist.
    let singleStepStartRow = -1;
    if (model.awards.length > 0) {
      const finalReveal = new Set(model.submissions.filter((s) => {
        if (s.contestTime < model.freezeMs) return false;
        const jt = judgementTypeForSubmission(s.id);
        return Boolean(jt && (jt.penalty || jt.solved));
      }).map((s) => s.id));
      const finalState = computeContest(finalReveal);
      let lastBronze = Math.min(12, finalState.order.length);
      const bronze = model.awards.find((a) => String(a.id).includes('bronze') && /-medal$/.test(String(a.id)));
      if (bronze) {
        lastBronze = 0;
        for (const tid of bronze.teamIds) {
          const row = finalState.order.indexOf(tid);
          if (row >= 0) lastBronze = Math.max(lastBronze, row + 1);
        }
      }
      singleStepStartRow = Math.max(singleStepStartRow, lastBronze - 1);
      for (const a of model.awards.filter((a) => /-medal$/.test(String(a.id)))) {
        for (const tid of a.teamIds) {
          const row = finalState.order.indexOf(tid);
          if (row >= 0) singleStepStartRow = Math.max(singleStepStartRow, row);
        }
      }
    }

    const awardsByTeam = new Map();
    for (const a of model.awards) {
      for (const tid of a.teamIds || []) {
        if (!awardsByTeam.has(tid)) awardsByTeam.set(tid, []);
        awardsByTeam.get(tid).push(a);
      }
    }

    let mode = 'scoreboard';
    let runInfo = getNextResolve(sim.contestState);
    let currentRow = sim.contestState.order.length - 1;
    let guard = 0;

    while (currentRow >= 0) {
      if (++guard > 100000) throw new Error('Resolver step generation exceeded its safety limit.');
      if (currentRow <= singleStepStartRow) mode = 'pause';
      emit('scroll', { scrollRow: currentRow });

      let doneWithRow = false;
      while (!doneWithRow) {
        if (++guard > 100000) throw new Error('Resolver step generation exceeded its safety limit.');
        const teamId = sim.contestState.order[currentRow];
        if (teamId == null) { doneWithRow = true; break; }

        emit('select-team', { selectedTeamIds: [teamId], selectType: 'normal', selectedProblem: null });
        timing(mode, 'SELECT_TEAM');

        if (!runInfo || runInfo.teamId !== teamId) {
          if (mode === 'scoreboard') timing(mode, 'SELECT_PROBLEM');
          timing(mode, 'DESELECT');
          doneWithRow = true;
        } else {
          while (runInfo && runInfo.teamId === teamId && orderOf(sim.contestState, teamId) === currentRow) {
            const p = model.problems[runInfo.problemIndex];
            emit('select-problem', { selectedProblem: { teamId, problemIndex: runInfo.problemIndex } });
            timing(mode, 'SELECT_PROBLEM');

            const outcome = revealProblem(sim, runInfo);

            // Official ICPC Resolver behaviour during SOLVED_MOVE:
            // the promoted team remains the selected (light-blue) team while its row starts
            // moving upward. The solved problem cell turns green on top of that selection, and
            // the selected problem remains highlighted until the following DESELECT step.
            // Only when the next TeamSelectionStep is reached does the light-blue selection move
            // to the team now occupying the row being resolved. If the promotion is large, that
            // hand-off can happen while the promoted row is still physically moving.
            const nextTeamAfterMove = outcome.moved ? sim.contestState.order[currentRow] : teamId;
            emit('judgement', {
              contestState: sim.contestState,
              selectedTeamIds: [teamId],
              selectType: 'normal',
              selectedProblem: view.selectedProblem,
              recent: { teamId, problemId: p.id, result: outcome.solved ? 'SOLVED' : 'FAILED' },
            }, { outcome, promotedTeamId: outcome.moved ? teamId : null, nextTeamId: outcome.moved ? nextTeamAfterMove : null });
            if (outcome.solved) timing(mode, outcome.moved ? 'SOLVED_MOVE' : 'SOLVED_STAY');
            else timing(mode, 'FAILED');

            emit('deselect-problem', { selectedProblem: null, recent: null });
            timing(mode, 'DESELECT');
            runInfo = getNextResolve(sim.contestState);
          }
          doneWithRow = orderOf(sim.contestState, teamId) === currentRow && (!runInfo || runInfo.teamId !== teamId);
        }

        if (doneWithRow) {
          const teamAwards = awardsByTeam.get(teamId);
          if (teamAwards?.length) {
            // If we're single-stepping, make sure the resolution itself is visible before award highlight.
            if (mode === 'pause' && steps[steps.length - 1]?.type !== 'pause') pause();
            const hasFTS = teamAwards.some((a) => awardType(a.id) === 'fts');
            // Official ResolverLogic has ScrollStep(currentRow) before the award highlight.
            // In the browser build non-interesting rows are folded away, so make this frame snap
            // to the correct viewport first; otherwise an award team can still be off-screen when
            // the highlight pause is reached.
            emit('award-highlight', {
              scrollRow: currentRow,
              selectedTeamIds: [teamId], selectType: hasFTS ? 'fts-highlight' : 'highlight', selectedProblem: null,
            }, { snapScroll: true });
            pause();
            emit('award', {
              presentation: 'award', awardTeamId: teamId, awardList: teamAwards,
            });
            pause();
            emit('presentation', {
              presentation: 'scoreboard', awardTeamId: null, awardList: null,
            });
            pause();
            awardsByTeam.delete(teamId);
            // Resolver returns to normal scoreboard timing, then re-enters pause mode in medal region.
            mode = currentRow <= singleStepStartRow ? 'pause' : 'scoreboard';
          }
        }
      }
      currentRow--;
    }

    emit('deselect-team', { selectedTeamIds: [], selectType: 'normal', selectedProblem: null });
    pause();

    model.steps = steps;
    model.pauseIndices = pauseIndices;
    model.pauseViews = pauseViews;
    return { initialState, finalState: sim.contestState, singleStepStartRow };
  }

  function buildManualFrames() {
    // One Enter should correspond to a meaningful Resolver stop, not to every internal
    // ContestState/scroll/deselect operation. This mirrors PauseTiming semantics:
    // team selection -> problem selection -> judgement, with deselection/row scrolling
    // folded into the next meaningful stop. During a rank-changing solve, the judgement
    // frame keeps the promoted team selected while it starts moving; the following
    // TeamSelectionStep transfers selection to the team now occupying the resolved row.
    // Award highlights carry a
    // snapScroll flag so their ScrollStep is completed before the highlight is shown.
    const frames = [];
    let lastSig = null;
    let scoreboardShown = false;
    let initialBottomScrollKept = false;
    let firstTeamSelectionSeen = false;

    const signature = (v) => {
      if (v.presentation === 'scoreboard') {
        const st = v.contestState;
        const order = st?.order?.join('|') || '';
        const scores = st ? st.order.map((tid) => {
          const x = st.standings.get(tid);
          return `${tid}:${x.rank}:${x.numSolved}:${x.time}`;
        }).join('|') : '';
        const probs = st ? st.order.map((tid) => model.problems.map((p) => {
          const r = st.results.get(tid).get(p.id);
          return `${r.status}:${r.numPending}:${r.numJudged}:${r.time}:${r.fts?1:0}`;
        }).join(',')).join('|') : '';
        return ['scoreboard', v.scrollRow, order, scores, probs, (v.selectedTeamIds||[]).join(','), v.selectType,
          v.selectedProblem ? `${v.selectedProblem.teamId}:${v.selectedProblem.problemIndex}` : ''].join('~');
      }
      if (v.presentation === 'award') return `award~${v.awardTeamId}~${(v.awardList||[]).map((a)=>a.id).join(',')}`;
      return v.presentation;
    };

    const add = (i, step) => {
      const sig = signature(step.view);
      if (sig === lastSig) return;
      frames.push({ stepIndex: i, type: step.type, view: cloneView(step.view), outcome: step.outcome || null, snapScroll: Boolean(step.snapScroll) });
      lastSig = sig;
    };

    for (let i = 0; i < model.steps.length; i++) {
      const step = model.steps[i];
      if (step.type === 'delay' || step.type === 'pause') continue;

      if (step.type === 'presentation') {
        add(i, step);
        if (step.view?.presentation === 'scoreboard') scoreboardShown = true;
        continue;
      }

      if (step.type === 'scroll') {
        // Keep the Resolver's initial "scroll to bottom" click, but fold all later
        // row-following scrolls into the next team/problem selection.
        if (scoreboardShown && !firstTeamSelectionSeen && !initialBottomScrollKept && step.view?.presentation === 'scoreboard') {
          add(i, step);
          initialBottomScrollKept = true;
        }
        continue;
      }

      if (step.type === 'award-highlight') {
        firstTeamSelectionSeen = true;
        add(i, step);
        continue;
      }

      if (step.type === 'select-team') {
        // Official ResolverLogic always emits TeamSelectionStep(team) for every row, even when
        // that team has no pending submission. In manual/browser stepping this visible blue
        // selection is the confirmation that the row/rank is settled. Do not collapse it away.
        // Deselect remains folded into the next meaningful frame, so this costs one confirmation
        // stop per team rather than a separate deselect stop.
        add(i, step);
        firstTeamSelectionSeen = true;
        continue;
      }

      if (step.type === 'select-problem' || step.type === 'judgement' || step.type === 'award' || step.type === 'deselect-team') {
        add(i, step);
        continue;
      }

      // Deliberately skip deselect-problem: the deselection is visible as part of the
      // next meaningful frame, matching the Resolver's no-pause DESELECT state.
    }
    model.frames = frames;
  }

  function scoreboardOrder(sb) { return normalizeScoreboard(sb).map((r) => r.teamId); }

  function validateFinal(finalState) {
    const actual = normalizeScoreboard(model.finalScoreboard).filter((r) => model.finalTeamIds.has(r.teamId));
    const actualOrder = actual.map((r) => r.teamId);
    const ours = finalState.order;
    const sameOrder = actualOrder.length === ours.length && actualOrder.every((id, i) => id === ours[i]);
    const scoreMismatch = [];
    const actualMap = new Map(actual.map((r) => [r.teamId, r]));
    for (const tid of ours) {
      const a = actualMap.get(tid), s = finalState.standings.get(tid);
      if (!a || !s) continue;
      if (Number(a.numSolved) !== Number(s.numSolved)) scoreMismatch.push(`${tid}: solved ${s.numSolved} != ${a.numSolved}`);
      // DOMjudge may be configured to express total_time in seconds; accept minute or second scale here.
      const at = Number(a.totalTime || 0);
      if (!(at === s.time || at === s.time * 60)) scoreMismatch.push(`${tid}: time ${s.time} != ${at}`);
    }
    if (!sameOrder || scoreMismatch.length) {
      const lines = [
        'DOMjudge の最終順位表とブラウザ側の ICPC モデルが一致しません。誤った resolve を表示しないため停止しました。',
        `order match: ${sameOrder}`,
        ...scoreMismatch.slice(0, 8),
      ];
      throw new Error(lines.join('\n'));
    }
  }

  function loadJuryArrays(cid) {
    const e = encodeURIComponent(cid);
    return Promise.all([
      json(`/contests/${e}`),
      json(`/contests/${e}/teams`),
      json(`/contests/${e}/problems`),
      json(`/contests/${e}/submissions`),
      json(`/contests/${e}/judgements`),
      tryJson([`/contests/${e}/judgement-types`, '/judgement-types'], []),
      tryJson([`/contests/${e}/organizations`], []),
      tryJson([`/contests/${e}/awards`], []),
      json(`/contests/${e}/scoreboard`),
    ]);
  }

  async function loadContest(cid) {
    const seq = ++model.loadSeq;
    showSetup('Loading contest data…');
    const [contest, teamsRaw, problemsRaw, submissionsRaw, judgementsRaw, jtRaw, orgRaw, awardsRaw, finalScoreboard] = await loadJuryArrays(cid);
    if (seq !== model.loadSeq) return;

    const scoreboardType = String(pick(contest, 'scoreboard_type', 'scoreboardType') ?? 'pass-fail').toLowerCase();
    if (scoreboardType !== 'pass-fail') throw new Error(`scoreboard_type=${scoreboardType} はこの版では対象外です。公式 ICPC pass-fail resolver の再現に限定しています。`);
    if (Boolean(pick(contest, 'runtime_as_score_tiebreaker', 'runtimeAsScoreTiebreaker'))) throw new Error('runtime-as-score-tiebreaker は公式 ICPC Resolver と同じ順位規則にならないため対象外です。');

    model.cid = cid;
    model.contest = contest;
    model.penaltyMinutes = Number(pick(contest, 'penalty_time', 'penaltyTime') ?? 20);
    model.durationMs = durationMs(pick(contest, 'duration'));
    const freezeDuration = durationMs(pick(contest, 'scoreboard_freeze_duration', 'scoreboardFreezeDuration'));
    if (model.durationMs == null) throw new Error('Contest API の duration を解釈できません。');
    if (freezeDuration == null || freezeDuration <= 0) throw new Error('この contest には scoreboard_freeze_duration が設定されていません。');
    model.freezeMs = model.durationMs - freezeDuration;

    const teams = arr(teamsRaw, 'teams');
    model.teams = new Map(teams.map((t) => [idOf(t), t]));
    const orgs = arr(orgRaw, 'organizations');
    model.organizations = new Map(orgs.map((o) => [idOf(o), o]));

    model.problems = arr(problemsRaw, 'problems').map(normalizeProblem)
      .sort((a, b) => a.ordinal - b.ordinal || a.label.localeCompare(b.label));
    if (!model.problems.length) throw new Error('Problem list is empty.');

    model.finalScoreboard = finalScoreboard;
    const finalRows = normalizeScoreboard(finalScoreboard);
    model.finalTeamIds = new Set(finalRows.map((r) => r.teamId));
    if (!model.finalTeamIds.size) throw new Error('Final scoreboard is empty.');

    model.submissions = arr(submissionsRaw, 'submissions').map(normalizeSubmission)
      .filter((s) => s.id && s.teamId && s.problemId && s.contestTime != null)
      .sort((a, b) => a.contestTime - b.contestTime || a.id.localeCompare(b.id));

    model.judgementTypes = new Map(arr(jtRaw, 'judgement_types').map(normalizeJudgementType).map((jt) => [jt.id, jt]));
    const judgements = arr(judgementsRaw, 'judgements').map(normalizeJudgement);
    model.judgementBySubmission = new Map();
    // DOMjudge's list endpoint already returns valid/current judgements; last one wins defensively.
    for (const j of judgements) if (j.submissionId) model.judgementBySubmission.set(j.submissionId, j);

    model.awards = arr(awardsRaw, 'awards').map((a) => ({
      id: String(pick(a, 'id') ?? ''),
      citation: String(pick(a, 'citation') ?? ''),
      teamIds: (pick(a, 'team_ids', 'teamIds') || []).map(String),
    })).filter((a) => a.id && a.teamIds.length);

    buildIndexes();

    const postFreezeRelevant = model.submissions.filter((s) => s.contestTime >= model.freezeMs && s.contestTime < model.durationMs && model.finalTeamIds.has(s.teamId));
    const missingJudgements = postFreezeRelevant.filter((s) => !model.judgementBySubmission.has(s.id));
    if (missingJudgements.length) {
      throw new Error(`凍結後 submission のうち ${missingJudgements.length} 件に最終 judgement がありません。全 judging 完了後に実行してください。`);
    }

    const built = buildResolution();
    validateFinal(built.finalState);
    buildManualFrames();
    if (!model.frames.length) throw new Error('Resolver frame generation failed.');

    model.frameIndex = 0;
    model.currentPause = 0;
    model.currentStepIndex = model.frames[0].stepIndex;
    model.view = cloneView(model.frames[0].view);
    model.busy = false;
    model.delayFactor = 1;
    model.scrollFactor = 1;
    model.showInfo = false;
    model.motionUntil = 0;
    model.renderedView = null;
    model.manualScrollTop = null;

    preparePresentation();
    renderView(model.view, false);
    hideSetup();
    toast(`Loaded: ${pick(contest, 'name') || cid} / ${model.frames.length} resolver stops`, 1800);
  }

  const optionalImageCache = new Map();
  async function setOptionalImage(img, url) {
    if (!img) return;
    if (!url) { img.removeAttribute('src'); img.style.display = 'none'; return; }
    let ok = optionalImageCache.get(url);
    if (ok == null) {
      try {
        const r = await fetch(url, { method: 'HEAD', credentials: 'same-origin', cache: 'no-store' });
        ok = r.ok;
      } catch (_) {
        ok = false;
      }
      optionalImageCache.set(url, ok);
    }
    if (ok) {
      img.src = url;
      img.style.display = '';
    } else {
      img.removeAttribute('src');
      img.style.display = 'none';
    }
  }

  function preparePresentation() {
    ui.rows.innerHTML = '';
    for (const tid of model.finalTeamIds) {
      const row = document.createElement('div');
      row.className = 'djr-row';
      row.dataset.teamId = tid;
      row.innerHTML = `
        <div class="djr-rank"></div>
        <div class="djr-logo-wrap"><img class="djr-logo" alt=""></div>
        <div class="djr-name"></div>
        <div class="djr-problems"></div>
        <div class="djr-solved"></div><div class="djr-time"></div>`;
      const orgId = teamOrgId(tid);
      const img = row.querySelector('.djr-logo');
      if (orgId) {
        setOptionalImage(img, `${model.apiRoot}/contests/${encodeURIComponent(model.cid)}/organizations/${encodeURIComponent(orgId)}/logo`);
      } else img.style.display = 'none';
      row.querySelector('.djr-name').textContent = teamName(tid);
      const ph = row.querySelector('.djr-problems');
      for (let i = 0; i < model.problems.length; i++) {
        const c = document.createElement('div');
        c.className = 'djr-problem';
        c.dataset.problemIndex = String(i);
        ph.appendChild(c);
      }
      ui.rows.appendChild(row);
    }

    ui.splashTitle.textContent = String(pick(model.contest, 'name') ?? model.cid);
    const initial = model.pauseViews[0]?.contestState;
    let pending = 0;
    if (initial) for (const tid of initial.order) for (const p of model.problems) pending += initial.results.get(tid).get(p.id).numPending;
    ui.splashPending.textContent = `${pending} pending submission${pending === 1 ? '' : 's'}`;
    setOptionalImage(ui.splashBanner, `${model.apiRoot}/contests/${encodeURIComponent(model.cid)}/banner`);
  }

  function setPresentation(name) {
    ui.splash.classList.toggle('on', name === 'splash');
    ui.board.classList.toggle('on', name === 'scoreboard');
    ui.award.classList.toggle('on', name === 'award');
  }

  function medalBackground(teamId, position) {
    for (const a of model.awards) {
      if (!a.teamIds.includes(teamId)) continue;
      if (a.id === 'gold-medal') return COLORS.gold;
      if (a.id === 'silver-medal') return COLORS.silver;
      if (a.id === 'bronze-medal') return COLORS.bronze;
    }
    return null;
  }

  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  function textWidth(text, px, italic = false) {
    if (!measureCtx) return String(text).length * px * 0.55;
    measureCtx.font = `${italic ? 'italic ' : ''}700 ${px}px Helvetica, Arial, sans-serif`;
    return measureCtx.measureText(String(text)).width;
  }

  // ICPC Tools Animator movement curve. Scoreboard rows use Movement(4,7), scrolling uses Movement(4,6).
  function movementDurationRows(distance, maxSpeed = 7) {
    const d = Math.abs(distance);
    if (d <= 1e-9) return 0;
    const a = 4;
    const mt = maxSpeed / a;
    const accelDecelDistance = a * mt * mt;
    if (d <= accelDecelDistance) return 2 * Math.sqrt(d / a);
    return 2 * mt + (d - accelDecelDistance) / maxSpeed;
  }

  function movementKeyframes(from, to, rowH, maxSpeed = 7) {
    const d = Math.abs(to - from);
    if (d <= 1e-9) return [{ transform:`translate3d(0,${to*rowH}px,0)` }];
    const sign = Math.sign(to - from);
    const a = 4;
    const mt = maxSpeed / a;
    let t1 = Math.sqrt(d / a), coast = 0;
    if (t1 > mt) {
      const accelDecelDistance = a * mt * mt;
      coast = (d - accelDecelDistance) / maxSpeed;
      t1 = mt;
    }
    const T = 2 * t1 + coast;
    const n = Math.max(18, Math.ceil(T * 30));
    const frames = [];
    for (let i = 0; i <= n; i++) {
      const t = T * i / n;
      let x;
      if (t < t1) x = (a * t * t) / 2;
      else if (t < t1 + coast) x = (a*t1*t1)/2 + (t-t1)*maxSpeed;
      else {
        const rem = T - t;
        x = d - (a * rem * rem) / 2;
      }
      frames.push({ offset:i/n, transform:`translate3d(0,${(from + sign*x)*rowH}px,0)` });
    }
    return frames;
  }

  function currentDisplayRow(row, rowH, fallback) {
    try {
      const tr = getComputedStyle(row).transform;
      if (tr && tr !== 'none') {
        const m3 = tr.match(/^matrix3d\((.+)\)$/);
        if (m3) {
          const a = m3[1].split(',').map(Number);
          if (Number.isFinite(a[13])) return a[13] / rowH;
        }
        const m2 = tr.match(/^matrix\((.+)\)$/);
        if (m2) {
          const a = m2[1].split(',').map(Number);
          if (Number.isFinite(a[5])) return a[5] / rowH;
        }
      }
    } catch (_) {}
    const ds = Number(row.dataset.displayRow);
    return Number.isFinite(ds) ? ds : fallback;
  }

  function resolverFinished() {
    return Boolean(model.frames.length && model.frameIndex === model.frames.length - 1 && model.view?.presentation === 'scoreboard');
  }

  function maxManualScrollTop() {
    return Math.max(0, (model.view?.contestState?.order?.length || 0) - ROWS_PER_SCREEN);
  }

  function setManualScrollTop(value) {
    if (!resolverFinished()) return;
    const max = maxManualScrollTop();
    model.manualScrollTop = Math.max(0, Math.min(max, Number(value) || 0));
    renderBoard(model.view, false);
  }

  function renderBoard(view, animate = true) {
    const state = view.contestState;
    const h = ui.board.clientHeight || innerHeight;
    const w = ui.board.clientWidth || innerWidth;
    // Port the Java2D user-space sizes directly. The previous version multiplied
    // them by 96/72 a second time, making all text 4/3 too large.
    const nominalRowH = h / ROWS_PER_SCREEN;
    const nominalHeaderFontPx = Math.min(h * 0.021, nominalRowH * 0.3028125);
    const headerPx = Math.max(1, Math.round(h / 50), Math.ceil(nominalHeaderFontPx * 1.12));
    const rowH = (h - headerPx) / ROWS_PER_SCREEN;
    const rowFontPx = rowH * 0.4453125;
    const statusFontPx = rowH * 0.249375;
    const problemFontPx = rowH * 0.178125;
    const headerFontPx = Math.min(h * 0.021, rowH * 0.3028125, headerPx * 0.9);
    const border = 8;
    const rankW = textWidth('199', rowFontPx, true);
    const rankSpaceW = textWidth('199 ', rowFontPx, true);
    const logoLeft = border + rankSpaceW;
    const logoW = rowH;
    const nameLeft = border + rankSpaceW + rowH;
    const solvedW = textWidth('99', rowFontPx, true);
    const solvedCenter = w - border - textWidth(' 9999', rowFontPx) - solvedW / 2;
    const timeW = textWidth('9999', rowFontPx);
    const timeCenter = w - border - timeW / 2;
    const headerSolvedW = textWidth('Solved', headerFontPx, true);
    const headerSolvedLeft = w - border - textWidth(' 9999', rowFontPx) - (headerSolvedW + solvedW) / 2;
    const headerTimeW = textWidth('Time', headerFontPx);
    const headerTimeLeft = w - border - (headerTimeW + timeW) / 2;
    let cubeW = Math.floor(((rowH / 1.8) - 5) * 10);
    while (cubeW > 30 && (cubeW + 5) * model.problems.length > w - rowH * 3 - 70) cubeW -= 2;
    cubeW = Math.max(30, cubeW);
    const cubeH = Math.max(6, Math.floor(rowH / 2.5) - 5);
    const problemTop = Math.floor(rowH * 0.6) + 1.5;
    const nameRight = Math.max(0, w - (nameLeft + Math.max(0, w - border * 2 - textWidth('199 9 9999 ', rowFontPx) - rowH)));
    ui.board.style.setProperty('--header-px', `${headerPx}px`);
    ui.board.style.setProperty('--header-h', `${headerPx}px`);
    ui.board.style.setProperty('--header-font', `${headerFontPx}px`);
    ui.board.style.setProperty('--row-h', `${rowH}px`);
    ui.board.style.setProperty('--row-font', `${rowFontPx}px`);
    ui.board.style.setProperty('--status-font', `${statusFontPx}px`);
    ui.board.style.setProperty('--problem-font', `${problemFontPx}px`);
    ui.board.style.setProperty('--rank-left', `${border}px`);
    ui.board.style.setProperty('--rank-w', `${rankW}px`);
    ui.board.style.setProperty('--logo-left', `${logoLeft}px`);
    ui.board.style.setProperty('--logo-w', `${logoW}px`);
    ui.board.style.setProperty('--name-left', `${nameLeft}px`);
    ui.board.style.setProperty('--name-right', `${nameRight}px`);
    ui.board.style.setProperty('--name-h', `${Math.max(1, problemTop - 7)}px`);
    ui.board.style.setProperty('--cube-w', `${cubeW}px`);
    ui.board.style.setProperty('--cube-h', `${cubeH}px`);
    ui.board.style.setProperty('--problem-top', `${problemTop}px`);
    ui.board.style.setProperty('--solved-left', `${solvedCenter - solvedW/2}px`);
    ui.board.style.setProperty('--solved-w', `${solvedW}px`);
    ui.board.style.setProperty('--time-left', `${timeCenter - timeW/2}px`);
    ui.board.style.setProperty('--time-w', `${timeW}px`);
    ui.board.style.setProperty('--header-solved-left', `${headerSolvedLeft}px`);
    ui.board.style.setProperty('--header-solved-w', `${headerSolvedW}px`);
    ui.board.style.setProperty('--header-time-left', `${headerTimeLeft}px`);
    ui.board.style.setProperty('--header-time-w', `${headerTimeW}px`);

    const rawScroll = view.scrollRow == null ? 0 : Number(view.scrollRow);
    let resolverScrollTop = Math.max(0, rawScroll - ROWS_PER_SCREEN + 3);
    // Award highlight is only meaningful if the awarded team is visibly on screen. In the
    // official Resolver the ScrollStep is completed before TeamSelectionStep(HIGHLIGHT). Since
    // no-work rows are folded in this browser build, derive the viewport from the selected
    // award team itself as a final guard against a transient blank/disappearing row.
    if ((view.selectType === 'highlight' || view.selectType === 'fts-highlight') && view.selectedTeamIds?.length) {
      const awardPos = state.order.indexOf(view.selectedTeamIds[0]);
      if (awardPos >= 0) resolverScrollTop = Math.max(0, Math.min(maxManualScrollTop(), awardPos - ROWS_PER_SCREEN + 3));
    }
    const scrollTop = resolverFinished() && model.manualScrollTop != null
      ? Math.max(0, Math.min(maxManualScrollTop(), model.manualScrollTop))
      : resolverScrollTop;
    const selectedSet = new Set(view.selectedTeamIds || []);

    state.order.forEach((tid, pos) => {
      const row = ui.rows.querySelector(`.djr-row[data-team-id="${cssEscape(tid)}"]`);
      if (!row) return;
      const targetDisplayRow = pos - scrollTop;
      const previousTarget = Number(row.dataset.targetDisplayRow);
      const currentRow = currentDisplayRow(row, rowH, targetDisplayRow);
      const activeAnimations = row.getAnimations().filter((a) => a.playState === 'running' || a.playState === 'pending');
      const sameTarget = Number.isFinite(previousTarget) && Math.abs(previousTarget - targetDisplayRow) < 1e-6;

      row.style.setProperty('--y', `${targetDisplayRow * rowH}px`);
      row.style.transform = `translate3d(0,${targetDisplayRow * rowH}px,0)`;

      if (!(animate && sameTarget && activeAnimations.length)) {
        activeAnimations.forEach((a) => a.cancel());
        if (animate && Math.abs(targetDisplayRow - currentRow) > 1e-6) {
          const orderChanged = model.renderedView?.contestState?.order?.indexOf(tid) !== pos;
          const maxSpeed = orderChanged ? 7 : 6;
          const duration = movementDurationRows(targetDisplayRow - currentRow, maxSpeed) * 1000 / model.scrollFactor;
          row.animate(movementKeyframes(currentRow, targetDisplayRow, rowH, maxSpeed), { duration, easing:'linear' });
          model.motionUntil = Math.max(model.motionUntil, performance.now() + duration);
        }
      }
      row.dataset.displayRow = String(targetDisplayRow);
      row.dataset.targetDisplayRow = String(targetDisplayRow);
      row.classList.toggle('even', pos % 2 === 0);
      const selected = selectedSet.has(tid);
      row.classList.toggle('selected', selected && view.selectType === 'normal');
      row.classList.toggle('highlight', selected && view.selectType === 'highlight');
      row.classList.toggle('fts', selected && view.selectType === 'fts');
      row.classList.toggle('fts-highlight', selected && view.selectType === 'fts-highlight');
      row.classList.toggle('team-list', selected && view.selectType === 'team-list');
      row.style.zIndex = selected ? '100' : String(20 + state.order.length - pos);
      row.querySelector('.djr-rank').textContent = state.standings.get(tid).rank || '';
      const st = state.standings.get(tid);
      row.querySelector('.djr-solved').textContent = st.numSolved > 0 ? String(st.numSolved) : '';
      row.querySelector('.djr-time').textContent = st.time > 0 ? String(st.time) : '';

      const cells = row.querySelectorAll('.djr-problem');
      model.problems.forEach((p, pi) => {
        const c = cells[pi];
        const r = state.results.get(tid).get(p.id);
        c.className = 'djr-problem';
        if (r.status === 'SUBMITTED') c.classList.add('pending');
        else if (r.status === 'SOLVED') c.classList.add(r.fts ? 'fts' : 'solved');
        else if (r.status === 'FAILED') c.classList.add('failed');
        c.style.fontSize = (r.status === 'UNATTEMPTED' ? `${problemFontPx}px` : `${statusFontPx}px`);
        const isFocus = view.selectedProblem && view.selectedProblem.teamId === tid && view.selectedProblem.problemIndex === pi;
        c.classList.toggle('focus', Boolean(isFocus));
        const n = r.numPending + r.numJudged;
        if (r.status === 'UNATTEMPTED' || n === 0) c.textContent = p.label;
        else c.textContent = `${n}\u200A-\u200A${timeMin(r.time)}`;
        c.title = `${p.label}: ${r.status}`;
      });
    });

    // Rows outside the currently visible 12-row viewport remain clipped by the board.
    renderInfo(view, rowH, headerPx, scrollTop);
  }

  function renderInfo(view, rowH, headerPx, scrollTop) {
    if (!model.showInfo || !view.selectedProblem || view.presentation !== 'scoreboard') {
      ui.info.classList.remove('on'); return;
    }
    const { teamId, problemIndex } = view.selectedProblem;
    const p = model.problems[problemIndex];
    const r = resultOf(view.contestState, teamId, problemIndex);
    if (!r || r.status !== 'SUBMITTED') { ui.info.classList.remove('on'); return; }
    const list = (model.submissionsByTeamProblem.get(`${teamId}\u0000${p.id}`) || []).filter((s) => s.contestTime >= model.freezeMs && !view.contestState.revealed.has(s.id));
    const pos = orderOf(view.contestState, teamId);
    const screenY = headerPx + (pos - scrollTop) * rowH;
    const above = screenY > innerHeight / 2;
    ui.info.style.top = above ? 'auto' : `${Math.max(headerPx + 10, screenY + rowH + 15)}px`;
    ui.info.style.bottom = above ? `${Math.max(15, innerHeight - screenY + 15)}px` : 'auto';
    ui.info.innerHTML = `<div class="djr-info-title">${escapeHtml(teamName(teamId))} — ${escapeHtml(p.label)}</div><div class="djr-info-runs">${list.slice(0,12).map((s) => `<div class="djr-info-run">${timeMin(s.contestTime)}</div>`).join('')}</div>`;
    ui.info.classList.add('on');
  }

  function renderAward(view) {
    const tid = view.awardTeamId;
    const awards = view.awardList || [];
    ui.awardTeam.textContent = teamName(tid);
    ui.awardCitations.innerHTML = awards.map((a) => `<div class="djr-award-citation">${escapeHtml(a.citation || a.id)}</div>`).join('');
    const orgId = teamOrgId(tid);
    if (orgId) {
      setOptionalImage(ui.awardLogo, `${model.apiRoot}/contests/${encodeURIComponent(model.cid)}/organizations/${encodeURIComponent(orgId)}/logo`);
    } else {
      ui.awardLogo.removeAttribute('src');
      ui.awardLogo.style.display = 'none';
    }
    setOptionalImage(ui.awardPhoto, `${model.apiRoot}/contests/${encodeURIComponent(model.cid)}/teams/${encodeURIComponent(tid)}/photo`);
  }

  function renderView(view, animate = true) {
    const previous = model.renderedView;
    model.view = cloneView(view);
    setPresentation(view.presentation);
    if (view.presentation === 'scoreboard') renderBoard(view, animate);
    else if (view.presentation === 'award') renderAward(view);
    model.renderedView = cloneView(view);
    return previous;
  }

  function forwardStep() {
    if (!model.frames.length || model.frameIndex >= model.frames.length - 1) return;
    const now = performance.now();
    if (now - model.lastActionAt < 110) return;
    model.lastActionAt = now;
    model.frameIndex++;
    const frame = model.frames[model.frameIndex];
    model.currentStepIndex = frame.stepIndex;
    // Award highlights must appear only once their row is actually in the viewport. The Java
    // Resolver performs ScrollStep before TeamSelectionStep; snapScroll preserves that ordering
    // after folded no-pending rows without consuming another Enter.
    renderView(frame.view, !frame.snapScroll);
    if (resolverFinished()) {
      const raw = frame.view.scrollRow == null ? 0 : Number(frame.view.scrollRow);
      model.manualScrollTop = Math.max(0, Math.min(maxManualScrollTop(), raw - ROWS_PER_SCREEN + 3));
      toast('Resolver complete — wheel / ↑↓ / PageUp PageDown to scroll', 2200);
    } else {
      model.manualScrollTop = null;
    }
  }

  function reverseStep() {
    if (!model.frames.length || model.frameIndex <= 0) return;
    const now = performance.now();
    if (now - model.lastActionAt < 110) return;
    model.lastActionAt = now;
    model.frameIndex--;
    const frame = model.frames[model.frameIndex];
    model.currentStepIndex = frame.stepIndex;
    model.manualScrollTop = null;
    renderView(frame.view, !frame.snapScroll);
  }

  function reset() {
    if (!model.frames.length) return;
    model.busy = false;
    model.frameIndex = 0;
    model.currentStepIndex = model.frames[0].stepIndex;
    model.motionUntil = 0;
    model.renderedView = null;
    // Reset stored row locations so the first frame never animates from stale positions.
    ui.rows.querySelectorAll('.djr-row').forEach((r) => {
      delete r.dataset.displayRow; delete r.dataset.targetDisplayRow; r.getAnimations().forEach((a)=>a.cancel());
    });
    renderView(model.frames[0].view, false);
  }

  let toastTimer = null;
  function toast(text, ms = 1200) {
    ui.toast.textContent = text;
    ui.toast.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('on'), ms);
  }

  function showSetup(content, asHtml = false) {
    ui.setup.style.display = 'flex';
    if (asHtml) ui.setupBody.innerHTML = content;
    else ui.setupBody.textContent = content;
  }
  function hideSetup() { ui.setup.style.display = 'none'; }

  function showError(err) {
    console.error('[DOMjudge Browser Resolver]', err);
    showSetup(`<pre>${escapeHtml(err?.stack || err?.message || String(err))}</pre><div class="djr-setup-actions"><button type="button" data-setup-close>Close</button></div>`, true);
    ui.setup.querySelector('[data-setup-close]')?.addEventListener('click', closeResolver, { once: true });
  }

  async function chooseAndLoadContest(forceChoice = false) {
    try {
      if (!model.apiRoot) model.contests = arr(await detectApi(), 'contests');
      if (!model.contests.length) model.contests = arr(await json('/contests?onlyActive=false'), 'contests');
      if (!model.contests.length) throw new Error('参照できる contest がありません。');
      const current = cookie('domjudge_cid');
      let cid = !forceChoice && current && model.contests.some((c) => contestIdOf(c) === current) ? current : null;
      if (!cid && !forceChoice && model.contests.length === 1) cid = contestIdOf(model.contests[0]);
      if (cid) { await loadContest(cid); return; }

      const options = model.contests.map((c) => `<option value="${escapeHtml(contestIdOf(c))}">${escapeHtml(pick(c, 'name', 'shortname') || contestIdOf(c))}</option>`).join('');
      showSetup(`<div>Select contest:</div><div class="djr-setup-actions"><select data-setup-contest>${options}</select><button type="button" data-setup-load>Load</button><button type="button" data-setup-close>Close</button></div>`, true);
      const sel = ui.setup.querySelector('[data-setup-contest]');
      if (current && [...sel.options].some((o) => o.value === current)) sel.value = current;
      ui.setup.querySelector('[data-setup-load]').addEventListener('click', async () => {
        try { await loadContest(sel.value); } catch (e) { showError(e); }
      }, { once: true });
      ui.setup.querySelector('[data-setup-close]').addEventListener('click', closeResolver, { once: true });
    } catch (e) { showError(e); }
  }

  async function openResolver() {
    root.classList.add('open');
    document.documentElement.style.overflow = 'hidden';
    if (!model.steps.length) await chooseAndLoadContest(false);
    else renderView(model.view || model.frames[model.frameIndex]?.view, false);
  }

  function closeResolver() {
    root.classList.remove('open');
    document.documentElement.style.overflow = '';
    ui.help.classList.remove('on');
    if (document.fullscreenElement === root) document.exitFullscreen().catch(() => {});
  }

  launch.addEventListener('click', openResolver);
  ui.splashNext.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!root.classList.contains('open') || model.busy) return;
    forwardStep();
  });
  // Enter advances one semantic Resolver stop; Backspace rewinds one. Row animation never blocks input.

  ui.board.addEventListener('wheel', (e) => {
    if (!root.classList.contains('open') || !resolverFinished()) return;
    e.preventDefault();
    const base = model.manualScrollTop == null ? 0 : model.manualScrollTop;
    // Trackpads get fractional row movement; mouse wheels typically move about one row per notch.
    const deltaRows = Math.max(-3, Math.min(3, e.deltaY / 100));
    setManualScrollTop(base + deltaRows);
  }, { passive: false });

  document.addEventListener('keydown', (e) => {
    if (!root.classList.contains('open')) return;
    const tag = e.target?.tagName?.toLowerCase();
    if (tag === 'select' || tag === 'input' || tag === 'textarea') return;

    if (e.key === 'Escape') {
      if (ui.help.classList.contains('on')) ui.help.classList.remove('on');
      else closeResolver();
      return;
    }
    if (e.key === '?') { e.preventDefault(); ui.help.classList.toggle('on'); return; }
    if (ui.help.classList.contains('on')) return;

    const k = e.key;
    if (resolverFinished() && ['ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(k)) {
      e.preventDefault();
      const cur = model.manualScrollTop == null ? 0 : model.manualScrollTop;
      if (k === 'ArrowUp') setManualScrollTop(cur - 1);
      else if (k === 'ArrowDown') setManualScrollTop(cur + 1);
      else if (k === 'PageUp') setManualScrollTop(cur - Math.max(1, ROWS_PER_SCREEN - 2));
      else if (k === 'PageDown') setManualScrollTop(cur + Math.max(1, ROWS_PER_SCREEN - 2));
      else if (k === 'Home') setManualScrollTop(0);
      else if (k === 'End') setManualScrollTop(maxManualScrollTop());
      return;
    }
    if (k === 'Enter') { e.preventDefault(); forwardStep(); }
    else if (k === 'Backspace') { e.preventDefault(); reverseStep(); }
    else if (k === '0') { e.preventDefault(); reset(); }
    else if (k === ']') {
      model.scrollFactor = Math.min(4, model.scrollFactor * 1.2); toast(`animation ×${model.scrollFactor.toFixed(2)}`);
    } else if (k === '[') {
      model.scrollFactor = Math.max(0.25, model.scrollFactor / 1.2); toast(`animation ×${model.scrollFactor.toFixed(2)}`);
    } else if (k.toLowerCase() === 'i') {
      model.showInfo = !model.showInfo; renderView(model.view, false); toast(`submission info ${model.showInfo ? 'on' : 'off'}`);
    }
  });

  new ResizeObserver(() => {
    if (root.classList.contains('open') && model.view?.presentation === 'scoreboard') renderBoard(model.view, false);
  }).observe(ui.stage);
})();
