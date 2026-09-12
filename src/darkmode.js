// ==UserScript==
// @name         DOMjudge Dark Theme
// @namespace    local.domjudge.dark
// @version      2.0.1
// @description  Complete dark theme for DOMjudge
// @match        your domjudge url
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(() => {
    'use strict';

    const TEXT = '#d6dbe3';
    const TEXT_BRIGHT = '#e6edf3';

    GM_addStyle(`
        :root {
            color-scheme: dark !important;
            --dj-bg: #0d1117;
            --dj-surface: #161b22;
            --dj-surface-2: #1d232c;
            --dj-surface-3: #252c35;
            --dj-hover: #2b333d;
            --dj-border: #30363d;
            --dj-border-light: #444c56;
            --dj-text: #d6dbe3;
            --dj-text-bright: #e6edf3;
            --dj-muted: #8b949e;
            --dj-link: #73b7ff;
            --dj-link-hover: #9acbff;
            --dj-green: #183d2a;
            --dj-green-first: #205335;
            --dj-green-text: #c7eed5;
            --dj-red: #4a2225;
            --dj-red-text: #f0c6c7;
            --dj-blue: #26345f;
            --dj-blue-text: #d0d9f6;
            --dj-yellow: #4a3c1c;
            --dj-yellow-text: #eadcae;
            --dj-purple: #392c53;
            --dj-purple-text: #dcd1ec;
            --dj-cyan: #1d4148;
            --dj-cyan-text: #c6e5ea;
            --bs-body-bg: var(--dj-bg) !important;
            --bs-body-color: var(--dj-text) !important;
            --bs-body-color-rgb: 214, 219, 227 !important;
            --bs-body-bg-rgb: 13, 17, 23 !important;
            --bs-border-color: var(--dj-border) !important;
            --bs-secondary-bg: var(--dj-surface) !important;
            --bs-tertiary-bg: var(--dj-surface-2) !important;
            --bs-secondary-color: var(--dj-muted) !important;
            --bs-emphasis-color: var(--dj-text-bright) !important;
        }

        /* Base */

        html, body {
            background: var(--dj-bg) !important;
            color: var(--dj-text) !important;
        }

        body, main, #content, .container, .container-fluid {
            color: var(--dj-text) !important;
        }

        h1, h2, h3, h4, h5, h6, p, label, legend, dt, dd {
            color: inherit;
        }

        a {
            color: var(--dj-link);
        }

        a:hover, a:focus {
            color: var(--dj-link-hover);
        }

        hr {
            border-color: var(--dj-border) !important;
            opacity: 1 !important;
        }

        ::selection {
            background: #315a86;
            color: #ffffff;
        }

        /* Prevent black text on dark backgrounds */

        .text-dark, .text-black, .text-black-50, .text-body, .text-body-emphasis {
            color: var(--dj-text) !important;
        }

        [style*="color: black"], [style*="color:black"], [style*="color: #000"], [style*="color:#000"],
        [style*="color: #000000"], [style*="color:#000000"], [style*="color: rgb(0, 0, 0)"] {
            color: var(--dj-text) !important;
        }

        .text-muted, small {
            color: var(--dj-muted) !important;
        }

        /* Navbar */

        .navbar, .navbar-light, .navbar-dark, .navbar.bg-light, .navbar.bg-white {
            background: var(--dj-surface) !important;
            color: var(--dj-text) !important;
            border-color: var(--dj-border) !important;
        }

        .navbar-brand, .navbar-text, .navbar-nav .nav-link,
        .navbar-light .navbar-brand, .navbar-light .navbar-text, .navbar-light .navbar-nav .nav-link {
            color: var(--dj-text) !important;
        }

        .navbar-nav .nav-link:hover, .navbar-nav .nav-link:focus, .navbar-nav .nav-link.active {
            color: var(--dj-text-bright) !important;
        }

        .navbar-light .navbar-toggler {
            border-color: var(--dj-border-light) !important;
        }

        .navbar-light .navbar-toggler-icon {
            filter: invert(1) grayscale(1) brightness(1.7);
        }

        /* Cards, modals, and panels */

        .card, .card-body, .modal-content, .dropdown-menu, .list-group-item,
        .popover, .toast, .jumbotron, .accordion-item, .offcanvas {
            background: var(--dj-surface) !important;
            color: var(--dj-text) !important;
            border-color: var(--dj-border) !important;
        }

        .card-header, .card-footer, .modal-header, .modal-footer,
        .popover-header, .accordion-header, .accordion-button {
            background: var(--dj-surface-2) !important;
            color: var(--dj-text) !important;
            border-color: var(--dj-border) !important;
        }

        .accordion-button:not(.collapsed) {
            background: var(--dj-surface-3) !important;
            color: var(--dj-text-bright) !important;
        }

        .bg-white, .bg-light {
            background: var(--dj-surface) !important;
            color: var(--dj-text) !important;
        }

        /* Dropdowns */

        .dropdown-divider {
            border-color: var(--dj-border) !important;
        }

        .dropdown-item {
            color: var(--dj-text) !important;
        }

        .dropdown-item:hover, .dropdown-item:focus, .dropdown-item.active {
            background: var(--dj-hover) !important;
            color: var(--dj-text-bright) !important;
        }

        /* Generic tables */

        table, .table {
            color: var(--dj-text) !important;
            border-color: var(--dj-border) !important;
            --bs-table-color: var(--dj-text);
            --bs-table-bg: var(--dj-surface);
            --bs-table-border-color: var(--dj-border);
            --bs-table-striped-color: var(--dj-text);
            --bs-table-striped-bg: #1b2027;
            --bs-table-hover-color: var(--dj-text-bright);
            --bs-table-hover-bg: var(--dj-hover);
        }

        table th, table td, .table th, .table td {
            color: var(--dj-text);
            border-color: var(--dj-border) !important;
        }

        table thead, table thead tr, table thead th, table thead td,
        .table thead, .table thead tr, .table thead th, .table thead td {
            background: var(--dj-surface-2) !important;
            color: var(--dj-text) !important;
            border-color: var(--dj-border) !important;
        }

        .table-light, .table-light > tr, .table-light > tr > th,
        .table-light > tr > td, .thead-light, .thead-light th {
            background: var(--dj-surface-2) !important;
            color: var(--dj-text) !important;
        }

        .table-striped tbody tr:nth-of-type(odd) {
            background: #1b2027 !important;
        }

        .table-hover tbody tr:hover {
            background: var(--dj-hover) !important;
        }

        /* DOMjudge scoreboard */

        .scoreboard {
            background: var(--dj-bg) !important;
            color: var(--dj-text) !important;
            border-color: var(--dj-border) !important;
        }

        /* Force readable text throughout the scoreboard. */

        .scoreboard td, .scoreboard th, .scoreboard td span, .scoreboard th span,
        .scoreboard td div, .scoreboard th div, .scoreboard td strong, .scoreboard th strong,
        .scoreboard td small, .scoreboard th small, .scoreboard td a, .scoreboard th a {
            color: var(--dj-text) !important;
        }

        .scoreboard th, .scoreboard thead, .scoreboard thead tr, .scoreboard thead td {
            background: var(--dj-surface-2) !important;
            color: var(--dj-text) !important;
            border-color: var(--dj-border) !important;
        }

        .scoreboard td, .scoreboard tr {
            border-color: var(--dj-border) !important;
        }

        /* DOMjudge uses cl_FFFFFF for the default team background. */

        .scoreboard .cl_FFFFFF, .scoreboard td.cl_FFFFFF, .scoreboard th.cl_FFFFFF {
            background-color: var(--dj-surface) !important;
            background-image: none !important;
            color: var(--dj-text) !important;
        }

        /* Dark replacement for the pale-yellow highlighted team background. */

        .scoreboard .cl_FFFFE0, .scoreboard td.cl_FFFFE0, .scoreboard th.cl_FFFFE0 {
            background-color: #37331d !important;
            color: var(--dj-text) !important;
        }

        /* Darken arbitrary category colors while preserving their hue. */

        .scoreboard td[class*="cl_"]:not(.cl_FFFFFF),
        .scoreboard th[class*="cl_"]:not(.cl_FFFFFF) {
            background-image: linear-gradient(rgba(0, 0, 0, 0.58), rgba(0, 0, 0, 0.58)) !important;
            color: var(--dj-text) !important;
        }

        .scoreboard .sortorderswitch, .scoreboard tr.sortorderswitch {
            border-top: 2px solid var(--dj-border-light) !important;
        }

        .scoreboard .scorethisisme td {
            background-image: linear-gradient(rgba(40, 34, 10, 0.65), rgba(40, 34, 10, 0.65)) !important;
            color: var(--dj-text-bright) !important;
        }

        .scoreboard .scoresummary {
            background: var(--dj-surface-2) !important;
            color: var(--dj-text) !important;
        }

        .scoreboard a, .scoreboard a span {
            color: var(--dj-text) !important;
        }

        .scoreboard a:hover, .scoreboard a:hover span {
            color: var(--dj-text-bright) !important;
        }

        /* Score cells */

        .score_correct {
            background: var(--dj-green) !important;
            color: var(--dj-green-text) !important;
        }

        .score_correct.score_first {
            background: var(--dj-green-first) !important;
            color: #d4f4df !important;
        }

        .score_incorrect, .score_rejected {
            background: var(--dj-red) !important;
            color: var(--dj-red-text) !important;
        }

        .score_pending {
            background: var(--dj-blue) !important;
            color: var(--dj-blue-text) !important;
        }

        .score_pending.score_correct {
            background: linear-gradient(45deg, var(--dj-green) 85%, var(--dj-blue) 85%) !important;
            color: var(--dj-text-bright) !important;
        }

        .score_pending.score_correct.score_first {
            background: linear-gradient(45deg, var(--dj-green-first) 85%, var(--dj-blue) 85%) !important;
            color: var(--dj-text-bright) !important;
        }

        .score_pending.score_incorrect {
            background: linear-gradient(45deg, var(--dj-red) 85%, var(--dj-blue) 85%) !important;
            color: var(--dj-text-bright) !important;
        }

        .scoreboard td.score_correct, .scoreboard td.score_correct *,
        .scoreboard td.score_incorrect, .scoreboard td.score_incorrect *,
        .scoreboard td.score_pending, .scoreboard td.score_pending * {
            color: var(--dj-text-bright) !important;
        }

        /* Problem badges */

        .problem-badge {
            background-image: linear-gradient(rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.55)) !important;
            border-color: rgba(210, 220, 230, 0.30) !important;
            color: var(--dj-text-bright) !important;
        }

        /* Override the inline text color set by DOMjudge. */

        .problem-badge > span, .problem-badge span, .problem-badge a, .problem-badge strong {
            color: var(--dj-text-bright) !important;
        }

        .scoreboard .problem-badge, .scoreboard .problem-badge *,
        th .problem-badge, th .problem-badge * {
            color: var(--dj-text-bright) !important;
        }

        /* Scoreboard summary */

        .submcorrect {
            color: #84d9a3 !important;
        }

        .submreject {
            color: #e59a9d !important;
        }

        .submpend {
            color: #aeb9ec !important;
        }

        /* Bootstrap backgrounds and badges */

        .bg-primary, .badge-primary, .text-bg-primary {
            background-color: #24466d !important;
            color: #d7e8fa !important;
        }

        .bg-success, .badge-success, .text-bg-success {
            background-color: var(--dj-green) !important;
            color: var(--dj-green-text) !important;
        }

        .bg-danger, .badge-danger, .text-bg-danger {
            background-color: var(--dj-red) !important;
            color: var(--dj-red-text) !important;
        }

        .bg-warning, .badge-warning, .text-bg-warning {
            background-color: var(--dj-yellow) !important;
            color: var(--dj-yellow-text) !important;
        }

        .bg-info, .badge-info, .text-bg-info {
            background-color: var(--dj-cyan) !important;
            color: var(--dj-cyan-text) !important;
        }

        .bg-secondary, .badge-secondary, .text-bg-secondary {
            background-color: var(--dj-surface-3) !important;
            color: var(--dj-text) !important;
        }

        .badge-light, .text-bg-light, .badge-white {
            background-color: var(--dj-surface-3) !important;
            color: var(--dj-text) !important;
        }

        .badge.problem-badge {
            background-image: linear-gradient(rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.55)) !important;
            color: var(--dj-text-bright) !important;
        }

        .badge.problem-badge * {
            color: var(--dj-text-bright) !important;
        }

        /* Forms */

        .form-control, .form-select, .custom-select, .input-group-text, select, textarea,
        input[type="text"], input[type="search"], input[type="email"], input[type="password"],
        input[type="number"], input[type="url"], input[type="tel"], input[type="file"] {
            background: var(--dj-bg) !important;
            color: var(--dj-text) !important;
            border-color: var(--dj-border-light) !important;
        }

        .form-control:focus, .form-select:focus, .custom-select:focus, select:focus, textarea:focus, input:focus {
            background: var(--dj-bg) !important;
            color: var(--dj-text-bright) !important;
            border-color: #5188bd !important;
            box-shadow: 0 0 0 0.2rem rgba(81, 136, 189, 0.22) !important;
        }

        .form-control:disabled, .form-select:disabled, input:disabled, textarea:disabled {
            background: var(--dj-surface-2) !important;
            color: var(--dj-muted) !important;
        }

        input::placeholder, textarea::placeholder {
            color: var(--dj-muted) !important;
            opacity: 1;
        }

        select option {
            background: var(--dj-surface) !important;
            color: var(--dj-text) !important;
        }

        /* Buttons */

        .btn-light, .btn-secondary, .btn-outline-secondary, .btn-outline-dark {
            background: var(--dj-surface-2) !important;
            color: var(--dj-text) !important;
            border-color: var(--dj-border-light) !important;
        }

        .btn-light:hover, .btn-secondary:hover, .btn-outline-secondary:hover, .btn-outline-dark:hover {
            background: var(--dj-hover) !important;
            color: var(--dj-text-bright) !important;
        }

        .btn-primary {
            background: #244f7a !important;
            border-color: #376b9d !important;
            color: #e2edf8 !important;
        }

        .btn-success {
            background: #205238 !important;
            border-color: #32704d !important;
            color: #d0eada !important;
        }

        .btn-danger {
            background: #602d31 !important;
            border-color: #824046 !important;
            color: #efd7d8 !important;
        }

        .btn-warning {
            background: #574720 !important;
            border-color: #75612e !important;
            color: #eee3ba !important;
        }

        .btn-info {
            background: #25505a !important;
            border-color: #376e79 !important;
            color: #d5e9ed !important;
        }

        .btn-close, .close {
            filter: invert(1) grayscale(1) brightness(1.6);
        }

        /* Alerts */

        .alert-primary, .alert-info {
            background: #18334d !important;
            color: #caddec !important;
            border-color: #315c7d !important;
        }

        .alert-success {
            background: var(--dj-green) !important;
            color: var(--dj-green-text) !important;
            border-color: #306345 !important;
        }

        .alert-warning {
            background: var(--dj-yellow) !important;
            color: var(--dj-yellow-text) !important;
            border-color: #6b592b !important;
        }

        .alert-danger {
            background: var(--dj-red) !important;
            color: var(--dj-red-text) !important;
            border-color: #73373d !important;
        }

        .alert a {
            color: var(--dj-text-bright) !important;
        }

        /* Tabs */

        .nav-tabs {
            border-bottom-color: var(--dj-border) !important;
        }

        .nav-tabs .nav-link {
            color: var(--dj-muted) !important;
        }

        .nav-tabs .nav-link:hover {
            color: var(--dj-text) !important;
            border-color: var(--dj-border) !important;
        }

        .nav-tabs .nav-link.active, .nav-tabs .nav-item.show .nav-link {
            background: var(--dj-surface) !important;
            color: var(--dj-text-bright) !important;
            border-color: var(--dj-border) var(--dj-border) var(--dj-surface) !important;
        }

        /* Breadcrumbs and pagination */

        .breadcrumb {
            background: var(--dj-surface) !important;
        }

        .breadcrumb-item.active {
            color: var(--dj-muted) !important;
        }

        .page-link {
            background: var(--dj-surface) !important;
            color: var(--dj-link) !important;
            border-color: var(--dj-border) !important;
        }

        .page-link:hover {
            background: var(--dj-hover) !important;
            color: var(--dj-link-hover) !important;
        }

        .page-item.disabled .page-link {
            background: var(--dj-surface) !important;
            color: var(--dj-muted) !important;
            border-color: var(--dj-border) !important;
        }

        .page-item.active .page-link {
            background: #28537c !important;
            border-color: #3c6f9f !important;
            color: #ffffff !important;
        }

        /* Code */

        pre, code, kbd, samp, .hljs {
            background: var(--dj-surface) !important;
            color: var(--dj-text-bright) !important;
        }

        pre {
            border: 1px solid var(--dj-border) !important;
        }

        /* Borders and progress bars */

        .border, .border-top, .border-bottom, .border-start,
        .border-end, .border-left, .border-right {
            border-color: var(--dj-border) !important;
        }

        .progress {
            background: var(--dj-surface-3) !important;
        }

        /* Scrollbar */

        * {
            scrollbar-color: #484f58 var(--dj-bg);
        }

        *::-webkit-scrollbar {
            width: 12px;
            height: 12px;
        }

        *::-webkit-scrollbar-track {
            background: var(--dj-bg);
        }

        *::-webkit-scrollbar-thumb {
            background: #484f58;
            border: 3px solid var(--dj-bg);
            border-radius: 8px;
        }

        *::-webkit-scrollbar-thumb:hover {
            background: #626b77;
        }
    `);

    /* Ensure all problem badges are darkened. */

    function normalizeProblemBadges(root = document) {
        const badges = [];

        if (root instanceof Element && root.matches('.problem-badge')) {
            badges.push(root);
        }

        if (root.querySelectorAll) {
            badges.push(...root.querySelectorAll('.problem-badge'));
        }

        for (const badge of badges) {
            badge.style.setProperty('background-image', 'linear-gradient(rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.55))', 'important');
            badge.style.setProperty('color', TEXT_BRIGHT, 'important');
            badge.style.setProperty('border-color', 'rgba(210, 220, 230, 0.30)', 'important');

            for (const child of badge.querySelectorAll('*')) {
                child.style.setProperty('color', TEXT_BRIGHT, 'important');
            }
        }
    }

    /* Parse a computed RGB or RGBA color. */

    function parseRgb(value) {
        if (!value) {
            return null;
        }

        const numbers = value.match(/[\d.]+/g);

        if (!numbers || numbers.length < 3) {
            return null;
        }

        return {
            r: Number(numbers[0]),
            g: Number(numbers[1]),
            b: Number(numbers[2]),
            a: numbers.length >= 4 ? Number(numbers[3]) : 1
        };
    }

    function linearChannel(value) {
        value /= 255;
        return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    }

    function luminance(rgb) {
        return 0.2126 * linearChannel(rgb.r) + 0.7152 * linearChannel(rgb.g) + 0.0722 * linearChannel(rgb.b);
    }

    function contrastRatio(a, b) {
        const l1 = luminance(a);
        const l2 = luminance(b);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }

    function effectiveBackground(element) {
        let current = element;

        while (current) {
            const rgb = parseRgb(getComputedStyle(current).backgroundColor);

            if (rgb && rgb.a >= 0.85) {
                return rgb;
            }

            current = current.parentElement;
        }

        return { r: 13, g: 17, b: 23, a: 1 };
    }

    /* Fix low-contrast text that is not covered by explicit CSS rules. */

    function fixLowContrast(root = document) {
        const elements = [];

        if (root instanceof Element) {
            elements.push(root);
        }

        if (root.querySelectorAll) {
            elements.push(...root.querySelectorAll('*'));
        }

        for (const element of elements) {
            if (element.matches('script, style, link, meta, noscript, template')) {
                continue;
            }

            const style = getComputedStyle(element);

            if (style.display === 'none' || style.visibility === 'hidden') {
                continue;
            }

            const foreground = parseRgb(style.color);

            if (!foreground || foreground.a === 0) {
                continue;
            }

            const background = effectiveBackground(element);

            if (luminance(background) > 0.25) {
                continue;
            }

            if (contrastRatio(foreground, background) >= 4.0) {
                continue;
            }

            element.style.setProperty('color', TEXT, 'important');
        }
    }

    let updateTimer = null;

    function scheduleUpdate(root = document) {
        clearTimeout(updateTimer);

        updateTimer = setTimeout(() => {
            normalizeProblemBadges(root);
            fixLowContrast(root);
        }, 50);
    }

    function initialize() {
        normalizeProblemBadges();
        fixLowContrast();

        /* Apply the theme to elements inserted by dynamic scoreboard updates. */

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node instanceof Element) {
                        scheduleUpdate(node);
                    }
                }
            }
        });

        observer.observe(document.documentElement, { childList: true, subtree: true });

        /* Run additional passes after delayed DOMjudge initialization. */

        setTimeout(() => {
            normalizeProblemBadges();
            fixLowContrast();
        }, 500);

        setTimeout(() => {
            normalizeProblemBadges();
            fixLowContrast();
        }, 1500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
})();
