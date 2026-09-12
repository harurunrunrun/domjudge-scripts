// ==UserScript==
// @name         DOMjudge Scoreboard Exporter
// @namespace    https://www.domjudge.org/
// @version      1.0.1
// @description  Export a DOMjudge jury scoreboard reconstructed at an arbitrary contest elapsed time as standalone HTML.
// @match        your domjudge url
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(() => {
    'use strict';

    if (!/\/jury(?:\/|$)/.test(location.pathname)) {
        return;
    }

    const juryPos = location.pathname.search(/\/jury(?:\/|$)/);
    const ROOT = juryPos >= 0 ? location.pathname.slice(0, juryPos) : '';
    const state = { apiBase: null, contests: null, config: null, dialog: null };

    const FALLBACK_CSS = String.raw`
body{background:#fff;color:#212529;font-family:Roboto,Arial,sans-serif;margin:0}.historical-wrap{max-width:1600px;margin:0 auto;padding:1rem}.historical-note{font-size:.875rem;color:#6c757d;margin:.5rem 0 1rem}.historical-card{border:1px solid rgba(0,0,0,.125);border-radius:.25rem;margin:1rem 0}.historical-card-header{padding:.75rem 1rem;background:rgba(0,0,0,.03);font-weight:500;display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap}.scoreboard{border-collapse:separate;border-spacing:0;width:auto;min-width:70%;margin:0 auto}.scoreboard th,.scoreboard td{padding:.2rem .4rem;text-align:center;vertical-align:middle;border-bottom:1px solid #dee2e6}.scoreboard th{font-weight:700}.scoreboard .scoretn{text-align:left;min-width:12rem;max-width:26rem}.scoreboard .scoretn .univ{display:block;font-size:75%;font-weight:normal;color:#555}.scoreboard .scorepl{min-width:2.7rem}.scoreboard .scorenc,.scoreboard .scorett{min-width:3.5rem;font-weight:700}.scoreboard .scoreprob,.scoreboard .score_cell{min-width:4.7rem}.scoreboard .score_cell{padding:1px}.scoreboard .score_cell>div,.scoreboard .score_cell>a>div{min-height:2.8rem;padding:.18rem .25rem;font-weight:700;display:flex;flex-direction:column;justify-content:center}.scoreboard .score_cell span{display:block;font-size:70%;font-weight:400}.score_correct{background:#60e760}.score_correct.score_first{background:#1daa1d}.score_incorrect{background:#e87272}.score_pending{background:#6666ff;color:#fff}.scoreheader th{border-bottom:2px solid #495057}.historical-problem-badge{display:inline-flex;align-items:center;justify-content:center;min-width:1.8rem;min-height:1.8rem;padding:.15rem .4rem;border-radius:.25rem;border:1px solid rgba(0,0,0,.25);font-weight:700}.historical-footer{text-align:center;margin:2rem 0 1rem;font-size:.8rem;color:#6c757d}@media(max-width:767px){.historical-wrap{overflow-x:auto}.scoreboard{min-width:max-content}.historical-card-header{display:block}}
`;

    function escapeHtml(value) {
        return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
    }

    function cssEscape(value) {
        return String(value ?? '').replace(/["'<>]/g, '');
    }

    function normalizeId(value) {
        return value == null ? '' : String(value);
    }

    function isTruthy(value) {
        return value === true || value === 1 || value === '1' || value === 'true';
    }

    function parseDurationSeconds(value) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        if (value == null) {
            return NaN;
        }

        let text = String(value).trim();
        if (!text) {
            return NaN;
        }

        let sign = 1;
        if (text.startsWith('-')) {
            sign = -1;
            text = text.slice(1);
        }

        if (/^\d+(?:\.\d+)?$/.test(text)) {
            return sign * Number(text);
        }

        const parts = text.split(':').map(Number);
        if (parts.some((x) => !Number.isFinite(x))) {
            return NaN;
        }

        if (parts.length === 3) {
            return sign * (parts[0] * 3600 + parts[1] * 60 + parts[2]);
        }
        if (parts.length === 2) {
            return sign * (parts[0] * 60 + parts[1]);
        }

        return NaN;
    }

    function submissionContestSeconds(submission, contest) {
        const fromContestTime = parseDurationSeconds(submission.contest_time);
        if (Number.isFinite(fromContestTime)) {
            return fromContestTime;
        }

        const start = Date.parse(contest.start_time ?? contest.starttime ?? '');
        const time = Date.parse(submission.time ?? '');
        if (Number.isFinite(start) && Number.isFinite(time)) {
            return (time - start) / 1000;
        }

        return NaN;
    }

    function formatElapsed(seconds, withSeconds = false) {
        const s = Math.max(0, Math.floor(Number(seconds) || 0));
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;

        if (withSeconds) {
            return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        }

        return String(Math.floor(s / 60));
    }

    function formatCutoff(seconds) {
        const s = Math.max(0, Math.floor(seconds));
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        return `${h}:${String(m).padStart(2, '0')}`;
    }

    function asArray(value) {
        if (Array.isArray(value)) {
            return value;
        }
        if (Array.isArray(value?.rows)) {
            return value.rows;
        }
        return [];
    }

    async function fetchJsonUrl(url, optional = false) {
        try {
            const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store' });

            if (!response.ok) {
                if (optional) {
                    return null;
                }
                throw new Error(`${response.status} ${response.statusText}: ${url}`);
            }

            return await response.json();
        } catch (error) {
            if (optional) {
                return null;
            }
            throw error;
        }
    }

    async function detectApiBase() {
        if (state.apiBase) {
            return state.apiBase;
        }

        const candidates = [`${ROOT}/api`, `${ROOT}/api/v4`];

        for (const candidate of candidates) {
            const info = await fetchJsonUrl(`${candidate}/`, true);
            if (info && typeof info === 'object') {
                state.apiBase = candidate;
                return candidate;
            }
        }

        throw new Error('Could not detect the DOMjudge API. Make sure the API is enabled on the same host as the jury interface.');
    }

    async function api(path, optional = false) {
        const base = await detectApiBase();
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;
        return fetchJsonUrl(`${base}${normalizedPath}`, optional);
    }

    async function loadConfig() {
        if (state.config) {
            return state.config;
        }

        state.config = (await api('/config', true)) ?? {};
        return state.config;
    }

    async function loadContests() {
        if (state.contests) {
            return state.contests;
        }

        const value = await api('/contests');
        state.contests = asArray(value);
        return state.contests;
    }

    function contestName(contest) {
        return contest.formal_name ?? contest.name ?? contest.shortname ?? contest.id ?? 'contest';
    }

    function chooseDefaultContest(contests) {
        const queryContest = new URLSearchParams(location.search).get('contest');

        if (queryContest) {
            const found = contests.find((c) => normalizeId(c.id) === queryContest);
            if (found) {
                return found;
            }
        }

        const hrefMatches = [...document.querySelectorAll('a[href*="contest="]')].map((a) => new URL(a.href, location.href).searchParams.get('contest')).filter(Boolean);

        for (const id of hrefMatches) {
            const found = contests.find((c) => normalizeId(c.id) === id);
            if (found) {
                return found;
            }
        }

        const now = Date.now();
        const active = contests.find((c) => {
            const start = Date.parse(c.start_time ?? c.starttime ?? '');
            const duration = parseDurationSeconds(c.duration);
            return Number.isFinite(start) && Number.isFinite(duration) && start <= now && now < start + duration * 1000;
        });

        if (active) {
            return active;
        }

        return [...contests].sort((a, b) => Date.parse(b.start_time ?? '') - Date.parse(a.start_time ?? ''))[0] ?? contests[0];
    }

    function judgementTimestamp(judgement) {
        const candidates = [judgement.end_time, judgement.start_time, judgement.time];

        for (const value of candidates) {
            const parsed = Date.parse(value ?? '');
            if (Number.isFinite(parsed)) {
                return parsed;
            }
        }

        const numeric = Number(judgement.id);
        return Number.isFinite(numeric) ? numeric : 0;
    }

    function buildFinalJudgementMap(judgements) {
        const grouped = new Map();

        for (const judgement of judgements) {
            const submissionId = normalizeId(judgement.submission_id ?? judgement.submission?.id);
            if (!submissionId) {
                continue;
            }

            if (!grouped.has(submissionId)) {
                grouped.set(submissionId, []);
            }

            grouped.get(submissionId).push(judgement);
        }

        const result = new Map();

        for (const [submissionId, list] of grouped) {
            const withType = list.filter((judgement) => judgement.judgement_type_id != null || judgement.judgement_type?.id != null);

            if (!withType.length) {
                continue;
            }

            const explicitlyValid = withType.filter((judgement) => isTruthy(judgement.valid));
            const explicitlyNotInvalid = withType.filter((judgement) => judgement.valid !== false && judgement.valid !== 0 && judgement.valid !== '0' && judgement.valid !== 'false');
            const pool = explicitlyValid.length ? explicitlyValid : explicitlyNotInvalid.length ? explicitlyNotInvalid : withType;

            pool.sort((a, b) => judgementTimestamp(a) - judgementTimestamp(b) || normalizeId(a.id).localeCompare(normalizeId(b.id), undefined, { numeric: true }));
            result.set(submissionId, pool[pool.length - 1]);
        }

        return result;
    }

    function getJudgementTypeId(judgement) {
        return normalizeId(judgement?.judgement_type_id ?? judgement?.judgement_type?.id);
    }

    function getJudgementScore(judgement) {
        for (const candidate of [judgement?.score, judgement?.points, judgement?.judgement_score]) {
            const number = Number(candidate);
            if (Number.isFinite(number)) {
                return number;
            }
        }

        return null;
    }

    function teamName(team) {
        return team.display_name ?? team.name ?? team.label ?? team.id ?? 'team';
    }

    function problemLabel(problem, index) {
        return problem.label ?? problem.short_name ?? problem.id ?? String.fromCharCode(65 + (index % 26));
    }

    function problemName(problem, index) {
        return problem.name ?? problemLabel(problem, index);
    }

    function problemColor(problem) {
        const value = problem.rgb ?? problem.color ?? '#ffffff';
        const text = String(value).trim();

        if (/^[0-9a-f]{6}$/i.test(text)) {
            return `#${text}`;
        }
        if (/^#[0-9a-f]{3,8}$/i.test(text)) {
            return text;
        }

        return '#ffffff';
    }

    function contrastColor(hex) {
        const match = String(hex).match(/^#([0-9a-f]{6})$/i);

        if (!match) {
            return '#000000';
        }

        const number = parseInt(match[1], 16);
        const r = (number >> 16) & 255;
        const g = (number >> 8) & 255;
        const b = number & 255;

        return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#000000' : '#ffffff';
    }

    function problemOrder(a, b) {
        const aOrder = Number(a.ordinal ?? a.order ?? NaN);
        const bOrder = Number(b.ordinal ?? b.order ?? NaN);

        if (Number.isFinite(aOrder) && Number.isFinite(bOrder) && aOrder !== bOrder) {
            return aOrder - bOrder;
        }

        return String(a.label ?? a.id).localeCompare(String(b.label ?? b.id), undefined, { numeric: true });
    }

    function teamOrderKey(team) {
        const sortorder = Number(team.sortorder ?? team.sort_order ?? 0);
        return Number.isFinite(sortorder) ? sortorder : 0;
    }

    function historicalPassFail({ contest, teams, problems, submissions, judgementMap, judgementTypes, cutoffSeconds, penaltyMinutes, scoreInSeconds }) {
        const judgementTypeMap = new Map(judgementTypes.map((judgementType) => [normalizeId(judgementType.id), judgementType]));
        const submissionsByCell = new Map();

        for (const submission of submissions) {
            const seconds = submissionContestSeconds(submission, contest);

            if (!Number.isFinite(seconds) || seconds < 0 || seconds >= cutoffSeconds) {
                continue;
            }

            const teamId = normalizeId(submission.team_id ?? submission.team?.id);
            const problemId = normalizeId(submission.problem_id ?? submission.problem?.id);

            if (!teamId || !problemId) {
                continue;
            }

            const key = `${teamId}\u0000${problemId}`;

            if (!submissionsByCell.has(key)) {
                submissionsByCell.set(key, []);
            }

            submissionsByCell.get(key).push({ submission, seconds });
        }

        for (const list of submissionsByCell.values()) {
            list.sort((a, b) => a.seconds - b.seconds || normalizeId(a.submission.id).localeCompare(normalizeId(b.submission.id), undefined, { numeric: true }));
        }

        const rows = [];
        const firstSolve = new Map();
        const multiplier = scoreInSeconds ? 1 : 1 / 60;
        const penaltyUnit = penaltyMinutes * (scoreInSeconds ? 60 : 1);

        for (const team of teams) {
            const teamId = normalizeId(team.id);
            const cells = [];
            let numPoints = 0;
            let totalTime = 0;
            let lastAccepted = -1;

            problems.forEach((problem) => {
                const problemId = normalizeId(problem.id);
                const list = submissionsByCell.get(`${teamId}\u0000${problemId}`) ?? [];
                let penalizedWrong = 0;
                let countedTries = 0;
                let pending = 0;
                let solved = false;
                let solveSeconds = null;
                let seenNonPenalty = 0;

                for (const { submission, seconds } of list) {
                    if (solved) {
                        break;
                    }

                    const judgement = judgementMap.get(normalizeId(submission.id));

                    if (!judgement) {
                        pending += 1;
                        continue;
                    }

                    const judgementType = judgementTypeMap.get(getJudgementTypeId(judgement));

                    if (!judgementType) {
                        pending += 1;
                        continue;
                    }

                    if (isTruthy(judgementType.solved)) {
                        countedTries += 1;
                        solved = true;
                        solveSeconds = seconds;
                        break;
                    }

                    if (isTruthy(judgementType.penalty)) {
                        penalizedWrong += 1;
                        countedTries += 1;
                    } else {
                        seenNonPenalty += 1;
                    }
                }

                let scoreTime = 0;
                let cellTime = '';

                if (solved) {
                    const problemPoints = Number(problem.points ?? 1);
                    numPoints += Number.isFinite(problemPoints) ? problemPoints : 1;
                    scoreTime = scoreInSeconds ? Math.floor(solveSeconds) : Math.floor(solveSeconds * multiplier);
                    scoreTime += penalizedWrong * penaltyUnit;
                    totalTime += scoreTime;
                    lastAccepted = Math.max(lastAccepted, solveSeconds);

                    const first = firstSolve.get(problemId);
                    if (first == null || solveSeconds < first) {
                        firstSolve.set(problemId, solveSeconds);
                    }

                    if (scoreInSeconds) {
                        const base = formatElapsed(Math.floor(solveSeconds), true);
                        const penalty = penalizedWrong * penaltyMinutes * 60;
                        cellTime = penalty > 0 ? `${base} + ${formatElapsed(penalty, true)}` : base;
                    } else {
                        cellTime = String(Math.floor(solveSeconds / 60));
                    }
                }

                cells.push({ problem, solved, solveSeconds, penalizedWrong, countedTries, pending, seenNonPenalty, cellTime });
            });

            rows.push({ team, cells, numPoints, totalTime, lastAccepted, sortorder: teamOrderKey(team) });
        }

        rows.sort((a, b) => a.sortorder - b.sortorder || b.numPoints - a.numPoints || a.totalTime - b.totalTime || a.lastAccepted - b.lastAccepted || teamName(a.team).localeCompare(teamName(b.team), undefined, { numeric: true }));

        let groupStart = 0;

        while (groupStart < rows.length) {
            let groupEnd = groupStart + 1;

            while (groupEnd < rows.length && rows[groupEnd].sortorder === rows[groupStart].sortorder) {
                groupEnd++;
            }

            let lastKey = null;
            let lastRank = 0;

            for (let i = groupStart; i < groupEnd; i++) {
                const row = rows[i];
                const key = `${row.numPoints}\u0000${row.totalTime}\u0000${row.lastAccepted}`;

                if (key !== lastKey) {
                    lastRank = i - groupStart + 1;
                    lastKey = key;
                }

                row.rank = lastRank;
            }

            groupStart = groupEnd;
        }

        for (const row of rows) {
            for (const cell of row.cells) {
                cell.first = cell.solved && cell.solveSeconds === firstSolve.get(normalizeId(cell.problem.id));
            }
        }

        return { rows, scoring: false };
    }

    function historicalScore({ contest, teams, problems, submissions, judgementMap, cutoffSeconds }) {
        const submissionsByCell = new Map();

        for (const submission of submissions) {
            const seconds = submissionContestSeconds(submission, contest);

            if (!Number.isFinite(seconds) || seconds < 0 || seconds >= cutoffSeconds) {
                continue;
            }

            const teamId = normalizeId(submission.team_id ?? submission.team?.id);
            const problemId = normalizeId(submission.problem_id ?? submission.problem?.id);

            if (!teamId || !problemId) {
                continue;
            }

            const key = `${teamId}\u0000${problemId}`;

            if (!submissionsByCell.has(key)) {
                submissionsByCell.set(key, []);
            }

            submissionsByCell.get(key).push({ submission, seconds });
        }

        const rows = [];

        for (const team of teams) {
            const teamId = normalizeId(team.id);
            const cells = [];
            let totalScore = 0;
            let tieTime = -1;

            for (const problem of problems) {
                const problemId = normalizeId(problem.id);
                const list = submissionsByCell.get(`${teamId}\u0000${problemId}`) ?? [];
                let bestScore = null;
                let bestTime = null;
                let tries = 0;
                let pending = 0;

                for (const { submission, seconds } of list) {
                    const judgement = judgementMap.get(normalizeId(submission.id));

                    if (!judgement) {
                        pending += 1;
                        continue;
                    }

                    const score = getJudgementScore(judgement);

                    if (score == null) {
                        continue;
                    }

                    tries += 1;

                    if (bestScore == null || score > bestScore || (score === bestScore && seconds < bestTime)) {
                        bestScore = score;
                        bestTime = seconds;
                    }
                }

                if (bestScore != null) {
                    totalScore += bestScore;
                    tieTime = Math.max(tieTime, bestTime ?? -1);
                }

                cells.push({ problem, bestScore, bestTime, tries, pending });
            }

            rows.push({ team, cells, totalScore, tieTime, sortorder: teamOrderKey(team) });
        }

        rows.sort((a, b) => a.sortorder - b.sortorder || b.totalScore - a.totalScore || a.tieTime - b.tieTime || teamName(a.team).localeCompare(teamName(b.team), undefined, { numeric: true }));

        let groupStart = 0;

        while (groupStart < rows.length) {
            let groupEnd = groupStart + 1;

            while (groupEnd < rows.length && rows[groupEnd].sortorder === rows[groupStart].sortorder) {
                groupEnd++;
            }

            let lastKey = null;
            let lastRank = 0;

            for (let i = groupStart; i < groupEnd; i++) {
                const row = rows[i];
                const key = `${row.totalScore}\u0000${row.tieTime}`;

                if (key !== lastKey) {
                    lastRank = i - groupStart + 1;
                    lastKey = key;
                }

                row.rank = lastRank;
            }

            groupStart = groupEnd;
        }

        return { rows, scoring: true };
    }

    function selectTeams(teams, currentScoreboard) {
        const rows = asArray(currentScoreboard);
        const scoreboardIds = new Set(rows.map((row) => normalizeId(row.team_id)).filter(Boolean));

        if (scoreboardIds.size) {
            return teams.filter((team) => scoreboardIds.has(normalizeId(team.id)));
        }

        return teams.filter((team) => !isTruthy(team.hidden));
    }

    function organizationName(team, organizationMap) {
        const organizationId = normalizeId(team.organization_id ?? team.organization?.id ?? team.affiliation_id);
        const organization = organizationMap.get(organizationId);
        return organization?.formal_name ?? organization?.name ?? organization?.shortname ?? '';
    }

    function renderProblemBadge(problem, index) {
        const label = escapeHtml(problemLabel(problem, index));
        const background = problemColor(problem);
        const foreground = contrastColor(background);
        return `<span class="historical-problem-badge" style="background:${cssEscape(background)};color:${cssEscape(foreground)}">${label}</span>`;
    }

    function renderPassFailCell(cell) {
        const attempts = cell.countedTries + cell.pending;

        if (attempts === 0) {
            return '<td class="score_cell"></td>';
        }

        let className = '';

        if (cell.solved) {
            className = `score_correct${cell.first ? ' score_first' : ''}`;
        } else if (cell.pending > 0 && cell.countedTries > 0) {
            className = 'score_pending score_incorrect';
        } else if (cell.pending > 0) {
            className = 'score_pending';
        } else {
            className = 'score_incorrect';
        }

        const triesText = attempts === 1 ? '1 try' : `${attempts} tries`;
        return `<td class="score_cell"><div class="${className}">${cell.solved ? escapeHtml(cell.cellTime) : '&nbsp;'}<span>${escapeHtml(triesText)}</span></div></td>`;
    }

    function renderScoringCell(cell) {
        const attempts = cell.tries + cell.pending;

        if (attempts === 0) {
            return '<td class="score_cell"></td>';
        }

        const className = cell.bestScore != null && cell.bestScore > 0 ? 'score_correct' : cell.pending ? 'score_pending' : 'score_incorrect';
        const triesText = attempts === 1 ? '1 try' : `${attempts} tries`;
        const scoreText = cell.bestScore == null ? '&nbsp;' : escapeHtml(Number(cell.bestScore).toFixed(2).replace(/\.00$/, ''));

        return `<td class="score_cell"><div class="${className}">${scoreText}<span>${escapeHtml(triesText)}</span></div></td>`;
    }

    function renderScoreboardTable({ result, problems, organizationMap, scoreInSeconds }) {
        const scoring = result.scoring;
        const headerProblems = problems.map((problem, index) => `<th title="problem ${escapeHtml(problemName(problem, index))}" scope="col" data-problem-id="${escapeHtml(normalizeId(problem.id))}">${renderProblemBadge(problem, index)}</th>`).join('');

        const body = result.rows.map((row, index) => {
            const previous = result.rows[index - 1];
            const sortSwitch = previous && previous.sortorder !== row.sortorder ? ' sortorderswitch' : '';
            const organization = organizationName(row.team, organizationMap);
            const teamCell = `<td class="scoreaf"></td><td class="scoretn" title="${escapeHtml(teamName(row.team))}"><span class="forceWidth">${escapeHtml(teamName(row.team))}</span>${organization ? `<span class="univ forceWidth">${escapeHtml(organization)}</span>` : ''}</td>`;
            const scoreCells = scoring ? `<td class="scorenc" title="Full score: ${escapeHtml(row.totalScore)}">${escapeHtml(Number(row.totalScore).toFixed(2))}</td>` : `<td class="scorenc">${escapeHtml(row.numPoints)}</td><td class="scorett">${escapeHtml(scoreInSeconds ? formatElapsed(row.totalTime, true) : row.totalTime)}</td>`;
            const problemCells = row.cells.map(scoring ? renderScoringCell : renderPassFailCell).join('');

            return `<tr class="${sortSwitch.trim()}" data-team-id="${escapeHtml(normalizeId(row.team.id))}" data-team-name="${escapeHtml(teamName(row.team))}"><td class="scorepl rank">${escapeHtml(row.rank)}</td>${teamCell}${scoreCells}${problemCells}</tr>`;
        }).join('\n');

        return `<table class="scoreboard desktop-scoreboard center scoreboard_jury">
<colgroup><col id="scorerank"><col><col id="scoreteamname"></colgroup>
<colgroup><col id="scoresolv">${scoring ? '' : '<col id="scoretotal">'}</colgroup>
<colgroup>${problems.map(() => '<col class="scoreprob">').join('')}</colgroup>
<thead><tr class="scoreheader"><th title="rank" scope="col">rank</th><th title="team name" scope="col" colspan="2">team</th><th title="score" scope="col"${scoring ? '' : ' colspan="2"'}>score</th>${headerProblems}</tr></thead>
<tbody>${body}</tbody>
</table>`;
    }

    function rewriteCssUrls(css, stylesheetUrl) {
        return css.replace(/url\(\s*(['"]?)(?!data:|blob:|https?:|\/\/|#)([^'"\)]+)\1\s*\)/gi, (all, quote, raw) => {
            try {
                const absolute = new URL(raw.trim(), stylesheetUrl).href;
                return `url("${absolute.replaceAll('"', '%22')}")`;
            } catch {
                return all;
            }
        });
    }

    async function collectCurrentCss() {
        const chunks = [];

        for (const style of document.querySelectorAll('style')) {
            if (style.textContent) {
                chunks.push(style.textContent);
            }
        }

        const links = [...document.querySelectorAll('link[rel~="stylesheet"][href]')];

        for (const link of links) {
            try {
                const url = new URL(link.href, location.href);
                const response = await fetch(url.href, { credentials: 'same-origin', cache: 'force-cache' });

                if (!response.ok) {
                    continue;
                }

                const css = await response.text();
                chunks.push(`/* ${url.href} */\n${rewriteCssUrls(css, url.href)}`);
            } catch {
            }
        }

        chunks.push(FALLBACK_CSS);
        return chunks.join('\n\n').replace(/<\/style/gi, '<\\/style');
    }

    function buildHtml({ contest, cutoffSeconds, result, problems, organizations, scoreInSeconds, css }) {
        const organizationMap = new Map(organizations.map((organization) => [normalizeId(organization.id), organization]));
        const table = renderScoreboardTable({ result, problems, organizationMap, scoreInSeconds });
        const title = `${contestName(contest)} — ${formatCutoff(cutoffSeconds)} scoreboard`;
        const generatedAt = new Date().toLocaleString();

        return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${css}</style>
</head>
<body>
<div class="historical-wrap container-fluid">
  <div class="historical-card card mt-3">
    <div class="historical-card-header card-header">
      <span>${escapeHtml(contestName(contest))}</span>
      <span>scoreboard at ${escapeHtml(formatCutoff(cutoffSeconds))} after start</span>
    </div>
  </div>
  <div class="historical-note">Only submissions made before ${escapeHtml(formatCutoff(cutoffSeconds))} from contest start are included. Judgement results are reconstructed from the current jury API data.</div>
  ${table}
  <p class="historical-footer">Generated ${escapeHtml(generatedAt)} using DOMjudge jury data.</p>
</div>
</body>
</html>`;
    }

    function safeFilename(value) {
        return String(value).replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 120) || 'contest';
    }

    function downloadHtml(html, filename) {
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');

        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();

        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    async function fetchContestData(contestId) {
        const id = encodeURIComponent(contestId);
        const requests = [
            api(`/contests/${id}`),
            api(`/contests/${id}/submissions`),
            api(`/contests/${id}/judgements`),
            api(`/contests/${id}/judgement-types`),
            api(`/contests/${id}/teams`),
            api(`/contests/${id}/problems`),
            api(`/contests/${id}/scoreboard?allteams=true`, true),
            api(`/contests/${id}/organizations`, true),
            loadConfig()
        ];

        const [contest, submissions, judgements, judgementTypes, teams, problems, scoreboard, organizations, config] = await Promise.all(requests);

        return {
            contest,
            submissions: asArray(submissions),
            judgements: asArray(judgements),
            judgementTypes: asArray(judgementTypes),
            teams: asArray(teams),
            problems: asArray(problems).sort(problemOrder),
            scoreboard,
            organizations: asArray(organizations),
            config: config ?? {}
        };
    }

    function dialogStyles() {
        return `
#dj-historical-overlay{position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,.45);display:flex;align-items:flex-start;justify-content:center;padding:8vh 1rem 1rem}
#dj-historical-dialog{width:min(680px,100%);background:#fff;color:#212529;border-radius:.35rem;box-shadow:0 1rem 3rem rgba(0,0,0,.35);font-family:Arial,sans-serif}
#dj-historical-dialog header,#dj-historical-dialog footer{padding:.85rem 1rem;border-bottom:1px solid #dee2e6}
#dj-historical-dialog footer{border-bottom:0;border-top:1px solid #dee2e6;display:flex;justify-content:flex-end;gap:.5rem}
#dj-historical-dialog main{padding:1rem}
#dj-historical-dialog h2{font-size:1.15rem;margin:0}
.djh-row{display:grid;grid-template-columns:11rem 1fr;gap:.75rem;align-items:center;margin:.7rem 0}
.djh-time{display:flex;gap:.5rem;align-items:center}
.djh-time input{width:7rem}
.djh-control{display:block;width:100%;padding:.38rem .5rem;border:1px solid #ced4da;border-radius:.25rem;background:#fff}
.djh-btn{padding:.4rem .75rem;border:1px solid transparent;border-radius:.25rem;cursor:pointer}
.djh-primary{background:#0d6efd;color:#fff}
.djh-secondary{background:#6c757d;color:#fff}
.djh-btn:disabled{opacity:.55;cursor:not-allowed}
.djh-status{min-height:1.3rem;margin-top:.8rem;font-size:.9rem;white-space:pre-wrap}
.djh-help{font-size:.82rem;color:#6c757d;margin-top:.35rem}
@media(max-width:600px){.djh-row{grid-template-columns:1fr;gap:.25rem}}
`;
    }

    function createDialog() {
        if (state.dialog) {
            return state.dialog;
        }

        if (!document.getElementById('dj-historical-dialog-style')) {
            const style = document.createElement('style');
            style.id = 'dj-historical-dialog-style';
            style.textContent = dialogStyles();
            document.head.appendChild(style);
        }

        const overlay = document.createElement('div');
        overlay.id = 'dj-historical-overlay';
        overlay.hidden = true;
        overlay.innerHTML = `
<div id="dj-historical-dialog" role="dialog" aria-modal="true" aria-labelledby="djh-title">
  <header><h2 id="djh-title">Export Scoreboard</h2></header>
  <main>
    <div class="djh-row"><label for="djh-contest">Contest</label><select id="djh-contest" class="djh-control"></select></div>
    <div class="djh-row"><label>Cutoff after start</label><div class="djh-time"><input id="djh-hours" class="djh-control" type="number" min="0" step="1" value="1"><span>hours</span><input id="djh-minutes" class="djh-control" type="number" min="0" max="59" step="1" value="0"><span>minutes</span></div></div>
    <div class="djh-row"><label for="djh-penalty">Wrong-answer penalty</label><div><input id="djh-penalty" class="djh-control" type="number" min="0" step="1" value="20"><div class="djh-help">Contest/API value is used when available; this field can be overridden manually.</div></div></div>
    <div class="djh-row"><label for="djh-seconds">Score resolution</label><label><input id="djh-seconds" type="checkbox"> seconds instead of minutes</label></div>
    <div id="djh-status" class="djh-status" aria-live="polite"></div>
  </main>
  <footer><button type="button" class="djh-btn djh-secondary" id="djh-cancel">Close</button><button type="button" class="djh-btn djh-primary" id="djh-export">Download HTML</button></footer>
</div>`;

        document.body.appendChild(overlay);

        const dialog = {
            overlay,
            contest: overlay.querySelector('#djh-contest'),
            hours: overlay.querySelector('#djh-hours'),
            minutes: overlay.querySelector('#djh-minutes'),
            penalty: overlay.querySelector('#djh-penalty'),
            seconds: overlay.querySelector('#djh-seconds'),
            status: overlay.querySelector('#djh-status'),
            export: overlay.querySelector('#djh-export'),
            cancel: overlay.querySelector('#djh-cancel')
        };

        dialog.cancel.addEventListener('click', () => {
            overlay.hidden = true;
        });

        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                overlay.hidden = true;
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !overlay.hidden) {
                overlay.hidden = true;
            }
        });

        dialog.contest.addEventListener('change', async () => {
            const selected = state.contests?.find((contest) => normalizeId(contest.id) === dialog.contest.value);
            const config = await loadConfig().catch(() => ({}));
            const penalty = Number(selected?.penalty_time ?? selected?.penaltyTime ?? config?.penalty_time ?? 20);

            if (Number.isFinite(penalty)) {
                dialog.penalty.value = String(penalty);
            }

            dialog.seconds.checked = isTruthy(config?.score_in_seconds);
        });

        dialog.export.addEventListener('click', async () => {
            dialog.export.disabled = true;
            dialog.cancel.disabled = true;

            try {
                const contestId = dialog.contest.value;
                const hours = Number(dialog.hours.value);
                const minutes = Number(dialog.minutes.value);
                const penaltyMinutes = Number(dialog.penalty.value);

                if (!contestId) {
                    throw new Error('Select a contest.');
                }
                if (!Number.isInteger(hours) || hours < 0) {
                    throw new Error('Hours must be a non-negative integer.');
                }
                if (!Number.isInteger(minutes) || minutes < 0 || minutes >= 60) {
                    throw new Error('Minutes must be an integer from 0 to 59.');
                }
                if (!Number.isFinite(penaltyMinutes) || penaltyMinutes < 0) {
                    throw new Error('Penalty must be non-negative.');
                }

                const cutoffSeconds = hours * 3600 + minutes * 60;

                dialog.status.textContent = 'Fetching contest data from the DOMjudge API...';
                const data = await fetchContestData(contestId);

                if (isTruthy(data.contest.runtime_as_score_tiebreaker ?? data.contest.runtimeAsScoreTiebreaker)) {
                    throw new Error('This contest uses a runtime-based tiebreaker. Runtime aggregation is not reconstructed by this script, so export has been stopped to avoid producing an incorrect scoreboard.');
                }

                const selectedTeams = selectTeams(data.teams, data.scoreboard);
                const judgementMap = buildFinalJudgementMap(data.judgements);
                const scoreboardType = String(data.contest.scoreboard_type ?? data.contest.scoreboardType ?? 'pass-fail').toLowerCase();
                const scoreInSeconds = dialog.seconds.checked;

                dialog.status.textContent = `Reconstructing the scoreboard at ${formatCutoff(cutoffSeconds)} after contest start...`;

                const common = {
                    contest: data.contest,
                    teams: selectedTeams,
                    problems: data.problems,
                    submissions: data.submissions,
                    judgementMap,
                    cutoffSeconds
                };

                const result = scoreboardType === 'score' ? historicalScore(common) : historicalPassFail({ ...common, judgementTypes: data.judgementTypes, penaltyMinutes, scoreInSeconds });

                dialog.status.textContent = 'Collecting the current DOMjudge CSS and embedding it in the HTML file...';

                const css = await collectCurrentCss();
                const html = buildHtml({ contest: data.contest, cutoffSeconds, result, problems: data.problems, organizations: data.organizations, scoreInSeconds, css });
                const filename = `${safeFilename(data.contest.shortname ?? data.contest.id ?? contestName(data.contest))}_scoreboard_${hours}h${String(minutes).padStart(2, '0')}m.html`;

                downloadHtml(html, filename);
                dialog.status.textContent = `Downloaded: ${filename}`;
            } catch (error) {
                console.error('[DOMjudge scoreboard exporter]', error);
                dialog.status.textContent = `Error: ${error?.message ?? error}`;
            } finally {
                dialog.export.disabled = false;
                dialog.cancel.disabled = false;
            }
        });

        state.dialog = dialog;
        return dialog;
    }

    async function openDialog() {
        const dialog = createDialog();
        dialog.overlay.hidden = false;
        dialog.status.textContent = 'Checking the DOMjudge API...';

        try {
            const [contests, config] = await Promise.all([loadContests(), loadConfig()]);

            if (!contests.length) {
                throw new Error('No accessible contests were found.');
            }

            const selected = chooseDefaultContest(contests);

            dialog.contest.innerHTML = contests.map((contest) => `<option value="${escapeHtml(normalizeId(contest.id))}">${escapeHtml(contestName(contest))} [${escapeHtml(normalizeId(contest.id))}]</option>`).join('');

            if (selected) {
                dialog.contest.value = normalizeId(selected.id);
            }

            const penalty = Number(selected?.penalty_time ?? selected?.penaltyTime ?? config?.penalty_time ?? 20);

            if (Number.isFinite(penalty)) {
                dialog.penalty.value = String(penalty);
            }

            dialog.seconds.checked = isTruthy(config?.score_in_seconds);
            dialog.status.textContent = `API: ${state.apiBase}`;
        } catch (error) {
            console.error('[DOMjudge scoreboard exporter]', error);
            dialog.status.textContent = `Error: ${error?.message ?? error}`;
        }
    }

    function makeNavButton() {
        if (document.getElementById('dj-historical-scoreboard-button')) {
            return;
        }

        const anchors = [...document.querySelectorAll('a[href]')];
        const scoreboardAnchor = anchors.find((anchor) => /\/jury\/scoreboard(?:[/?#]|$)/.test(new URL(anchor.href, location.href).pathname + new URL(anchor.href, location.href).search)) ?? anchors.find((anchor) => /^scoreboard$/i.test(anchor.textContent.trim()));

        const link = document.createElement('a');
        link.id = 'dj-historical-scoreboard-button';
        link.href = '#';
        link.textContent = 'Export Scoreboard';
        link.title = 'Export a scoreboard at an arbitrary elapsed contest time';

        link.addEventListener('click', (event) => {
            event.preventDefault();
            openDialog();
        });

        const navItem = scoreboardAnchor?.closest('li');

        if (navItem && navItem.parentElement) {
            const newItem = document.createElement('li');
            newItem.className = navItem.className || 'nav-item';
            link.className = scoreboardAnchor.className || 'nav-link';
            newItem.appendChild(link);
            navItem.insertAdjacentElement('afterend', newItem);
            return;
        }

        const nav = document.querySelector('.navbar-nav');

        if (nav) {
            const item = document.createElement('li');
            item.className = 'nav-item';
            link.className = 'nav-link';
            item.appendChild(link);
            nav.appendChild(item);
            return;
        }

        link.style.cssText = 'position:fixed;right:1rem;top:1rem;z-index:2147483645;padding:.45rem .7rem;background:#343a40;color:#fff;border-radius:.25rem;text-decoration:none';
        document.body.appendChild(link);
    }

    makeNavButton();

    const observer = new MutationObserver(() => makeNavButton());
    observer.observe(document.documentElement, { childList: true, subtree: true });
})();
