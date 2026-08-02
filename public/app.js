// Whole app in one file. No frameworks, no build step - just DOM manipulation,
// event listeners, and fetch calls (those live in data.js). State is a plain
// object that render() reads to redraw the current page. The entry form is the
// only place we do targeted updates instead of a full redraw - otherwise Film
// Review taps would blow away whatever's mid-typing in the text inputs.

import * as api from './data.js';


const MODES = [
  { id: 'offence',           label: 'Offence' },
  { id: 'offence_blocking',  label: 'Offence + Blocking' },
  { id: 'full_game',         label: 'Full Game' },
];

// Stat definitions per mode. The UI iterates these to build the grids and
// Film Review buttons, so adding a stat means adding it here (plus an entry
// in emptySet, normalizeSetKeys, the schema, and the API insert/update).
// Each entry: { key, label, tapKey?, getCount?, setCount? }
// tapKey:   field to increment on Film Review tap (default = key)
// getCount: fn(currentSet) => number (default = currentSet[key] || 0)
// setCount: fn(currentSet, n) => void - writes an absolute value back
//           (default = currentSet[key] = n). Only virtual stats need this;
//           they have no DB column of their own to write to.

// Detail mode - full breakdown
const OFFENCE_STATS_DETAIL = [
  { key: 'kills',          label: 'Kill'          },
  { key: 'continuedPlus',  label: 'Continue Plus' },
  { key: 'continuedMinus', label: 'Continue Minus'},
  { key: 'errors',         label: 'Error'         },
];
const BLOCKING_STATS_DETAIL = [
  { key: 'blockKills',  label: 'Block Kill'  },
  { key: 'blockPlus',   label: 'Block Plus'  },
  { key: 'blockMinus',  label: 'Block Minus' },
  { key: 'blockErrors', label: 'Block Error' },
];
const DEFENCE_STATS_DETAIL = [
  { key: 'digPlus',   label: 'Dig Plus'  },
  { key: 'digs',      label: 'Dig'       },
  { key: 'digErrors', label: 'Dig Error' },
];

// Standard mode - condensed; _continue is virtual (displays C++C-, taps continuedPlus)
const OFFENCE_STATS_STANDARD = [
  { key: 'kills',      label: 'Kill'  },
  { key: '_continue',  label: 'Continue',
    tapKey: 'continuedPlus',
    getCount: s => (s.continuedPlus || 0) + (s.continuedMinus || 0),
    // Manual entry types a combined total into one box, so we have to split it
    // back across two columns. The delta goes into continuedPlus and only
    // spills into continuedMinus if the new total drops below it - that way a
    // +/- split entered in Detail mode survives a trip through Standard.
    setCount: (s, n) => {
      const minus = s.continuedMinus || 0;
      if (n >= minus) { s.continuedPlus = n - minus; }
      else            { s.continuedPlus = 0; s.continuedMinus = n; }
    } },
  { key: 'errors',     label: 'Error' },
];
const BLOCKING_STATS_STANDARD = [
  { key: 'blockKills',  label: 'Block'       },
  { key: 'blockErrors', label: 'Block Error' },
];
const DEFENCE_STATS_STANDARD = [
  { key: 'digs',      label: 'Dig'       },
  { key: 'digErrors', label: 'Dig Error' },
];

// Passing - same in both modes, only colours differ
const PASSING_STATS = [
  { key: 'pass4', label: '4-Pass' },
  { key: 'pass3', label: '3-Pass' },
  { key: 'pass2', label: '2-Pass' },
  { key: 'pass1', label: '1-Pass' },
  { key: 'pass0', label: 'Pass 0' },
];

// Returns the stat sections for a given mode + detail level.
// detailMode=true (default) → full breakdown; false → condensed Standard buttons.
// Manual entry always passes true; Film Review passes es.detailMode.
function getStatGroups(mode, detailMode = true) {
  const offenceStats  = detailMode ? OFFENCE_STATS_DETAIL  : OFFENCE_STATS_STANDARD;
  const blockingStats = detailMode ? BLOCKING_STATS_DETAIL : BLOCKING_STATS_STANDARD;
  const defenceStats  = detailMode ? DEFENCE_STATS_DETAIL  : DEFENCE_STATS_STANDARD;

  const groups = [{ label: 'Attack', stats: offenceStats }];
  if (mode === 'offence_blocking' || mode === 'full_game')
    groups.push({ label: 'Blocking', stats: blockingStats });
  if (mode === 'full_game') {
    groups.push({ label: 'Defence', stats: defenceStats });
    groups.push({ label: 'Passing', stats: PASSING_STATS });
  }
  return groups;
}

// Read/write a stat through its definition, so callers don't have to care
// whether it's a real column or a virtual one like _continue.
function readStat(set, def) {
  return def.getCount ? def.getCount(set) : (set[def.key] || 0);
}

function writeStat(set, def, n) {
  const val = Math.max(0, n);
  if (def.setCount) def.setCount(set, val);
  else              set[def.key] = val;
}

// Fields Standard mode can't reach. Standard's Continue card still covers
// continuedMinus (it's in the total, and setCount can spill into it), so these
// are the only ones you genuinely can't touch without switching to Detail.
const DETAIL_ONLY_STATS = [
  { key: 'blockPlus',  label: 'Block+', modes: ['offence_blocking', 'full_game'] },
  { key: 'blockMinus', label: 'Block−', modes: ['offence_blocking', 'full_game'] },
  { key: 'digPlus',    label: 'Dig+',   modes: ['full_game'] },
];

// Just a lookup of id → label, derived from MODES so I don't have to keep
// two things in sync.
const MODE_LABELS = Object.fromEntries(MODES.map(m => [m.id, m.label]));

//                                ██
//                               ██
// ██████╗ ███████╗███╗   ██╗███████╗███████╗
// ██╔══██╗██╔════╝████╗  ██║██╔════╝██╔════╝
// ██████╔╝█████╗  ██╔██╗ ██║█████╗  █████╗
// ██╔══██╗██╔══╝  ██║╚██╗██║██╔══╝  ██╔══╝
// ██║  ██║███████╗██║ ╚████║███████╗███████╗
// ╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝╚══════╝╚══════╝
//
// ██╗  ██╗███████╗██╗      ███╗   ███╗███████╗██████╗
// ██║  ██║██╔════╝██║      ████╗ ████║██╔════╝██╔══██╗
// ███████║█████╗  ██║      ██╔████╔██║█████╗  ██████╔╝
// ██╔══██║██╔══╝  ██║      ██║╚██╔╝██║██╔══╝  ██╔══██╗
// ██║  ██║███████╗███████╗ ██║ ╚═╝ ██║███████╗██║  ██║
// ╚═╝  ╚═╝╚══════╝╚══════╝ ╚═╝     ╚═╝╚══════╝╚═╝  ╚═╝
//
// The efficiency formulas below (and the pass rating scale) are lifted
// directly from Renée Helmer's Excel workbook; she did the actual stat
// methodology, I just ported it to JavaScript.
// THIS IS HER EXPLICIT CREDIT.

function calcStats(kills, errors, continued, blockKills = 0) {
  const attempts = kills + errors + continued;
  if (!attempts && !blockKills) return { killPct: 0, errorPct: 0, efficiency: 0, attempts: 0 };
  return {
    killPct:    attempts ? kills / attempts : 0,
    errorPct:   attempts ? errors / attempts : 0,
    // block kills bump efficiency but they aren't attack attempts, so they
    // only show up in the numerator
    efficiency: attempts ? (kills + blockKills - errors) / attempts : 0,
    attempts,
  };
}

// Good pass % = (4-passes + 3-passes) / total. Both grades give the setter
// real options, so lumping them together as "good passes" is more useful than
// tracking 4s alone. 50%+ is a reasonable benchmark.
function calcPassPct(s) {
  const total = (s.pass_4||0) + (s.pass_3||0) + (s.pass_2||0) + (s.pass_1||0) + (s.pass_0||0);
  if (!total) return null;
  return ((s.pass_4||0) + (s.pass_3||0)) / total;
}

// CSS colour token for an efficiency value - green ≥30%, yellow ≥15%, red below.
function effColor(eff) {
  if (eff === null || eff === undefined || isNaN(eff)) return 'var(--text-sec)';
  if (eff >= 0.300) return 'var(--success)';
  if (eff >= 0.150) return 'var(--warning)';
  return 'var(--danger)';
}

function pctStr(val, total) {
  if (!total) return '-';
  return (val / total * 100).toFixed(1) + '%';
}

function effStr(kills, errors, total, blockKills = 0) {
  if (!total) return '-';
  return ((kills + blockKills - errors) / total * 100).toFixed(1) + '%';
}

function effNum(kills, errors, total, blockKills = 0) {
  if (!total) return null;
  return (kills + blockKills - errors) / total;
}

// Good pass % - 50%+ is the benchmark, same scale the README describes.
function passPctColor(p) {
  if (p === null || p === undefined || isNaN(p)) return 'var(--text-sec)';
  if (p >= 0.50) return 'var(--success)';
  if (p >= 0.35) return 'var(--warning)';
  return 'var(--danger)';
}

// Passer rating sits on a 0-4 scale, so it needs its own thresholds rather
// than the 0-1 ones effColor uses.
function ratingColor(r) {
  if (r === null || r === undefined || isNaN(r)) return 'var(--text-sec)';
  if (r >= 2.5) return 'var(--success)';
  if (r >= 2.2) return 'var(--warning)';
  return 'var(--danger)';
}

//  ██╗  ██╗███████╗██╗     ██████╗
//  ██║  ██║██╔════╝██║     ██╔══██╗
//  ███████║█████╗  ██║     ██████╔╝
//  ██╔══██║██╔══╝  ██║     ██╔═══╝
//  ██║  ██║███████╗███████╗██║
//  ╚═╝  ╚═╝╚══════╝╚══════╝╚═╝
//
// Plain-English explanations for every derived number, keyed so the same text
// can hang off a dashboard card, an accordion row, or anywhere else it shows
// up. Written for someone who doesn't already know volleyball stats - no
// jargon that isn't immediately unpacked.

const STAT_HELP = {
  killPct: {
    title: 'Kill %',
    body: 'Of every ball you attacked, how often it ended the rally in your favour. A kill is an attack the other team can\'t bring back. Kills ÷ total attacks.',
    formula: 'Kills ÷ attempts',
    weights: [
      ['Kill', '+1'],
      ['Error', '0'],
      ['Continue +', '0'],
      ['Continue −', '0'],
    ],
    denominator: 'Kills + errors + continues',
  },
  errorPct: {
    title: 'Error %',
    body: 'How often your attack ended the rally in their favour - hit out, into the net, or stuffed straight back down. Errors ÷ total attacks.',
    formula: 'Errors ÷ attempts',
    weights: [
      ['Error', '+1'],
      ['Kill', '0'],
      ['Continue +', '0'],
      ['Continue −', '0'],
    ],
    denominator: 'Kills + errors + continues',
  },
  efficiency: {
    title: 'Efficiency %',
    body: 'Kills minus errors, as a share of your attacks. It rewards putting balls away and punishes giving points back, so it says more than kill % on its own. Block kills count as a plus because they win the rally, but they aren\'t attacks so they stay out of the total. It goes negative if you make more errors than kills. 30%+ is strong, under 15% needs work.',
    formula: '(Kills + block kills − errors) ÷ attempts',
    weights: [
      ['Kill', '+1'],
      ['Block kill', '+1'],
      ['Error', '−1'],
      ['Continue +', '0'],
      ['Continue −', '0'],
    ],
    denominator: 'Kills + errors + continues — block kills stay out of the bottom',
  },
  attempts: {
    title: 'Attempts',
    body: 'Every ball you attacked - the kills, the errors, and the ones that stayed in play for someone else to deal with.',
    formula: 'A straight count',
    weights: [
      ['Kill', '+1'],
      ['Error', '+1'],
      ['Continue +', '+1'],
      ['Continue −', '+1'],
    ],
    denominator: 'Not a ratio — this is the total',
  },
  blockEff: {
    title: 'Block Efficiency',
    body: 'Your blocking with the damage subtracted. Blocks that scored and blocks that slowed the ball into a diggable one, minus blocks that handed them an easy ball or gave away the point outright - divided by every block you touched. Goes negative if you\'re doing more harm than good at the net.',
    formula: '(Block kills + plus − minus − errors) ÷ touches',
    weights: [
      ['Block kill', '+1'],
      ['Block +', '+1'],
      ['Block −', '−1'],
      ['Block error', '−1'],
    ],
    denominator: 'Every block you touched',
  },
  blockKillPct: {
    title: 'Block Kill %',
    body: 'How often a block ended the rally on the spot - the ball came straight back down on their side of the net.',
    formula: 'Block kills ÷ touches',
    weights: [
      ['Block kill', '+1'],
      ['Block +', '0'],
      ['Block −', '0'],
      ['Block error', '0'],
    ],
    denominator: 'Every block you touched',
  },
  blockErrPct: {
    title: 'Block Error %',
    body: 'How often a block cost you the point directly - into the net, out of bounds, or a touch called against you.',
    formula: 'Block errors ÷ touches',
    weights: [
      ['Block error', '+1'],
      ['Block kill', '0'],
      ['Block +', '0'],
      ['Block −', '0'],
    ],
    denominator: 'Every block you touched',
  },
  blockTouches: {
    title: 'Block Touches',
    body: 'Every block you got a hand on, good or bad. Blocks you never reached aren\'t counted - this only measures what you actually touched.',
    formula: 'A straight count',
    weights: [
      ['Block kill', '+1'],
      ['Block +', '+1'],
      ['Block −', '+1'],
      ['Block error', '+1'],
    ],
    denominator: 'Not a ratio — this is the total',
  },
  digEff: {
    title: 'Dig Efficiency',
    body: 'Your defence with the damage subtracted. Clean digs and playable digs, minus the ones you shanked, over every dig you went for. A clean dig is one the setter could actually run an offence from.',
    formula: '(Dig plus + digs − dig errors) ÷ attempts',
    weights: [
      ['Dig +', '+1'],
      ['Dig', '+1'],
      ['Dig error', '−1'],
    ],
    denominator: 'Every dig you went for',
  },
  digPerfectPct: {
    title: 'Perfect Dig %',
    body: 'How often your dig came up clean enough that the setter had real options - not just kept alive, but genuinely playable.',
    formula: 'Dig plus ÷ attempts',
    weights: [
      ['Dig +', '+1'],
      ['Dig', '0'],
      ['Dig error', '0'],
    ],
    denominator: 'Every dig you went for',
  },
  digErrPct: {
    title: 'Dig Error %',
    body: 'How often a dig attempt didn\'t come up at all - shanked away, straight down, or missed.',
    formula: 'Dig errors ÷ attempts',
    weights: [
      ['Dig error', '+1'],
      ['Dig +', '0'],
      ['Dig', '0'],
    ],
    denominator: 'Every dig you went for',
  },
  digAttempts: {
    title: 'Dig Attempts',
    body: 'Every ball you went for on defence, whether or not you came up with it.',
    formula: 'A straight count',
    weights: [
      ['Dig +', '+1'],
      ['Dig', '+1'],
      ['Dig error', '+1'],
    ],
    denominator: 'Not a ratio — this is the total',
  },
  goodPassPct: {
    title: 'Good Pass %',
    body: 'The share of your passes graded a 3 or a 4 - the ones that left the setter with real options rather than scrambling. Both grades get lumped together because either one gives you a functioning offence. 50%+ is a reasonable benchmark.',
    formula: '(4-Pass + 3-Pass) ÷ passes',
    weights: [
      ['4-Pass', '+1'],
      ['3-Pass', '+1'],
      ['2-Pass', '0'],
      ['1-Pass', '0'],
      ['0-Pass', '0'],
    ],
    denominator: 'Every serve you took',
  },
  passerRating: {
    title: 'Passer Rating',
    body: 'Your passes averaged out on the 0-4 scale: a 4 is perfect, a 0 is an ace against you. It\'s the number coaches usually quote, and unlike good pass % it gives partial credit for a 2. Around 2.3 is serviceable, 2.5 and up is good.',
    formula: '(4×4s + 3×3s + 2×2s + 1×1s) ÷ passes',
    weights: [
      ['4-Pass', '×4'],
      ['3-Pass', '×3'],
      ['2-Pass', '×2'],
      ['1-Pass', '×1'],
      ['0-Pass', '×0'],
    ],
    denominator: 'Every serve you took',
  },
  passAces: {
    title: '0-Pass %',
    body: 'How often a serve beat you outright for an ace, or your pass was unplayable. Straight loss of the rally.',
    formula: '0-Passes ÷ passes',
    weights: [
      ['0-Pass', '+1'],
      ['4-Pass', '0'],
      ['3-Pass', '0'],
      ['2-Pass', '0'],
      ['1-Pass', '0'],
    ],
    denominator: 'Every serve you took',
  },
  passAttempts: {
    title: 'Passes',
    body: 'Every serve you took, whatever grade it ended up being.',
    formula: 'A straight count',
    weights: [
      ['4-Pass', '+1'],
      ['3-Pass', '+1'],
      ['2-Pass', '+1'],
      ['1-Pass', '+1'],
      ['0-Pass', '+1'],
    ],
    denominator: 'Not a ratio — this is the total',
  },
};

// Tracks the popover that's currently open so a second tap anywhere closes it.
let openHelpPopover = null;

function closeHelpPopover() {
  if (!openHelpPopover) return;
  openHelpPopover.wrap.classList.remove('help-open');
  openHelpPopover.btn.setAttribute('aria-expanded', 'false');
  openHelpPopover = null;
}

document.addEventListener('click', closeHelpPopover);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeHelpPopover(); });

// Place the open bubble in viewport coordinates. It's position:fixed because
// accordions, cards and table wrappers all clip with overflow:hidden, which
// used to lop the bottom off any tooltip opened near the end of a section.
// Fixed escapes every clipping context; the cost is that we own the maths.
function positionOpenPopover() {
  if (!openHelpPopover) return;
  const { btn, pop } = openHelpPopover;

  const MARGIN = 8;
  pop.style.left = '0px';
  pop.style.top  = '0px';

  const btnRect = btn.getBoundingClientRect();
  const popRect = pop.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;

  let x = btnRect.left - MARGIN;                  // preferred: under the ⓘ
  x = Math.min(x, vw - MARGIN - popRect.width);   // don't run off the right
  x = Math.max(x, MARGIN);                        // ...or off the left

  let y = btnRect.bottom + MARGIN;                // preferred: below
  if (y + popRect.height > vh - MARGIN) {
    const above = btnRect.top - MARGIN - popRect.height;
    // Flip above if there's room, else pin to the bottom and let the bubble
    // scroll inside itself (max-height covers the rest).
    y = above >= MARGIN ? above : Math.max(MARGIN, vh - MARGIN - popRect.height);
  }

  pop.style.left = x + 'px';
  pop.style.top  = y + 'px';
}

// Follow the ⓘ rather than dismissing. Closing on scroll sounds tidy but the
// address bar sliding away on a phone counts as a scroll, which would snap the
// bubble shut the instant you opened one near the bottom of the screen.
window.addEventListener('scroll', positionOpenPopover, true);
window.addEventListener('resize', positionOpenPopover);

// An ⓘ button that opens a small popover explaining the stat. `title` on its
// own is no good here - it never fires on a touchscreen, and this is a phone
// app first.
function helpTip(key) {
  const help = STAT_HELP[key];
  if (!help) return document.createTextNode('');

  const wrap = document.createElement('span');
  wrap.className = 'help-wrap';

  const btn = document.createElement('button');
  btn.className = 'help-btn';
  btn.type = 'button';
  btn.textContent = 'ⓘ';
  btn.setAttribute('aria-label', `What is ${help.title}?`);
  btn.setAttribute('aria-expanded', 'false');

  const pop = document.createElement('span');
  pop.className = 'help-pop';
  pop.setAttribute('role', 'tooltip');

  const t = document.createElement('span');
  t.className = 'help-pop-title';
  t.textContent = help.title;

  const b = document.createElement('span');
  b.className = 'help-pop-body';
  b.textContent = help.body;

  pop.appendChild(t);
  pop.appendChild(b);

  // Weights table - what each event is worth in the numerator, and what the
  // whole thing gets divided by. Spelling this out beats prose for anyone
  // trying to reconcile a number against their own count.
  if (help.weights) {
    const f = document.createElement('span');
    f.className = 'help-pop-formula';
    f.textContent = help.formula;
    pop.appendChild(f);

    const table = document.createElement('span');
    table.className = 'help-weights';

    help.weights.forEach(([label, weight]) => {
      const row = document.createElement('span');
      row.className = 'help-weight-row' + (weight === '0' || weight === '×0' ? ' help-weight-zero' : '');

      const l = document.createElement('span');
      l.textContent = label;

      const w = document.createElement('span');
      w.className = 'help-weight-val';
      w.textContent = weight;

      row.appendChild(l);
      row.appendChild(w);
      table.appendChild(row);
    });

    pop.appendChild(table);

    const den = document.createElement('span');
    den.className = 'help-pop-den';
    den.textContent = 'Divided by: ' + help.denominator;
    pop.appendChild(den);
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = openHelpPopover && openHelpPopover.wrap === wrap;
    closeHelpPopover();
    if (wasOpen) return;

    wrap.classList.add('help-open');
    btn.setAttribute('aria-expanded', 'true');
    openHelpPopover = { wrap, btn, pop };
    positionOpenPopover();
  });

  // Taps inside the bubble shouldn't dismiss it - you might be selecting text.
  pop.addEventListener('click', e => e.stopPropagation());

  wrap.appendChild(btn);
  wrap.appendChild(pop);
  return wrap;
}

function fmtDate(dateStr, opts = {}) {
  // Dates come back as plain YYYY-MM-DD. Parse at noon UTC so a -5 or +12
  // timezone doesn't shift the day backward when we render.
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', opts);
}

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// Per-device UI preferences, stored in localStorage. Not on the user record
// because Kobe's phone is allowed to look different from mine.
const SETTINGS_KEY = 'vs_settings';

const SETTINGS_DEFAULTS = {
  accentColor: '#FF6B35',
  // Entry-form toggles live here too, so the form opens the way you last left
  // it instead of resetting to Film + Standard every single time.
  entryMode:   'film',
  detailMode:  false,
  // Which of the blocking/passing/digging accordions you left open.
  openSections: {},
};

// Preset accent swatches. There's still a colour picker for anyone who wants
// something off-list.
const ACCENT_PRESETS = [
  '#FF6B35', '#60A5FA', '#34D399', '#FBBF24',
  '#F87171', '#A78BFA', '#F472B6',
];

let settings = loadSettings();

function loadSettings() {
  try {
    return { ...SETTINGS_DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}

function saveSetting(key, value) {
  settings[key] = value;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  applyAccentColor();
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function applyAccentColor() {
  document.documentElement.style.setProperty('--accent', settings.accentColor);
  // accent-muted is just the same colour at 12% - re-derive it whenever
  // accent changes so the two stay in sync.
  const { r, g, b } = hexToRgb(settings.accentColor);
  document.documentElement.style.setProperty('--accent-muted', `rgba(${r},${g},${b},0.12)`);
}

// One object holding all app state. render() reads from it; everything else
// mutates it in place.
const state = {
  page:        'dashboard',
  sessionId:   null,
  users:       [],
  currentUser: null,
  sessions:    [],      // sessions for the current user, cached after load
  entryState:  null,    // populated when on the entry/edit page
};

// Hold all active Chart.js instances so we can destroy them on navigate and
// avoid leaking canvas contexts when leaving the dashboard.
let chartInstances = [];

function emptySet() {
  return {
    kills: 0, errors: 0, continuedPlus: 0, continuedMinus: 0,
    blockKills: 0, blockPlus: 0, blockMinus: 0, blockErrors: 0,
    digPlus: 0, digs: 0, digErrors: 0,
    pass4: 0, pass3: 0, pass2: 0, pass1: 0, pass0: 0,
  };
}

function sumSets(sets) {
  const total = emptySet();
  sets.forEach(s => Object.keys(total).forEach(k => { total[k] += s[k] || 0; }));
  return total;
}

// Fresh entry-form state. Pass an existing session to pre-populate for editing.
function freshEntryState(editing = null) {
  return {
    eventName:  editing?.event_name  || '',
    eventDate:  editing?.event_date  || new Date().toISOString().slice(0, 10),
    notes:      editing?.notes       || '',
    mode:       editing?.mode        || 'offence',
    sets:       editing?.sets?.length
      ? editing.sets.map(s => ({ ...emptySet(), ...normalizeSetKeys(s) }))
      : [emptySet()],
    activeTab:  0,               // 0 = Game Total, 1+ = Set N
    entryMode:  settings.entryMode,
    detailMode: settings.detailMode,  // false = Standard (condensed), true = Detail (full breakdown)
    tapHistory: [],              // for undo in Film Review
    errors:     {},              // field-level validation errors
  };
}

// D1 gives back snake_case, the frontend wants camelCase - this just flips
// the keys. The `|| s.xxxCamel` fallbacks let us pass an already-camel object
// straight through (handy when editing in-memory before save).
// The longer fallback chains (e.g. `|| s.continued || 0`) are backward
// compatibility for old session rows written before the schema rename. Any
// session logged before the rename will have zeros in the new columns but
// non-zero in the old ones - the fallback picks those up so old data still
// reads correctly without a migration.
function normalizeSetKeys(s) {
  return {
    kills:         s.kills           || 0,
    errors:        s.errors          || 0,
    continuedPlus:  s.continued_plus  || s.continuedPlus  || s.continued || 0,
    continuedMinus: s.continued_minus || s.continuedMinus || 0,
    blockKills:    s.block_kills     || s.blockKills     || 0,
    blockPlus:     s.block_plus      || s.blockPlus      || s.block_positive || s.blockPositive || 0,
    blockMinus:    s.block_minus     || s.blockMinus     || 0,
    blockErrors:   s.block_errors    || s.blockErrors    || 0,
    digPlus:       s.dig_plus        || s.digPlus        || s.dig_perfect || s.digPerfect || 0,
    digs:          s.digs            || 0,
    digErrors:     s.dig_errors      || s.digErrors      || 0,
    pass4:         s.pass_4          || s.pass4          || s.pass_perfect  || s.passPerfect  || 0,
    pass3:         s.pass_3          || s.pass3          || s.pass_positive || s.passPositive || 0,
    pass2:         s.pass_2          || s.pass2          || 0,
    pass1:         s.pass_1          || s.pass1          || 0,
    pass0:         s.pass_0          || s.pass0          || s.pass_error    || s.passError    || 0,
  };
}

// Roll up a session's sets into the four numbers we need for every dashboard
// card, chart point, and history row. Same loop was getting copy-pasted four
// times - pulled it out into one place.
function sessionTotals(s) {
  let k = 0, e = 0, cp = 0, cm = 0, bk = 0;
  (s.sets || []).forEach(set => {
    k  += set.kills           || 0;
    e  += set.errors          || 0;
    cp += set.continued_plus  || set.continuedPlus  || 0;
    cm += set.continued_minus || set.continuedMinus || 0;
    bk += set.block_kills     || set.blockKills     || 0;
  });
  const c = cp + cm;
  return { k, e, c, bk, att: k + e + c };
}

// Blocking, defence, and passing live in separate helpers from sessionTotals
// because they're mode-specific - sessionTotals is called everywhere regardless
// of mode, so mixing them in would add noise. These are only called when we
// know we're working with the right session type.
function sessionBlockingTotals(s) {
  let bk = 0, bp = 0, bm = 0, be = 0;
  (s.sets || []).forEach(set => {
    bk += set.block_kills  || set.blockKills  || 0;
    bp += set.block_plus   || set.blockPlus   || set.block_positive || 0;
    bm += set.block_minus  || set.blockMinus  || 0;
    be += set.block_errors || set.blockErrors || 0;
  });
  return { bk, bp, bm, be, total: bk + bp + bm + be };
}

function sessionDefenceTotals(s) {
  let dp = 0, d = 0, de = 0;
  (s.sets || []).forEach(set => {
    dp += set.dig_plus   || set.digPlus   || 0;
    d  += set.digs                        || 0;
    de += set.dig_errors || set.digErrors || 0;
  });
  return { dp, d, de, total: dp + d + de };
}

function sessionPassingTotals(s) {
  let p4 = 0, p3 = 0, p2 = 0, p1 = 0, p0 = 0;
  (s.sets || []).forEach(set => {
    p4 += set.pass_4 || set.pass4 || 0;
    p3 += set.pass_3 || set.pass3 || 0;
    p2 += set.pass_2 || set.pass2 || 0;
    p1 += set.pass_1 || set.pass1 || 0;
    p0 += set.pass_0 || set.pass0 || 0;
  });
  return { p4, p3, p2, p1, p0, total: p4 + p3 + p2 + p1 + p0 };
}

// Same three totals summed across a list of sessions, for the dashboard's
// all-time view. Each one folds the per-session helper above.
// Like sessionTotals but keeps the continue +/- split, which the attack
// breakdown doughnut needs. Same legacy-column fallbacks as everything else.
function sessionAttackTotals(s) {
  let k = 0, e = 0, cp = 0, cm = 0, bk = 0;
  (s.sets || []).forEach(set => {
    k  += set.kills           || 0;
    e  += set.errors          || 0;
    cp += set.continued_plus  || set.continuedPlus  || 0;
    cm += set.continued_minus || set.continuedMinus || 0;
    bk += set.block_kills     || set.blockKills     || 0;
  });
  return { k, e, cp, cm, bk, att: k + e + cp + cm };
}

function aggregateAttack(sessions) {
  return sessions.reduce((a, s) => {
    const t = sessionAttackTotals(s);
    return { k: a.k + t.k, e: a.e + t.e, cp: a.cp + t.cp, cm: a.cm + t.cm,
             bk: a.bk + t.bk, att: a.att + t.att };
  }, { k: 0, e: 0, cp: 0, cm: 0, bk: 0, att: 0 });
}

function aggregateBlocking(sessions) {
  return sessions.reduce((a, s) => {
    const t = sessionBlockingTotals(s);
    return { bk: a.bk + t.bk, bp: a.bp + t.bp, bm: a.bm + t.bm, be: a.be + t.be, total: a.total + t.total };
  }, { bk: 0, bp: 0, bm: 0, be: 0, total: 0 });
}

function aggregateDefence(sessions) {
  return sessions.reduce((a, s) => {
    const t = sessionDefenceTotals(s);
    return { dp: a.dp + t.dp, d: a.d + t.d, de: a.de + t.de, total: a.total + t.total };
  }, { dp: 0, d: 0, de: 0, total: 0 });
}

function aggregatePassing(sessions) {
  return sessions.reduce((a, s) => {
    const t = sessionPassingTotals(s);
    return { p4: a.p4 + t.p4, p3: a.p3 + t.p3, p2: a.p2 + t.p2, p1: a.p1 + t.p1, p0: a.p0 + t.p0, total: a.total + t.total };
  }, { p4: 0, p3: 0, p2: 0, p1: 0, p0: 0, total: 0 });
}

//  ── Derived metrics for the three secondary disciplines ──────────────────────
//  Each returns { headline, headlineColor, rows[] } so the accordion header can
//  show one number and the body can list the breakdown. Shapes match on purpose
//  so one renderer handles all three.
//
//  Block and dig efficiency mirror attack efficiency: the good stuff minus the
//  damage, over everything you touched. They can go negative the same way.

// Composition ramp for the breakdown doughnuts. These categories are ORDERED
// (best outcome → worst), not just different from each other, so the colour job
// is diverging - two poles either side of a neutral - rather than a set of
// arbitrary categorical hues.
//
// Checked with the palette validator against the dark surface rather than by
// eye: worst adjacent pair is ΔE 15.2 for normal vision and 13.7 under deutan,
// both clear of the floors. The app's own --success/--danger tokens FAILED that
// check - #34D399 next to #6EE7B7 is ΔE 7.6, which almost nobody can separate
// as neighbouring slices - so the ramp below is re-stepped for this job.
const COMP_RAMP = {
  best:    '#0E9F6E',
  good:    '#34D399',
  neutral: '#8B90A8',
  poor:    '#F59E0B',
  worst:   '#DC2626',
};

// Doughnut showing what a discipline's touches were actually made of. Legal
// use of the form: part-to-whole, read at a glance, never more than 5 segments.
// Values live in the legend rather than on the slices - a number on every
// segment is noise, and thin slices have nowhere to put one.
function renderCompositionCard(title, segments) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (!total) return null;

  const card = document.createElement('div');
  card.className = 'card comp-card';

  const heading = document.createElement('div');
  heading.className = 'chart-title';
  heading.textContent = title;
  card.appendChild(heading);

  const layout = document.createElement('div');
  layout.className = 'comp-layout';

  const wrap = document.createElement('div');
  wrap.className = 'comp-canvas-wrap';
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  layout.appendChild(wrap);

  // Legend is always present - identity must never be carried by colour alone.
  const legend = document.createElement('div');
  legend.className = 'comp-legend';
  segments.forEach(s => {
    const row = document.createElement('div');
    row.className = 'comp-legend-row';

    const dot = document.createElement('span');
    dot.className = 'comp-dot';
    dot.style.background = s.color;

    const lbl = document.createElement('span');
    lbl.className = 'comp-legend-label';
    lbl.textContent = s.label;

    const val = document.createElement('span');
    val.className = 'comp-legend-val';
    val.textContent = `${s.value} · ${(s.value / total * 100).toFixed(0)}%`;

    row.append(dot, lbl, val);
    legend.appendChild(row);
  });
  layout.appendChild(legend);
  card.appendChild(layout);

  let myChart = null;
  deferChartBuild(() => {
    myChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: segments.map(s => s.label),
        datasets: [{
          data: segments.map(s => s.value),
          backgroundColor: segments.map(s => s.color),
          // 2px of surface between segments - the spacer that keeps adjacent
          // fills from reading as one blob.
          borderColor: '#1A1D27',
          borderWidth: 2,
          hoverOffset: 4,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '58%',
        plugins: {
          legend: { display: false },   // we render our own, with values
          tooltip: {
            backgroundColor: '#1A1D27',
            borderColor: '#2E3350',
            borderWidth: 1,
            titleColor: '#F0F2FF',
            bodyColor: '#8B90A8',
            padding: 10,
            displayColors: false,
            callbacks: {
              label: c => `${c.raw} · ${(c.raw / total * 100).toFixed(1)}%`,
            },
          },
        },
      },
    });
    chartInstances.push(myChart);
  });

  return card;
}

function attackMetrics(t) {
  const eff  = t.att ? (t.k + t.bk - t.e) / t.att : null;
  const cont = t.cp + t.cm;
  return {
    headline: eff === null ? '-' : (eff * 100).toFixed(1) + '%',
    headlineColor: effColor(eff),
    rows: [
      { label: 'Efficiency %', value: eff === null ? '-' : (eff * 100).toFixed(1) + '%', color: effColor(eff), help: 'efficiency' },
      { label: 'Kill %',       value: pctStr(t.k, t.att), help: 'killPct' },
      { label: 'Error %',      value: pctStr(t.e, t.att), color: 'var(--danger)', help: 'errorPct' },
      { label: 'Continue %',   value: pctStr(cont, t.att), help: 'attempts' },
      { label: 'Attempts',     value: t.att ? String(t.att) : '-', help: 'attempts' },
    ],
    segments: [
      { label: 'Kill',       value: t.k,  color: COMP_RAMP.best },
      { label: 'Continue +', value: t.cp, color: COMP_RAMP.good },
      { label: 'Continue −', value: t.cm, color: COMP_RAMP.poor },
      { label: 'Error',      value: t.e,  color: COMP_RAMP.worst },
    ],
  };
}

function blockingMetrics(t) {
  const eff = t.total ? (t.bk + t.bp - t.bm - t.be) / t.total : null;
  return {
    headline: eff === null ? '-' : (eff * 100).toFixed(1) + '%',
    headlineColor: effColor(eff),
    rows: [
      { label: 'Block efficiency', value: eff === null ? '-' : (eff * 100).toFixed(1) + '%', color: effColor(eff), help: 'blockEff' },
      { label: 'Block kill %',     value: pctStr(t.bk, t.total), help: 'blockKillPct' },
      { label: 'Block error %',    value: pctStr(t.be, t.total), color: 'var(--danger)', help: 'blockErrPct' },
      { label: 'Touches',          value: t.total ? String(t.total) : '-', help: 'blockTouches' },
    ],
    segments: [
      { label: 'Block kill',  value: t.bk, color: COMP_RAMP.best },
      { label: 'Block +',     value: t.bp, color: COMP_RAMP.good },
      { label: 'Block −',     value: t.bm, color: COMP_RAMP.poor },
      { label: 'Block error', value: t.be, color: COMP_RAMP.worst },
    ],
  };
}

function diggingMetrics(t) {
  const eff = t.total ? (t.dp + t.d - t.de) / t.total : null;
  return {
    headline: eff === null ? '-' : (eff * 100).toFixed(1) + '%',
    headlineColor: effColor(eff),
    rows: [
      { label: 'Dig efficiency', value: eff === null ? '-' : (eff * 100).toFixed(1) + '%', color: effColor(eff), help: 'digEff' },
      { label: 'Perfect dig %',  value: pctStr(t.dp, t.total), help: 'digPerfectPct' },
      { label: 'Dig error %',    value: pctStr(t.de, t.total), color: 'var(--danger)', help: 'digErrPct' },
      { label: 'Attempts',       value: t.total ? String(t.total) : '-', help: 'digAttempts' },
    ],
    segments: [
      { label: 'Dig +',     value: t.dp, color: COMP_RAMP.good },
      { label: 'Dig',       value: t.d,  color: COMP_RAMP.neutral },
      { label: 'Dig error', value: t.de, color: COMP_RAMP.worst },
    ],
  };
}

function passingMetrics(t) {
  const good   = t.total ? (t.p4 + t.p3) / t.total : null;
  // Standard 0-4 serve-receive rating. 0-passes contribute nothing but still
  // count in the denominator, which is what drags the average down.
  const rating = t.total ? (4 * t.p4 + 3 * t.p3 + 2 * t.p2 + 1 * t.p1) / t.total : null;
  return {
    headline: rating === null ? '-' : rating.toFixed(2),
    headlineColor: ratingColor(rating),
    rows: [
      { label: 'Good pass %',   value: good === null ? '-' : (good * 100).toFixed(1) + '%', color: passPctColor(good), help: 'goodPassPct' },
      { label: 'Passer rating', value: rating === null ? '-' : rating.toFixed(2), color: ratingColor(rating), help: 'passerRating' },
      { label: '0-pass %',      value: pctStr(t.p0, t.total), color: 'var(--danger)', help: 'passAces' },
      { label: 'Passes',        value: t.total ? String(t.total) : '-', help: 'passAttempts' },
    ],
    segments: [
      { label: '4-Pass', value: t.p4, color: COMP_RAMP.best },
      { label: '3-Pass', value: t.p3, color: COMP_RAMP.good },
      { label: '2-Pass', value: t.p2, color: COMP_RAMP.neutral },
      { label: '1-Pass', value: t.p1, color: COMP_RAMP.poor },
      { label: '0-Pass', value: t.p0, color: COMP_RAMP.worst },
    ],
  };
}

// Renders the { rows } from the metric builders above as a labelled list, each
// with its own ⓘ explainer.
function renderMetricRows(rows) {
  const list = document.createElement('div');
  list.className = 'metric-list';

  rows.forEach(({ label, value, color, help }) => {
    const row = document.createElement('div');
    row.className = 'metric-row';

    const lbl = document.createElement('span');
    lbl.className = 'metric-label';
    lbl.textContent = label;
    if (help) lbl.appendChild(helpTip(help));

    const val = document.createElement('span');
    val.className = 'metric-value';
    val.textContent = value;
    if (color) val.style.color = color;

    row.appendChild(lbl);
    row.appendChild(val);
    list.appendChild(row);
  });

  return list;
}

// Collapsible section. The body is built lazily on first open - the dashboard
// puts charts in here, and Chart.js sizes itself to a hidden canvas as 0x0 if
// you build it while the section is still collapsed.
function renderAccordion({ key, label, summary, summaryColor, build }) {
  const wrap = document.createElement('div');
  wrap.className = 'accordion';

  const head = document.createElement('button');
  head.className = 'accordion-head';
  head.type = 'button';

  const caret = document.createElement('span');
  caret.className = 'accordion-caret';
  caret.textContent = '▸';

  const lbl = document.createElement('span');
  lbl.className = 'accordion-label';
  lbl.textContent = label;

  const sum = document.createElement('span');
  sum.className = 'accordion-summary';
  sum.textContent = summary;
  if (summaryColor) sum.style.color = summaryColor;

  head.appendChild(caret);
  head.appendChild(lbl);
  head.appendChild(sum);

  const body = document.createElement('div');
  body.className = 'accordion-body';

  let built = false;
  const openSections = settings.openSections || {};
  let open = !!openSections[key];

  function apply() {
    if (open && !built) { body.appendChild(build()); built = true; }
    wrap.classList.toggle('accordion-open', open);
    head.setAttribute('aria-expanded', String(open));
  }

  head.addEventListener('click', () => {
    open = !open;
    apply();
    // Remember it per device - if you always want blocking visible, it stays.
    saveSetting('openSections', { ...(settings.openSections || {}), [key]: open });
  });

  apply();
  wrap.appendChild(head);
  wrap.appendChild(body);
  return wrap;
}

async function navigate(page, opts = {}) {
  // Destroy all chart instances before navigating away.
  chartInstances.forEach(c => c.destroy());
  chartInstances = [];

  state.page = page;
  if (opts.sessionId !== undefined) state.sessionId = opts.sessionId;

  if (page === 'entry') {
    state.entryState = freshEntryState();
  } else if (page === 'edit') {
    // Refetch even though the session is usually in state.sessions already -
    // that cache can be a few seconds stale and edits should always show
    // the current truth.
    const s = await api.getSession(opts.sessionId).catch(() => null);
    state.entryState = freshEntryState(s);
    state.sessionId = opts.sessionId;
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
  await render();
}

async function render() {
  renderNav();

  const main = document.getElementById('main');
  main.innerHTML = '';

  let el;
  try {
    switch (state.page) {
      case 'dashboard': el = await renderDashboard(); break;
      case 'entry':
      case 'edit':      el = renderEntry();            break;
      case 'history':   el = await renderHistory();    break;
      case 'session':   el = await renderSession();    break;
      default:          el = await renderDashboard();
    }
  } catch (e) {
    if (e.message === 'UNAUTHORIZED') {
      showPasswordGate();
      return;
    }
    el = errorPage(e.message);
  }

  main.appendChild(el);
}

function errorPage(msg) {
  const el = document.createElement('div');
  el.className = 'empty-state';
  el.innerHTML = `
    <div class="empty-icon">⚠️</div>
    <div class="empty-title">Something went wrong</div>
    <div class="empty-sub">${msg || 'Unknown error'}</div>
  `;
  return el;
}

function showPasswordGate() {
  document.getElementById('gate').hidden   = false;
  document.getElementById('app').hidden    = true;
  document.getElementById('gate-input').value = '';
  document.getElementById('gate-error').hidden = true;
}

function hidePasswordGate() {
  document.getElementById('gate').hidden = true;
  document.getElementById('app').hidden  = false;
}

function renderNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = '';

  const inner = document.createElement('div');
  inner.className = 'nav-inner';

  // Hamburger. Hidden on desktop by CSS - below 560px the links collapse into
  // a dropdown panel and this is what opens it.
  const menuBtn = document.createElement('button');
  menuBtn.className = 'nav-menu-btn';
  menuBtn.setAttribute('aria-label', 'Menu');
  menuBtn.setAttribute('aria-expanded', 'false');
  menuBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
  </svg>`;
  inner.appendChild(menuBtn);

  // Logo
  const logo = document.createElement('button');
  logo.className = 'nav-logo';
  logo.textContent = 'VolleyStats';
  logo.addEventListener('click', () => navigate('dashboard'));
  inner.appendChild(logo);

  // Page links
  const links = document.createElement('div');
  links.className = 'nav-links';

  [
    { page: 'dashboard', label: 'Dashboard' },
    { page: 'history',   label: 'History' },
    { page: 'entry',     label: 'Log Session' },
  ].forEach(({ page, label }) => {
    const btn = document.createElement('button');
    btn.className = 'nav-link' + (state.page === page ? ' active' : '');
    btn.textContent = label;
    // navigate() redraws the nav from scratch, so the panel closes itself.
    btn.addEventListener('click', () => navigate(page));
    links.appendChild(btn);
  });

  inner.appendChild(links);

  let menuOpen = false;

  function setMenu(open) {
    menuOpen = open;
    links.classList.toggle('nav-links-open', open);
    menuBtn.classList.toggle('active', open);
    menuBtn.setAttribute('aria-expanded', String(open));
  }

  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setMenu(!menuOpen);
    // Only listen while it's actually open, and once - otherwise every nav
    // redraw would stack another permanent listener on document.
    if (menuOpen) {
      document.addEventListener('click', () => setMenu(false), { once: true });
    }
  });

  // Right side: settings gear + user pill
  const actions = document.createElement('div');
  actions.className = 'nav-actions';

  const gearBtn = document.createElement('button');
  gearBtn.className = 'btn-icon';
  gearBtn.title = 'Settings';
  gearBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>`;
  gearBtn.addEventListener('click', openSettingsModal);
  actions.appendChild(gearBtn);

  // User pill + dropdown
  const userWrap = document.createElement('div');
  userWrap.style.position = 'relative';

  const pill = document.createElement('button');
  pill.className = 'user-pill';

  const ini = document.createElement('span');
  ini.className = 'user-initials';
  ini.textContent = state.currentUser ? initials(state.currentUser.name) : '?';

  const uname = document.createElement('span');
  uname.className = 'user-name';
  uname.textContent = state.currentUser?.name || 'No user';

  const caret = document.createElement('span');
  caret.className = 'user-caret';
  caret.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  pill.appendChild(ini);
  pill.appendChild(uname);
  pill.appendChild(caret);

  let dropOpen = false;
  let addingUser = false;

  pill.addEventListener('click', (e) => {
    e.stopPropagation();
    dropOpen = !dropOpen;
    renderDropdown();
  });

  function renderDropdown() {
    const existing = userWrap.querySelector('.user-dropdown');
    if (existing) existing.remove();
    if (!dropOpen) return;

    const drop = document.createElement('div');
    drop.className = 'user-dropdown';

    state.users.forEach(u => {
      const item = document.createElement('button');
      item.className = 'dropdown-item' + (u.id === state.currentUser?.id ? ' active' : '');
      item.textContent = u.name;
      if (u.id === state.currentUser?.id) {
        const check = document.createElement('span');
        check.style.cssText = 'margin-left:auto;font-size:0.7rem;opacity:0.7';
        check.textContent = '✓';
        item.appendChild(check);
      }
      item.addEventListener('click', async () => {
        state.currentUser = u;
        localStorage.setItem('vs_user', u.id);
        state.sessions = await api.getSessions(u.id).catch(() => []);
        dropOpen = false;
        navigate('dashboard');
      });
      drop.appendChild(item);
    });

    const divider = document.createElement('hr');
    divider.className = 'dropdown-divider';
    drop.appendChild(divider);

    if (addingUser) {
      const row = document.createElement('div');
      row.className = 'dropdown-add-row';

      const input = document.createElement('input');
      input.className = 'dropdown-add-input';
      input.placeholder = 'Name…';
      input.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });

      const addBtn = document.createElement('button');
      addBtn.className = 'btn-primary';
      addBtn.style.cssText = 'font-size:0.8rem;padding:6px 12px';
      addBtn.textContent = 'Add';
      addBtn.addEventListener('click', doAdd);

      async function doAdd() {
        const name = input.value.trim();
        if (!name) return;
        const user = await api.createUser(name).catch(() => null);
        if (!user) return;
        state.users = await api.getUsers().catch(() => state.users);
        state.currentUser = user;
        localStorage.setItem('vs_user', user.id);
        state.sessions = await api.getSessions(user.id).catch(() => []);
        dropOpen = false;
        addingUser = false;
        navigate('dashboard');
      }

      row.appendChild(input);
      row.appendChild(addBtn);
      drop.appendChild(row);
      setTimeout(() => input.focus(), 0);
    } else {
      const newUserBtn = document.createElement('button');
      newUserBtn.className = 'dropdown-item';
      newUserBtn.style.color = 'var(--accent)';
      newUserBtn.textContent = '+ New User';
      newUserBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        addingUser = true;
        renderDropdown();
      });
      drop.appendChild(newUserBtn);
    }

    userWrap.appendChild(drop);
  }

  // Close the dropdown on any outside click.
  document.addEventListener('click', function closeOnOutside() {
    if (dropOpen) { dropOpen = false; addingUser = false; renderDropdown(); }
    document.removeEventListener('click', closeOnOutside);
  });

  userWrap.appendChild(pill);
  actions.appendChild(userWrap);
  inner.appendChild(actions);
  nav.appendChild(inner);
}

function openSettingsModal() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.addEventListener('click', e => e.stopPropagation());

  function rebuild() {
    modal.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'modal-header';
    const title = document.createElement('span');
    title.className = 'modal-title';
    title.textContent = 'Settings';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => backdrop.remove());
    header.appendChild(title);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // ── Accent colour
    const colourSection = document.createElement('div');
    colourSection.className = 'settings-section';
    const colourTitle = document.createElement('div');
    colourTitle.className = 'settings-section-title';
    colourTitle.textContent = 'Accent Color';
    colourSection.appendChild(colourTitle);

    const swatches = document.createElement('div');
    swatches.className = 'color-swatches';

    ACCENT_PRESETS.forEach(hex => {
      const swatch = document.createElement('button');
      swatch.className = 'color-swatch' + (settings.accentColor === hex ? ' selected' : '');
      swatch.style.background = hex;
      swatch.title = hex;
      swatch.addEventListener('click', () => {
        saveSetting('accentColor', hex);
        rebuild();
        renderNav();
      });
      swatches.appendChild(swatch);
    });

    // Custom colour picker for anyone who wants something off the preset list.
    const customRow = document.createElement('div');
    customRow.className = 'color-custom-row';
    const customInput = document.createElement('input');
    customInput.type = 'color';
    customInput.className = 'color-custom-input';
    customInput.value = settings.accentColor;
    customInput.title = 'Custom colour';
    customInput.addEventListener('input', e => {
      saveSetting('accentColor', e.target.value);
      renderNav();
    });
    const customLabel = document.createElement('span');
    customLabel.style.cssText = 'font-size:0.75rem;color:var(--text-sec)';
    customLabel.textContent = 'Custom';
    customRow.appendChild(customInput);
    customRow.appendChild(customLabel);
    swatches.appendChild(customRow);
    colourSection.appendChild(swatches);
    modal.appendChild(colourSection);

  }

  rebuild();
  backdrop.appendChild(modal);
  backdrop.addEventListener('click', () => backdrop.remove());
  document.body.appendChild(backdrop);
}

async function renderDashboard() {
  const page = document.createElement('div');
  page.className = 'page';

  if (!state.currentUser) {
    page.appendChild(emptyStateEl('🏐', 'Welcome to VolleyStats', 'Add a user from the top-right to get started.'));
    return page;
  }

  // Refetch on every visit so edits + deletes elsewhere are reflected here.
  state.sessions = await api.getSessions(state.currentUser.id).catch(() => []);

  // Chart wants oldest-first; the recent list wants newest-first.
  const chronological = [...state.sessions].sort((a, b) => new Date(a.event_date) - new Date(b.event_date));

  const header = document.createElement('div');
  header.className = 'page-header';
  const heading = document.createElement('h1');
  heading.className = 'page-heading';
  heading.textContent = 'Dashboard';
  const userName = document.createElement('span');
  userName.style.cssText = 'font-size:0.875rem;color:var(--text-sec)';
  userName.textContent = state.currentUser.name;
  header.appendChild(heading);
  header.appendChild(userName);
  page.appendChild(header);

  // ── Summary cards
  page.appendChild(renderSummaryCards(state.sessions));

  // ── All four disciplines fold away behind accordions, attack included, so
  //    they read as one set rather than one special case plus three others.
  //    Each header carries its headline number, so the figure is there without
  //    opening anything, and the charts inside build lazily on first open.
  const attack   = aggregateAttack(state.sessions);
  const blocking = aggregateBlocking(state.sessions);
  const passing  = aggregatePassing(state.sessions);
  const digging  = aggregateDefence(state.sessions);

  [
    { key: 'attack',   label: 'Attack',   total: attack.att,   totals: attack,   metrics: attackMetrics,   chart: renderChartCard,             pie: 'Attack Breakdown' },
    { key: 'blocking', label: 'Blocking', total: blocking.total, totals: blocking, metrics: blockingMetrics, chart: renderBlockingChartCard,   pie: 'Blocking Breakdown' },
    { key: 'passing',  label: 'Passing',  total: passing.total,  totals: passing,  metrics: passingMetrics,  chart: renderPassingChartCard,    pie: 'Passing Breakdown' },
    { key: 'digging',  label: 'Digging',  total: digging.total,  totals: digging,  metrics: diggingMetrics,  chart: renderDefenceChartCard,    pie: 'Digging Breakdown' },
  ].forEach(({ key, label, total, totals, metrics, chart, pie }) => {
    if (!total) return;   // nothing logged for this discipline yet
    const m = metrics(totals);

    page.appendChild(renderAccordion({
      key,
      label,
      summary: m.headline,
      summaryColor: m.headlineColor,
      build: () => {
        const body = document.createElement('div');
        body.appendChild(renderMetricRows(m.rows));
        const comp = renderCompositionCard(pie, m.segments);
        if (comp) body.appendChild(comp);
        // Trend chart needs 2+ sessions with data; returns null below that.
        const c = chart(chronological);
        if (c) body.appendChild(c);
        return body;
      },
    }));
  });

  // ── Recent sessions
  if (state.sessions.length > 0) {
    page.appendChild(renderRecentList(state.sessions));
  }

  return page;
}

function renderSummaryCards(sessions) {
  const row = document.createElement('div');
  row.className = 'cards-row';

  // Aggregate every set across every session into one set of totals.
  const totals = sessions.reduce((acc, s) => {
    const t = sessionTotals(s);
    acc.k += t.k; acc.e += t.e; acc.c += t.c; acc.bk += t.bk;
    return acc;
  }, { k: 0, e: 0, c: 0, bk: 0 });
  const att = totals.k + totals.e + totals.c;
  const has = sessions.length > 0 && att > 0;
  const eff = has ? (totals.k + totals.bk - totals.e) / att : 0;

  const cards = [
    { label: 'Kill %',       value: has ? (totals.k / att * 100).toFixed(1) + '%' : '-', sub: 'all time', color: null, help: 'killPct' },
    { label: 'Error %',      value: has ? (totals.e / att * 100).toFixed(1) + '%' : '-', sub: 'all time', color: null, help: 'errorPct' },
    { label: 'Efficiency %', value: has ? (eff * 100).toFixed(1) + '%' : '-',           sub: 'all time', color: has ? effColor(eff) : null, help: 'efficiency' },
    { label: 'Attempts',     value: has ? att.toLocaleString() : '-',                   sub: `${sessions.length} session${sessions.length !== 1 ? 's' : ''}`, color: null, help: 'attempts' },
  ];

  cards.forEach(({ label, value, sub, color, help }) => {
    const card = document.createElement('div');
    card.className = 'card';

    const lbl = document.createElement('div');
    lbl.className = 'summary-card-label';
    lbl.textContent = label;
    if (help) lbl.appendChild(helpTip(help));

    const val = document.createElement('div');
    val.className = 'summary-card-value';
    val.textContent = value;
    if (color) val.style.color = color;

    const s = document.createElement('div');
    s.className = 'summary-card-sub';
    s.textContent = sub;

    card.appendChild(lbl);
    card.appendChild(val);
    card.appendChild(s);
    row.appendChild(card);
  });

  return row;
}

function renderChartCard(sessions) {
  const card = document.createElement('div');
  card.className = 'card';

  const chartData = sessions.map(s => {
    const { k, e, bk, att } = sessionTotals(s);
    // Compute cp/cm inline since sessionTotals only returns the combined c.
    let cp = 0, cm = 0;
    (s.sets || []).forEach(set => {
      cp += set.continued_plus  || set.continuedPlus  || 0;
      cm += set.continued_minus || set.continuedMinus || 0;
    });
    return {
      label:        s.event_name,
      date:         s.event_date,
      efficiency:   att ? (k + bk - e) / att : 0,
      killPct:      att ? k  / att : 0,
      errorPct:     att ? e  / att : 0,
      contPlusPct:  att ? cp / att : 0,
      contMinusPct: att ? cm / att : 0,
      attempts:     att,
    };
  });

  const chartHeader = document.createElement('div');
  chartHeader.className = 'chart-header';

  const chartTitle = document.createElement('div');
  chartTitle.className = 'chart-title';
  chartTitle.textContent = 'Attack Over Time';

  const controls = document.createElement('div');
  controls.className = 'chart-controls';

  let showEffLine = true, showKillLine = true, showErrLine = true;
  let showContPlusLine = true, showContMinusLine = true;

  function makeOverlayToggle(label, getState, setState) {
    const btn = document.createElement('button');
    btn.className = 'chart-toggle' + (getState() ? ' on-accent' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => {
      setState(!getState());
      btn.className = 'chart-toggle' + (getState() ? ' on-accent' : '');
      rebuildChart();
    });
    return btn;
  }

  const effBtn  = makeOverlayToggle('Efficiency',   () => showEffLine,       v => { showEffLine       = v; });
  const killBtn = makeOverlayToggle('Kill %',       () => showKillLine,      v => { showKillLine      = v; });
  const errBtn  = makeOverlayToggle('Error %',      () => showErrLine,       v => { showErrLine       = v; });
  const cpBtn   = makeOverlayToggle('Cont Plus %',  () => showContPlusLine,  v => { showContPlusLine  = v; });
  const cmBtn   = makeOverlayToggle('Cont Minus %', () => showContMinusLine, v => { showContMinusLine = v; });

  controls.appendChild(effBtn);
  controls.appendChild(killBtn);
  controls.appendChild(errBtn);
  controls.appendChild(cpBtn);
  controls.appendChild(cmBtn);
  chartHeader.appendChild(chartTitle);
  chartHeader.appendChild(controls);
  card.appendChild(chartHeader);

  if (!chartData.length) {
    const empty = document.createElement('div');
    empty.className = 'chart-empty';
    empty.innerHTML = `<div style="font-size:2rem;opacity:0.3">📈</div>
      <div>Log sessions to see your efficiency trend</div>`;
    const logBtn = document.createElement('button');
    logBtn.className = 'btn-accent-sm';
    logBtn.textContent = 'Log Session';
    logBtn.addEventListener('click', () => navigate('entry'));
    empty.appendChild(logBtn);
    card.appendChild(empty);
    return card;
  }

  const wrap = document.createElement('div');
  wrap.className = 'chart-wrap';
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  card.appendChild(wrap);

  let myChart = null;

  function rebuildChart() {
    if (myChart) {
      const idx = chartInstances.indexOf(myChart);
      if (idx !== -1) chartInstances.splice(idx, 1);
      myChart.destroy();
      myChart = null;
    }

    const labels    = chartData.map(d => fmtDate(d.date, { month: 'short', day: 'numeric' }));
    const effData   = chartData.map(d => +(d.efficiency    * 100).toFixed(1));
    const killData  = chartData.map(d => +(d.killPct       * 100).toFixed(1));
    const errData   = chartData.map(d => +(d.errorPct      * 100).toFixed(1));
    const cpData    = chartData.map(d => +(d.contPlusPct   * 100).toFixed(1));
    const cmData    = chartData.map(d => +(d.contMinusPct  * 100).toFixed(1));

    const pointColors = effData.map(v => effColor(v / 100));

    const datasets = [];

    if (showEffLine) {
      datasets.push({
        label: 'Efficiency %',
        data: effData,
        borderColor: settings.accentColor,
        backgroundColor: hexToRgba(settings.accentColor, 0.1),
        fill: true,
        tension: 0.3,
        borderWidth: 2,
        pointBackgroundColor: pointColors,
        pointBorderColor: pointColors,
        pointRadius: 5,
        pointHoverRadius: 7,
      });
    }

    if (showKillLine) {
      datasets.push({
        label: 'Kill %',
        data: killData,
        borderColor: '#60A5FA',
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.3,
        borderWidth: 2,
        borderDash: [5, 4],
        pointBackgroundColor: '#60A5FA',
        pointBorderColor: '#60A5FA',
        pointRadius: 4,
        pointHoverRadius: 6,
      });
    }

    if (showErrLine) {
      datasets.push({
        label: 'Error %',
        data: errData,
        borderColor: '#F87171',
        backgroundColor: 'transparent',
        fill: false, tension: 0.3, borderWidth: 2, borderDash: [5, 4],
        pointBackgroundColor: '#F87171', pointBorderColor: '#F87171',
        pointRadius: 4, pointHoverRadius: 6,
      });
    }

    if (showContPlusLine) {
      datasets.push({
        label: 'Cont Plus %',
        data: cpData,
        borderColor: '#6EE7B7',
        backgroundColor: 'transparent',
        fill: false, tension: 0.3, borderWidth: 2, borderDash: [5, 4],
        pointBackgroundColor: '#6EE7B7', pointBorderColor: '#6EE7B7',
        pointRadius: 4, pointHoverRadius: 6,
      });
    }

    if (showContMinusLine) {
      datasets.push({
        label: 'Cont Minus %',
        data: cmData,
        borderColor: '#FBBF24',
        backgroundColor: 'transparent',
        fill: false, tension: 0.3, borderWidth: 2, borderDash: [5, 4],
        pointBackgroundColor: '#FBBF24', pointBorderColor: '#FBBF24',
        pointRadius: 4, pointHoverRadius: 6,
      });
    }

    myChart = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            external: makeExternalTooltip(chartData, d => [
              ['Efficiency',   `${(d.efficiency  * 100).toFixed(1)}%`],
              ['Kill %',       `${(d.killPct      * 100).toFixed(1)}%`],
              ['Error %',      `${(d.errorPct     * 100).toFixed(1)}%`],
              ['Cont Plus %',  `${(d.contPlusPct  * 100).toFixed(1)}%`],
              ['Cont Minus %', `${(d.contMinusPct * 100).toFixed(1)}%`],
              ['Attempts',     d.attempts],
            ]),
          },
        },
        scales: {
          x: {
            grid: { color: '#2E3350' },
            ticks: { color: '#8B90A8', font: { size: 11 } },
            border: { color: '#2E3350' },
          },
          y: {
            min: 0, max: 100,
            grid: { color: '#2E3350' },
            ticks: { color: '#8B90A8', font: { size: 11 }, callback: v => v + '%' },
            border: { color: '#2E3350' },
          },
        },
      },
      plugins: [],
    });
    chartInstances.push(myChart);
  }

  deferChartBuild(rebuildChart);
  return card;
}

// Hex → rgba() for Chart.js background fills.
function hexToRgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// External tooltip renderer for all chart cards.
// getRows(d) receives the chartData entry and returns [[label, value], ...].
function makeExternalTooltip(chartData, getRows) {
  return function({ chart, tooltip }) {
    const wrap = chart.canvas.parentNode;
    let el = wrap.querySelector('.chart-tip');
    if (!el) {
      el = document.createElement('div');
      el.className = 'chart-tip';
      wrap.appendChild(el);
    }

    if (tooltip.opacity === 0) { el.style.opacity = '0'; return; }

    const d    = chartData[tooltip.dataPoints[0].dataIndex];
    const date = fmtDate(d.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const rows = getRows(d);

    el.innerHTML =
      `<div class="chart-tip-title">${d.label}</div>` +
      `<div class="chart-tip-date">${date}</div>` +
      `<table class="chart-tip-table">` +
      rows.map(([lbl, val]) =>
        `<tr><td class="chart-tip-lbl">${lbl}</td><td class="chart-tip-val">${val}</td></tr>`
      ).join('') +
      `</table>`;

    el.style.opacity = '1';

    // Flip left when caret is past 55% of chart width so it doesn't clip.
    const flipLeft  = tooltip.caretX > chart.width * 0.55;
    el.style.left   = flipLeft ? 'auto' : (tooltip.caretX + 14) + 'px';
    el.style.right  = flipLeft ? (chart.width - tooltip.caretX + 14) + 'px' : 'auto';
    el.style.top    = Math.max(0, tooltip.caretY - 20) + 'px';
  };
}

// Shared chart scaffold - card + header (with controls slot) + canvas.
// Charts can't be built the moment their card is created - the canvas isn't in
// the document yet, so Chart.js would size it against nothing. rAF is the right
// wait in the normal case (it fires after the page is attached and laid out),
// but it only fires while frames are being produced: not in a background tab,
// and not in a headless run once virtual time has moved on. Since accordions
// build their chart on open, that gap is reachable. Whichever timer arrives
// first wins, and the flag keeps it to one build.
function deferChartBuild(fn) {
  let done = false;
  const run = () => { if (done) return; done = true; fn(); };
  requestAnimationFrame(run);
  setTimeout(run, 50);
}

function makeChartShell(title) {
  const card = document.createElement('div');
  card.className = 'card';

  const header = document.createElement('div');
  header.className = 'chart-header';
  const titleEl = document.createElement('div');
  titleEl.className = 'chart-title';
  titleEl.textContent = title;
  const controls = document.createElement('div');
  controls.className = 'chart-controls';
  header.appendChild(titleEl);
  header.appendChild(controls);
  card.appendChild(header);

  const wrap = document.createElement('div');
  wrap.className = 'chart-wrap';
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  card.appendChild(wrap);

  return { card, canvas, controls };
}

function renderBlockingChartCard(sessions) {
  // Same ≥2 guard - needs blocking data from offence_blocking or full_game sessions.
  const eligible = sessions.filter(s => sessionBlockingTotals(s).total > 0);
  if (eligible.length < 2) return null;

  const chartData = eligible.map(s => {
    const { bk, bp, be, total } = sessionBlockingTotals(s);
    return {
      label:      s.event_name,
      date:       s.event_date,
      blkKillPct: total ? bk / total : 0,
      blkPlusPct: total ? bp / total : 0,
      blkErrPct:  total ? be / total : 0,
    };
  });

  const { card, canvas, controls } = makeChartShell('Blocking Over Time');

  // All three lines start visible; toggles let you hide individual ones.
  let showKill = true, showPlus = true, showErr = true;

  function makeToggle(label, getState, setState) {
    const btn = document.createElement('button');
    btn.className = 'chart-toggle' + (getState() ? ' on-accent' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => {
      setState(!getState());
      btn.className = 'chart-toggle' + (getState() ? ' on-accent' : '');
      rebuildChart();
    });
    return btn;
  }

  controls.appendChild(makeToggle('Block Kill %', () => showKill, v => { showKill = v; }));
  controls.appendChild(makeToggle('Block Plus %', () => showPlus, v => { showPlus = v; }));
  controls.appendChild(makeToggle('Block Error %', () => showErr,  v => { showErr  = v; }));

  // Each chart card keeps its own `myChart` reference in a closure so toggle
  // rebuilds only destroy this card's instance - not all charts on the page.
  let myChart = null;

  function rebuildChart() {
    if (myChart) {
      const idx = chartInstances.indexOf(myChart);
      if (idx !== -1) chartInstances.splice(idx, 1);
      myChart.destroy();
      myChart = null;
    }

    const labels = chartData.map(d => fmtDate(d.date, { month: 'short', day: 'numeric' }));
    const datasets = [];

    if (showKill) datasets.push({
      label: 'Block Kill %',
      data: chartData.map(d => +(d.blkKillPct * 100).toFixed(1)),
      borderColor: '#34D399', backgroundColor: 'rgba(52,211,153,0.08)',
      fill: true, tension: 0.3, borderWidth: 2,
      pointBackgroundColor: '#34D399', pointBorderColor: '#34D399',
      pointRadius: 4, pointHoverRadius: 6,
    });
    if (showPlus) datasets.push({
      label: 'Block Plus %',
      data: chartData.map(d => +(d.blkPlusPct * 100).toFixed(1)),
      borderColor: '#6EE7B7', backgroundColor: 'transparent',
      fill: false, tension: 0.3, borderWidth: 2, borderDash: [4, 3],
      pointBackgroundColor: '#6EE7B7', pointBorderColor: '#6EE7B7',
      pointRadius: 3, pointHoverRadius: 5,
    });
    if (showErr) datasets.push({
      label: 'Block Error %',
      data: chartData.map(d => +(d.blkErrPct * 100).toFixed(1)),
      borderColor: '#F87171', backgroundColor: 'transparent',
      fill: false, tension: 0.3, borderWidth: 2, borderDash: [4, 3],
      pointBackgroundColor: '#F87171', pointBorderColor: '#F87171',
      pointRadius: 3, pointHoverRadius: 5,
    });

    myChart = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            external: makeExternalTooltip(chartData, d => [
              ['Block Kill %',  `${(d.blkKillPct * 100).toFixed(1)}%`],
              ['Block Plus %',  `${(d.blkPlusPct * 100).toFixed(1)}%`],
              ['Block Error %', `${(d.blkErrPct  * 100).toFixed(1)}%`],
            ]),
          },
        },
        scales: {
          x: { grid: { color: '#2E3350' }, ticks: { color: '#8B90A8', font: { size: 11 } }, border: { color: '#2E3350' } },
          y: { min: 0, max: 100, grid: { color: '#2E3350' }, ticks: { color: '#8B90A8', font: { size: 11 }, callback: v => v + '%' }, border: { color: '#2E3350' } },
        },
      },
    });
    chartInstances.push(myChart);
  }

  deferChartBuild(rebuildChart);
  return card;
}

function renderDefenceChartCard(sessions) {
  // Need at least 2 sessions with dig data to draw a meaningful trend line -
  // a single point just floats at x=0 with no context.
  const eligible = sessions.filter(s => sessionDefenceTotals(s).total > 0);
  if (eligible.length < 2) return null;

  const chartData = eligible.map(s => {
    const { dp, d, de, total } = sessionDefenceTotals(s);
    return {
      label:      s.event_name,
      date:       s.event_date,
      digPlusPct: total ? dp / total : 0,
      digPct:     total ? d  / total : 0,
      digErrPct:  total ? de / total : 0,
    };
  });

  const { card, canvas, controls } = makeChartShell('Defence Over Time');

  let showDigPlus = true, showDig = true, showDigErr = true;

  function makeToggle(label, getState, setState) {
    const btn = document.createElement('button');
    btn.className = 'chart-toggle' + (getState() ? ' on-accent' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => {
      setState(!getState());
      btn.className = 'chart-toggle' + (getState() ? ' on-accent' : '');
      rebuildChart();
    });
    return btn;
  }

  controls.appendChild(makeToggle('Dig Plus %',  () => showDigPlus, v => { showDigPlus = v; }));
  controls.appendChild(makeToggle('Dig %',        () => showDig,     v => { showDig     = v; }));
  controls.appendChild(makeToggle('Dig Error %',  () => showDigErr,  v => { showDigErr  = v; }));

  // Each chart card keeps its own `myChart` reference in a closure so toggle
  // rebuilds only destroy this card's instance - not all charts on the page.
  let myChart = null;

  function rebuildChart() {
    if (myChart) {
      const idx = chartInstances.indexOf(myChart);
      if (idx !== -1) chartInstances.splice(idx, 1);
      myChart.destroy();
      myChart = null;
    }

    const labels   = chartData.map(d => fmtDate(d.date, { month: 'short', day: 'numeric' }));
    const datasets = [];

    if (showDigPlus) datasets.push({
      label: 'Dig Plus %',
      data: chartData.map(d => +(d.digPlusPct * 100).toFixed(1)),
      borderColor: '#34D399', backgroundColor: 'rgba(52,211,153,0.08)',
      fill: true, tension: 0.3, borderWidth: 2,
      pointBackgroundColor: '#34D399', pointBorderColor: '#34D399',
      pointRadius: 4, pointHoverRadius: 6,
    });
    if (showDig) datasets.push({
      label: 'Dig %',
      data: chartData.map(d => +(d.digPct * 100).toFixed(1)),
      borderColor: '#8B90A8', backgroundColor: 'transparent',
      fill: false, tension: 0.3, borderWidth: 2, borderDash: [4, 3],
      pointBackgroundColor: '#8B90A8', pointBorderColor: '#8B90A8',
      pointRadius: 3, pointHoverRadius: 5,
    });
    if (showDigErr) datasets.push({
      label: 'Dig Error %',
      data: chartData.map(d => +(d.digErrPct * 100).toFixed(1)),
      borderColor: '#F87171', backgroundColor: 'transparent',
      fill: false, tension: 0.3, borderWidth: 2, borderDash: [4, 3],
      pointBackgroundColor: '#F87171', pointBorderColor: '#F87171',
      pointRadius: 3, pointHoverRadius: 5,
    });

    myChart = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            external: makeExternalTooltip(chartData, d => [
              ['Dig Plus %',  `${(d.digPlusPct * 100).toFixed(1)}%`],
              ['Dig %',       `${(d.digPct     * 100).toFixed(1)}%`],
              ['Dig Error %', `${(d.digErrPct  * 100).toFixed(1)}%`],
            ]),
          },
        },
        scales: {
          x: { grid: { color: '#2E3350' }, ticks: { color: '#8B90A8', font: { size: 11 } }, border: { color: '#2E3350' } },
          y: { min: 0, max: 100, grid: { color: '#2E3350' }, ticks: { color: '#8B90A8', font: { size: 11 }, callback: v => v + '%' }, border: { color: '#2E3350' } },
        },
      },
    });
    chartInstances.push(myChart);
  }

  deferChartBuild(rebuildChart);
  return card;
}

function renderPassingChartCard(sessions) {
  // Same ≥2 guard as the defence chart - one data point isn't a trend.
  const eligible = sessions.filter(s => sessionPassingTotals(s).total > 0);
  if (eligible.length < 2) return null;

  const chartData = eligible.map(s => {
    const { p4, p3, p2, p1, p0, total } = sessionPassingTotals(s);
    return {
      label: s.event_name,
      date:  s.event_date,
      p4Pct: total ? p4 / total : 0,
      p3Pct: total ? p3 / total : 0,
      p2Pct: total ? p2 / total : 0,
      p1Pct: total ? p1 / total : 0,
      p0Pct: total ? p0 / total : 0,
    };
  });

  const { card, canvas, controls } = makeChartShell('Passing Over Time');

  // All five grade lines start visible; same toggle behaviour as Blocking/Defence.
  let show4 = true, show3 = true, show2 = true, show1 = true, show0 = true;

  const gradeLines = [
    { label: '4-Pass %', color: '#34D399', getState: () => show4, setState: v => { show4 = v; } },
    { label: '3-Pass %', color: '#6EE7B7', getState: () => show3, setState: v => { show3 = v; } },
    { label: '2-Pass %', color: '#8B90A8', getState: () => show2, setState: v => { show2 = v; } },
    { label: '1-Pass %', color: '#FBBF24', getState: () => show1, setState: v => { show1 = v; } },
    { label: '0-Pass %', color: '#F87171', getState: () => show0, setState: v => { show0 = v; } },
  ];

  gradeLines.forEach(({ label, getState, setState }) => {
    const btn = document.createElement('button');
    btn.className = 'chart-toggle on-accent';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      setState(!getState());
      btn.className = 'chart-toggle' + (getState() ? ' on-accent' : '');
      rebuildChart();
    });
    controls.appendChild(btn);
  });

  let myChart = null;

  function rebuildChart() {
    if (myChart) {
      const idx = chartInstances.indexOf(myChart);
      if (idx !== -1) chartInstances.splice(idx, 1);
      myChart.destroy();
      myChart = null;
    }

    const labels   = chartData.map(d => fmtDate(d.date, { month: 'short', day: 'numeric' }));
    const datasets = [];

    const gradeDatasets = [
      { show: show4, key: 'p4Pct', label: '4-Pass %', color: '#34D399', fill: true,  bg: 'rgba(52,211,153,0.08)' },
      { show: show3, key: 'p3Pct', label: '3-Pass %', color: '#6EE7B7', fill: false, bg: 'transparent' },
      { show: show2, key: 'p2Pct', label: '2-Pass %', color: '#8B90A8', fill: false, bg: 'transparent' },
      { show: show1, key: 'p1Pct', label: '1-Pass %', color: '#FBBF24', fill: false, bg: 'transparent' },
      { show: show0, key: 'p0Pct', label: '0-Pass %', color: '#F87171', fill: false, bg: 'transparent' },
    ];

    gradeDatasets.forEach(({ show, key, label, color, fill, bg }) => {
      if (!show) return;
      datasets.push({
        label,
        data: chartData.map(d => +(d[key] * 100).toFixed(1)),
        borderColor: color, backgroundColor: bg,
        fill, tension: 0.3, borderWidth: 2,
        pointBackgroundColor: color, pointBorderColor: color,
        pointRadius: 4, pointHoverRadius: 6,
      });
    });

    myChart = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            external: makeExternalTooltip(chartData, d => [
              ['4-Pass %', `${(d.p4Pct * 100).toFixed(1)}%`],
              ['3-Pass %', `${(d.p3Pct * 100).toFixed(1)}%`],
              ['2-Pass %', `${(d.p2Pct * 100).toFixed(1)}%`],
              ['1-Pass %', `${(d.p1Pct * 100).toFixed(1)}%`],
              ['0-Pass %', `${(d.p0Pct * 100).toFixed(1)}%`],
            ]),
          },
        },
        scales: {
          x: { grid: { color: '#2E3350' }, ticks: { color: '#8B90A8', font: { size: 11 } }, border: { color: '#2E3350' } },
          y: { min: 0, max: 100, grid: { color: '#2E3350' }, ticks: { color: '#8B90A8', font: { size: 11 }, callback: v => v + '%' }, border: { color: '#2E3350' } },
        },
      },
    });
    chartInstances.push(myChart);
  }

  deferChartBuild(rebuildChart);
  return card;
}

function renderRecentList(sessions) {
  const wrap = document.createElement('div');
  wrap.className = 'card';
  wrap.style.padding = '0';
  wrap.style.overflow = 'hidden';

  const header = document.createElement('div');
  header.className = 'recent-header';

  const title = document.createElement('span');
  title.className = 'recent-title';
  title.textContent = 'Recent Sessions';

  const viewAll = document.createElement('button');
  viewAll.className = 'btn-ghost-link';
  viewAll.textContent = 'View all →';
  viewAll.addEventListener('click', () => navigate('history'));

  header.appendChild(title);
  header.appendChild(viewAll);
  wrap.appendChild(header);

  // Five most recent.
  [...sessions]
    .sort((a, b) => new Date(b.event_date) - new Date(a.event_date))
    .slice(0, 5)
    .forEach(s => {
      const { k, e, bk, att } = sessionTotals(s);
      const eff = att ? (k + bk - e) / att : null;

      const row = document.createElement('div');
      row.className = 'recent-row';
      row.addEventListener('click', () => navigate('session', { sessionId: s.id }));

      const left = document.createElement('div');
      const eventName = document.createElement('div');
      eventName.className = 'recent-event';
      eventName.textContent = s.event_name;
      const date = document.createElement('div');
      date.className = 'recent-date';
      date.textContent = fmtDate(s.event_date, { month: 'short', day: 'numeric', year: 'numeric' });
      left.appendChild(eventName);
      left.appendChild(date);

      const right = document.createElement('div');
      right.className = 'recent-right';

      const badge = document.createElement('span');
      badge.className = `mode-badge mode-${s.mode}`;
      badge.textContent = MODE_LABELS[s.mode] || s.mode;

      const effEl = document.createElement('div');
      effEl.className = 'recent-eff';
      effEl.style.color = eff !== null ? effColor(eff) : 'var(--text-dis)';
      effEl.textContent = eff !== null ? (eff * 100).toFixed(1) + '%' : '-';

      right.appendChild(badge);
      right.appendChild(effEl);
      row.appendChild(left);
      row.appendChild(right);
      wrap.appendChild(row);
    });

  return wrap;
}

// The entry form is the one page that doesn't get a full redraw on every
// state change - that would steal focus out of the text inputs while you're
// mid-type. Instead, the text fields are rendered once, and Film Review taps
// / +- buttons swap out just the stats card and live preview underneath them.
function renderEntry() {
  const es = state.entryState;
  const isEdit = state.page === 'edit';

  const page = document.createElement('div');
  page.className = 'page-narrow';

  // Session info - name, date, notes
  const infoCard = document.createElement('div');
  infoCard.className = 'card-sm';

  const infoLabel = document.createElement('div');
  infoLabel.className = 'section-label';
  infoLabel.textContent = 'Session Info';
  infoCard.appendChild(infoLabel);

  const stack = document.createElement('div');
  stack.className = 'field-stack';

  const nameWrap = document.createElement('div');
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'input' + (es.errors.eventName ? ' input-error' : '');
  nameInput.placeholder = 'e.g. Tuesday League vs. Rebels';
  nameInput.value = es.eventName;
  nameInput.addEventListener('input', e => {
    es.eventName = e.target.value;
    if (es.errors.eventName) { es.errors.eventName = null; nameInput.className = 'input'; }
  });
  nameWrap.appendChild(nameInput);
  if (es.errors.eventName) {
    const msg = document.createElement('div');
    msg.className = 'error-msg';
    msg.textContent = es.errors.eventName;
    nameWrap.appendChild(msg);
  }

  const dateWrap = document.createElement('div');
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.className = 'input' + (es.errors.eventDate ? ' input-error' : '');
  dateInput.value = es.eventDate;
  dateInput.addEventListener('input', e => {
    es.eventDate = e.target.value;
    if (es.errors.eventDate) { es.errors.eventDate = null; dateInput.className = 'input'; }
  });
  dateWrap.appendChild(dateInput);

  const notesInput = document.createElement('textarea');
  notesInput.className = 'input';
  notesInput.placeholder = 'Optional notes, context, conditions…';
  notesInput.rows = 3;
  notesInput.style.resize = 'vertical';
  notesInput.value = es.notes;
  notesInput.addEventListener('input', e => { es.notes = e.target.value; });

  stack.appendChild(nameWrap);
  stack.appendChild(dateWrap);
  stack.appendChild(notesInput);
  infoCard.appendChild(stack);
  page.appendChild(infoCard);

  // Stat mode pills (Offence / Offence+Blocking / Full Game)
  const modeCard = document.createElement('div');
  modeCard.className = 'card-sm';
  const modeLabel = document.createElement('div');
  modeLabel.className = 'section-label';
  modeLabel.textContent = 'Stat Mode';
  modeCard.appendChild(modeLabel);

  const modeRow = document.createElement('div');
  modeRow.className = 'mode-row';
  MODES.forEach(m => {
    const btn = document.createElement('button');
    btn.className = 'mode-pill' + (es.mode === m.id ? ' active' : '');
    btn.textContent = m.label;
    btn.addEventListener('click', () => {
      es.mode = m.id;
      // Re-render the full entry page so the stat grid updates.
      const newPage = renderEntry();
      page.replaceWith(newPage);
    });
    modeRow.appendChild(btn);
  });
  modeCard.appendChild(modeRow);
  page.appendChild(modeCard);

  // Tabs + the stat grid / Film Review buttons
  const statsCard = document.createElement('div');
  statsCard.className = 'card-sm';
  statsCard.id = 'stats-card';

  renderTabBar(statsCard, page, es);
  renderStatsAndFilm(statsCard, es);

  page.appendChild(statsCard);

  // Live-updating preview bar (Kill% / Err% / Eff% / Att)
  page.appendChild(renderLivePreview(es));

  const submitBtn = document.createElement('button');
  submitBtn.className = 'submit-btn';
  const isDisabled = !es.eventName.trim() || !es.eventDate;
  submitBtn.disabled = isDisabled;
  submitBtn.textContent = isEdit ? 'Update Session' : 'Save Session';
  submitBtn.addEventListener('click', async () => {
    // Pull the text-field values fresh - they're uncontrolled inputs so the
    // DOM is the source of truth, not es.
    es.eventName = nameInput.value.trim();
    es.eventDate = dateInput.value;
    es.notes     = notesInput.value;

    if (!es.eventName) { es.errors.eventName = 'Event name is required'; const n = renderEntry(); page.replaceWith(n); return; }
    if (!es.eventDate) { es.errors.eventDate = 'Date is required'; const n = renderEntry(); page.replaceWith(n); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';

    const payload = {
      userId:    state.currentUser.id,
      eventName: es.eventName,
      eventDate: es.eventDate,
      notes:     es.notes,
      mode:      es.mode,
      sets:      es.sets,
    };

    try {
      let saved;
      if (isEdit) {
        saved = await api.updateSession(state.sessionId, payload);
      } else {
        saved = await api.createSession(payload);
      }
      state.sessions = await api.getSessions(state.currentUser.id).catch(() => state.sessions);
      navigate('session', { sessionId: saved.id });
    } catch (err) {
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? 'Update Session' : 'Save Session';
      alert('Save failed: ' + err.message);
    }
  });

  // Keep the submit button enabled/disabled in step with the required fields.
  nameInput.addEventListener('input', () => {
    submitBtn.disabled = !nameInput.value.trim() || !dateInput.value;
  });
  dateInput.addEventListener('input', () => {
    submitBtn.disabled = !nameInput.value.trim() || !dateInput.value;
  });

  page.appendChild(submitBtn);
  return page;
}

// Swap out just the stats card + preview without touching the text inputs
// above. Used by Film Review taps and +/− steppers so nothing steals focus.
function updateEntryStats(page, es) {
  const statsCard = page.querySelector('#stats-card');
  if (!statsCard) return;
  statsCard.innerHTML = '';
  renderTabBar(statsCard, page, es);
  renderStatsAndFilm(statsCard, es);

  const preview = page.querySelector('#live-preview');
  if (preview) preview.replaceWith(renderLivePreview(es));
}

function renderTabBar(container, page, es) {
  const row = document.createElement('div');
  row.className = 'tab-bar-row';

  const tabs = document.createElement('div');
  tabs.className = 'tab-bar';

  // The Game Total tab is read-only - it shows aggregate totals across all sets.
  const totalTab = document.createElement('button');
  totalTab.className = 'tab' + (es.activeTab === 0 ? ' active' : '');
  totalTab.textContent = 'Game Total';
  totalTab.addEventListener('click', () => { es.activeTab = 0; updateEntryStats(page, es); });
  tabs.appendChild(totalTab);

  es.sets.forEach((_, i) => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;display:flex;align-items:center';

    const setTab = document.createElement('button');
    setTab.className = 'tab' + (es.activeTab === i + 1 ? ' active' : '');
    setTab.style.paddingRight = es.sets.length > 1 ? '24px' : '';
    setTab.textContent = `Set ${i + 1}`;
    setTab.addEventListener('click', () => { es.activeTab = i + 1; updateEntryStats(page, es); });
    wrap.appendChild(setTab);

    if (es.sets.length > 1) {
      const rem = document.createElement('button');
      rem.className = 'tab-remove';
      rem.textContent = '×';
      rem.title = 'Remove set';
      rem.addEventListener('click', (e) => {
        e.stopPropagation();
        es.sets.splice(i, 1);
        if (es.activeTab > es.sets.length) es.activeTab = es.sets.length;
        updateEntryStats(page, es);
      });
      wrap.appendChild(rem);
    }

    tabs.appendChild(wrap);
  });

  const addSet = document.createElement('button');
  addSet.className = 'btn-add-set';
  addSet.textContent = '+ Set';
  addSet.addEventListener('click', () => {
    es.sets.push(emptySet());
    es.activeTab = es.sets.length;
    updateEntryStats(page, es);
  });
  tabs.appendChild(addSet);

  row.appendChild(tabs);

  // ── Entry mode toggle (Film Review / Manual)
  const toggle = document.createElement('div');
  toggle.className = 'entry-toggle';

  [
    { id: 'film',   label: '🎬 Film Review' },
    { id: 'manual', label: '✎ Manual' },
  ].forEach(({ id, label }) => {
    const btn = document.createElement('button');
    btn.className = 'entry-toggle-btn' + (es.entryMode === id ? ' active' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => {
      es.entryMode = id;
      saveSetting('entryMode', id);
      updateEntryStats(page, es);
    });
    toggle.appendChild(btn);
  });

  row.appendChild(toggle);
  container.appendChild(row);

  // Standard / Detail toggle - applies to both entry modes. In Film Review it
  // controls which tap buttons exist; in Manual it controls which number
  // inputs the grid renders.
  const detailRow = document.createElement('div');
  detailRow.className = 'detail-toggle-row';

  const detailLabel = document.createElement('span');
  detailLabel.className = 'detail-toggle-label';
  detailLabel.textContent = 'Stat depth';

  const detailControl = document.createElement('div');
  detailControl.className = 'segment-control';

  [
    { id: false, label: 'Standard' },
    { id: true,  label: 'Detail'   },
  ].forEach(({ id, label }) => {
    const btn = document.createElement('button');
    btn.className = 'segment-btn' + (es.detailMode === id ? ' active' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => {
      es.detailMode = id;
      saveSetting('detailMode', id);
      updateEntryStats(page, es);
    });
    detailControl.appendChild(btn);
  });

  detailRow.appendChild(detailLabel);
  detailRow.appendChild(detailControl);
  container.appendChild(detailRow);
}

function renderStatsAndFilm(container, es) {
  if (es.entryMode === 'film') {
    renderFilmReview(container, es);
  } else {
    renderManualStats(container, es);
  }
}

function renderManualStats(container, es) {
  const activeSetIdx = es.activeTab === 0 ? null : es.activeTab - 1;
  const displayStats = es.activeTab === 0 ? sumSets(es.sets) : es.sets[activeSetIdx];
  const isReadOnly = es.activeTab === 0;

  if (isReadOnly) {
    const note = document.createElement('div');
    note.className = 'game-total-note';
    note.textContent = `Totals across all ${es.sets.length} set${es.sets.length > 1 ? 's' : ''}. Select a set tab to edit.`;
    container.appendChild(note);
  }

  getStatGroups(es.mode, es.detailMode).forEach(({ stats }, gi) => {
    if (gi > 0) {
      const sep = document.createElement('hr');
      sep.className = 'stat-section-sep';
      container.appendChild(sep);
    }

    const grid = document.createElement('div');
    grid.className = 'stat-grid';

    stats.forEach(def => {
      const { label } = def;

      if (isReadOnly) {
        const card = document.createElement('div');
        card.className = 'stat-card-readonly';
        card.innerHTML = `<div class="stat-label">${label}</div><div class="stat-divider"></div><div class="stat-value-display">${readStat(displayStats, def)}</div>`;
        grid.appendChild(card);
      } else {
        const set = es.sets[activeSetIdx];
        const val = readStat(set, def);
        const card = document.createElement('div');
        card.className = 'stat-card';

        const lbl = document.createElement('div');
        lbl.className = 'stat-label';
        lbl.textContent = label;

        const div = document.createElement('div');
        div.className = 'stat-divider';

        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.className = 'stat-input';
        input.value = val;

        // Every write goes through writeStat, then refreshes the preview only -
        // redrawing the whole grid would yank the input out from under whoever
        // is mid-type.
        const commit = (n, syncInput) => {
          writeStat(set, def, n);
          if (syncInput) input.value = readStat(set, def);
          const preview = document.querySelector('#live-preview');
          if (preview) preview.replaceWith(renderLivePreview(es));
        };

        input.addEventListener('input', e => commit(parseInt(e.target.value) || 0, false));

        const btns = document.createElement('div');
        btns.className = 'stat-btns';

        const minusBtn = document.createElement('button');
        minusBtn.className = 'step-btn';
        minusBtn.textContent = '−';
        minusBtn.addEventListener('click', () => commit(readStat(set, def) - 1, true));

        const plusBtn = document.createElement('button');
        plusBtn.className = 'step-btn';
        plusBtn.textContent = '+';
        plusBtn.addEventListener('click', () => commit(readStat(set, def) + 1, true));

        btns.appendChild(minusBtn);
        btns.appendChild(plusBtn);
        card.appendChild(lbl);
        card.appendChild(div);
        card.appendChild(input);
        card.appendChild(btns);
        grid.appendChild(card);
      }
    });

    container.appendChild(grid);
  });

  // Standard hides a few fields outright. If the active set already has values
  // in them - typed in Detail, or carried in from an edited session - say so,
  // because they still count and they'll reappear in the session table after
  // saving. Nothing is cleared; this is just so it isn't a surprise.
  if (!es.detailMode && !isReadOnly) {
    const stranded = DETAIL_ONLY_STATS
      .filter(({ key, modes }) => modes.includes(es.mode) && (displayStats[key] || 0) > 0)
      .map(({ key, label }) => `${label} ${displayStats[key]}`);

    if (stranded.length) {
      const note = document.createElement('div');
      note.className = 'game-total-note';
      note.textContent = `ⓘ Set ${es.activeTab} also has ${stranded.join(', ')} — switch to Detail to edit these.`;
      container.appendChild(note);
    }
  }
}

function renderFilmReview(container, es) {
  // Game Total tab is read-only, so if it's the active tab default the taps
  // into Set 1 rather than throwing.
  const setIdx = es.activeTab === 0 ? 0 : es.activeTab - 1;

  if (es.sets.length > 1 && es.activeTab === 0) {
    const note = document.createElement('div');
    note.className = 'live-set-note';
    note.innerHTML = `Logging to <strong>Set 1</strong>. Switch to a set tab to log a different set.`;
    container.appendChild(note);
  }

  const currentSet = es.sets[setIdx];

  renderFilmLarge(container, es, setIdx, currentSet);

  // Undo button + a small "Last: X" label
  const controls = document.createElement('div');
  controls.className = 'film-controls';

  const undoBtn = document.createElement('button');
  undoBtn.className = 'film-undo-btn';
  undoBtn.textContent = '↩ Undo';
  undoBtn.disabled = es.tapHistory.length === 0;
  undoBtn.addEventListener('click', () => {
    if (!es.tapHistory.length) return;
    const last = es.tapHistory.pop();
    es.sets[last.setIdx][last.key] = Math.max(0, (es.sets[last.setIdx][last.key] || 0) - 1);
    // Redraw the stats card only - the text inputs above stay put.
    const statsCard = container.closest('#stats-card') || document.getElementById('stats-card');
    if (statsCard) {
      statsCard.innerHTML = '';
      const page = statsCard.closest('.page-narrow');
      renderTabBar(statsCard, page, es);
      renderStatsAndFilm(statsCard, es);
    }
    const preview = document.querySelector('#live-preview');
    if (preview) preview.replaceWith(renderLivePreview(es));
  });

  const historyLabel = document.createElement('span');
  historyLabel.style.cssText = 'font-size:0.75rem;color:var(--text-dis)';
  historyLabel.textContent = es.tapHistory.length > 0
    ? `Last: ${es.tapHistory[es.tapHistory.length - 1].label}`
    : '';

  controls.appendChild(undoBtn);
  controls.appendChild(historyLabel);
  container.appendChild(controls);
}

function formatTapLabel(key) {
  const labels = {
    kills: 'Kill', errors: 'Error',
    continuedPlus: 'Continue Plus', continuedMinus: 'Continue Minus',
    blockKills: 'Block', blockPlus: 'Block Plus', blockMinus: 'Block Minus', blockErrors: 'Block Error',
    digPlus: 'Dig Plus', digs: 'Dig', digErrors: 'Dig Error',
    pass4: '4-Pass', pass3: '3-Pass', pass2: '2-Pass', pass1: '1-Pass', pass0: 'Pass 0',
  };
  return labels[key] || key;
}

function tapStat(page, es, setIdx, key, label, animKey) {
  es.sets[setIdx][key] = (es.sets[setIdx][key] || 0) + 1;
  es.tapHistory.push({ setIdx, key, label: label || formatTapLabel(key) });

  const statsCard = document.getElementById('stats-card');
  if (statsCard) {
    statsCard.innerHTML = '';
    renderTabBar(statsCard, page, es);
    renderStatsAndFilm(statsCard, es);

    // Animate the button that was just tapped.
    const displayKey = animKey || key;
    const btn = statsCard.querySelector(`[data-stat-key="${displayKey}"]`);
    if (btn) btn.classList.add('tapped');
  }
  const preview = document.querySelector('#live-preview');
  if (preview) preview.replaceWith(renderLivePreview(es));
}

// 5-tier colour scale for Film Review tap-button counts. The tiers map to
// outcome quality: full green = point scored (kill, stuff block, dig plus,
// perfect pass), light green = play continues in our favour, grey = neutral
// play (regular dig, mid-grade pass, the combined _continue button in standard
// mode), yellow = continues in opponent's favour, red = point lost.
function statColor(key) {
  switch (key) {
    case 'kills': case 'blockKills': case 'digPlus': case 'pass4':
      return 'var(--success)';
    case 'continuedPlus': case 'blockPlus': case 'pass3':
      return 'var(--success-muted)';
    case 'digs': case 'pass2': case '_continue':
      return 'var(--text-sec)';
    case 'continuedMinus': case 'blockMinus': case 'pass1':
      return 'var(--warning)';
    case 'errors': case 'blockErrors': case 'digErrors': case 'pass0':
      return 'var(--danger)';
    default:
      return 'var(--text-sec)';
  }
}

function renderFilmLarge(container, es, setIdx, currentSet) {
  const page = container.closest('.page-narrow');

  getStatGroups(es.mode, es.detailMode).forEach(({ label: sectionLabel, stats }) => {
    const section = document.createElement('div');
    section.className = 'film-large-section';

    const heading = document.createElement('div');
    heading.className = 'film-large-section-label';
    heading.textContent = sectionLabel;
    section.appendChild(heading);

    const row = document.createElement('div');
    row.className = 'film-large-row';

    stats.forEach(def => {
      const { key, label, tapKey } = def;
      const actualKey    = tapKey || key;
      const displayCount = readStat(currentSet, def);

      const btn = document.createElement('button');
      btn.className = 'film-tap-btn';
      btn.dataset.statKey = key;

      const count = document.createElement('div');
      count.className = 'film-tap-count';
      count.textContent = displayCount;
      count.style.color = statColor(key);

      const lbl = document.createElement('div');
      lbl.textContent = label;

      btn.appendChild(count);
      btn.appendChild(lbl);
      btn.addEventListener('click', () => tapStat(page, es, setIdx, actualKey, label, key));
      row.appendChild(btn);
    });

    section.appendChild(row);
    container.appendChild(section);
  });
}


function renderLivePreview(es) {
  const totals = sumSets(es.sets);
  const { killPct, errorPct, efficiency, attempts } = calcStats(
    totals.kills, totals.errors,
    (totals.continuedPlus || 0) + (totals.continuedMinus || 0),
    totals.blockKills
  );
  const has = attempts > 0;

  const card = document.createElement('div');
  card.className = 'preview-card';
  card.id = 'live-preview';

  [
    { label: 'Kill %',      value: has ? (killPct * 100).toFixed(1) + '%' : '-',    color: null },
    { label: 'Error %',     value: has ? (errorPct * 100).toFixed(1) + '%' : '-',   color: null },
    { label: 'Efficiency',  value: has ? (efficiency * 100).toFixed(1) + '%' : '-', color: has ? effColor(efficiency) : null },
    { label: 'Attempts',    value: has ? attempts.toString() : '-',                 color: null },
  ].forEach(({ label, value, color }, i, arr) => {
    const metric = document.createElement('div');
    metric.className = 'preview-metric';

    const lbl = document.createElement('div');
    lbl.className = 'preview-label';
    lbl.textContent = label;

    const val = document.createElement('div');
    val.className = 'preview-value';
    val.textContent = value;
    if (color) val.style.color = color;

    metric.appendChild(lbl);
    metric.appendChild(val);
    card.appendChild(metric);

    if (i < arr.length - 1) {
      const divider = document.createElement('div');
      divider.className = 'preview-divider';
      card.appendChild(divider);
    }
  });

  return card;
}

async function renderSession() {
  const session = await api.getSession(state.sessionId);

  const page = document.createElement('div');
  page.className = 'page';

  // ── Header card
  const headerCard = document.createElement('div');
  headerCard.className = 'card';

  const headerTop = document.createElement('div');
  headerTop.className = 'session-header-top';

  const left = document.createElement('div');

  const eventName = document.createElement('div');
  eventName.className = 'session-event-name';
  eventName.textContent = session.event_name;

  const meta = document.createElement('div');
  meta.className = 'session-meta';

  const dateEl = document.createElement('span');
  dateEl.className = 'session-date';
  dateEl.textContent = fmtDate(session.event_date, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const badge = document.createElement('span');
  badge.className = `mode-badge mode-${session.mode}`;
  badge.textContent = MODE_LABELS[session.mode] || session.mode;

  meta.appendChild(dateEl);
  meta.appendChild(badge);

  left.appendChild(eventName);
  left.appendChild(meta);

  // Notes section flips between read-only display and an inline textarea editor.
  let editingNotes = false;
  let noteDraft = session.notes || '';

  const notesEl = document.createElement('div');

  function renderNotes() {
    notesEl.innerHTML = '';
    if (!editingNotes) {
      if (session.notes) {
        const n = document.createElement('div');
        n.className = 'session-notes';
        n.textContent = session.notes;
        notesEl.appendChild(n);
      }
    } else {
      const ta = document.createElement('textarea');
      ta.className = 'input';
      ta.rows = 3;
      ta.style.cssText = 'resize:vertical;margin-top:12px';
      ta.value = noteDraft;
      ta.addEventListener('input', e => { noteDraft = e.target.value; });

      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display:flex;gap:8px;margin-top:8px';

      const saveBtn = document.createElement('button');
      saveBtn.className = 'btn-primary';
      saveBtn.style.cssText = 'font-size:0.8rem;padding:7px 14px';
      saveBtn.textContent = 'Save';
      saveBtn.addEventListener('click', async () => {
        await api.updateSession(session.id, { notes: noteDraft });
        session.notes = noteDraft;
        editingNotes = false;
        renderNotes();
        updateActionsPanel();
      });

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn-ghost';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', () => { editingNotes = false; renderNotes(); updateActionsPanel(); });

      btnRow.appendChild(saveBtn);
      btnRow.appendChild(cancelBtn);
      notesEl.appendChild(ta);
      notesEl.appendChild(btnRow);
      setTimeout(() => ta.focus(), 0);
    }
  }

  renderNotes();
  left.appendChild(notesEl);

  // Buttons on the right: Edit Notes, Edit Session, Delete (with a two-step confirm)
  const actions = document.createElement('div');
  actions.className = 'session-actions';

  let confirmDelete = false;

  function updateActionsPanel() {
    actions.innerHTML = '';
    if (!editingNotes) {
      const editNotesBtn = document.createElement('button');
      editNotesBtn.className = 'btn-ghost';
      editNotesBtn.textContent = 'Edit Notes';
      editNotesBtn.addEventListener('click', () => { editingNotes = true; renderNotes(); updateActionsPanel(); });
      actions.appendChild(editNotesBtn);
    }

    const editSessionBtn = document.createElement('button');
    editSessionBtn.className = 'btn-ghost';
    editSessionBtn.textContent = 'Edit Session';
    editSessionBtn.addEventListener('click', () => navigate('edit', { sessionId: session.id }));
    actions.appendChild(editSessionBtn);

    if (!confirmDelete) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn-danger';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => { confirmDelete = true; updateActionsPanel(); });
      actions.appendChild(deleteBtn);
    } else {
      const confirmLabel = document.createElement('span');
      confirmLabel.style.cssText = 'font-size:0.8rem;color:var(--danger);align-self:center';
      confirmLabel.textContent = 'Sure?';

      const yesBtn = document.createElement('button');
      yesBtn.className = 'btn-danger-solid';
      yesBtn.textContent = 'Yes, delete';
      yesBtn.addEventListener('click', async () => {
        await api.deleteSession(session.id);
        state.sessions = await api.getSessions(state.currentUser.id).catch(() => state.sessions);
        navigate('history');
      });

      const noBtn = document.createElement('button');
      noBtn.className = 'btn-ghost';
      noBtn.textContent = 'Cancel';
      noBtn.addEventListener('click', () => { confirmDelete = false; updateActionsPanel(); });

      actions.appendChild(confirmLabel);
      actions.appendChild(yesBtn);
      actions.appendChild(noBtn);
    }
  }

  updateActionsPanel();
  headerTop.appendChild(left);
  headerTop.appendChild(actions);
  headerCard.appendChild(headerTop);
  page.appendChild(headerCard);

  // ── Stats table
  page.appendChild(renderSetTable(session));

  // ── Blocking / passing / digging for this session, same accordions as the
  //    dashboard but scoped to one session and without the trend charts (a
  //    single session has nothing to trend against).
  const sAttack = sessionAttackTotals(session);
  [
    { key: 'sess-attack',   label: 'Attack',   total: sAttack.att, totals: sAttack, metrics: attackMetrics,   pie: 'Attack Breakdown' },
    { key: 'sess-blocking', label: 'Blocking', total: sessionBlockingTotals(session).total, totals: sessionBlockingTotals(session), metrics: blockingMetrics, pie: 'Blocking Breakdown' },
    { key: 'sess-passing',  label: 'Passing',  total: sessionPassingTotals(session).total,  totals: sessionPassingTotals(session),  metrics: passingMetrics,  pie: 'Passing Breakdown' },
    { key: 'sess-digging',  label: 'Digging',  total: sessionDefenceTotals(session).total,  totals: sessionDefenceTotals(session),  metrics: diggingMetrics,  pie: 'Digging Breakdown' },
  ].forEach(({ key, label, total, totals, metrics, pie }) => {
    if (!total) return;
    const m = metrics(totals);
    page.appendChild(renderAccordion({
      key,
      label,
      summary: m.headline,
      summaryColor: m.headlineColor,
      build: () => {
        const body = document.createElement('div');
        body.appendChild(renderMetricRows(m.rows));
        const comp = renderCompositionCard(pie, m.segments);
        if (comp) body.appendChild(comp);
        return body;
      },
    }));
  });

  // ── Back link
  const back = document.createElement('button');
  back.className = 'btn-ghost';
  back.style.alignSelf = 'flex-start';
  back.textContent = '← Back to History';
  back.addEventListener('click', () => navigate('history'));
  page.appendChild(back);

  return page;
}

function renderSetTable(session) {
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';

  const scroll = document.createElement('div');
  scroll.className = 'table-scroll';

  const table = document.createElement('table');
  table.className = 'stats-table';

  const mode = session.mode;
  const hasBlocking = mode === 'offence_blocking' || mode === 'full_game';
  const hasDefence  = mode === 'full_game';

  // Two-row header: top row is the column-group label, bottom row is the stats.
  const thead = document.createElement('thead');

  const tr1 = document.createElement('tr');
  const setTh = document.createElement('th');
  setTh.className = 'th-set';
  setTh.rowSpan = 2;
  setTh.textContent = 'Set';
  tr1.appendChild(setTh);

  const hittingTh = document.createElement('th');
  hittingTh.colSpan = 8;
  hittingTh.textContent = 'Hitting';
  tr1.appendChild(hittingTh);

  if (hasBlocking) {
    const blkTh = document.createElement('th');
    blkTh.colSpan = 4;
    blkTh.className = 'th-group-sep';
    blkTh.textContent = 'Blocking';
    tr1.appendChild(blkTh);
  }

  if (hasDefence) {
    const defTh = document.createElement('th');
    defTh.colSpan = 4;
    defTh.className = 'th-group-sep';
    defTh.textContent = 'Defence';
    tr1.appendChild(defTh);
  }

  thead.appendChild(tr1);

  const tr2 = document.createElement('tr');
  ['K', 'Err', 'C+', 'C−', 'Att', 'Kill%', 'Err%', 'Eff%'].forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    tr2.appendChild(th);
  });

  if (hasBlocking) {
    ['Blk', 'B+', 'B−', 'BE'].forEach((h, i) => {
      const th = document.createElement('th');
      if (i === 0) th.className = 'th-group-sep';
      th.textContent = h;
      tr2.appendChild(th);
    });
  }

  if (hasDefence) {
    ['D+', 'Dig', 'DE', '4+3%'].forEach((h, i) => {
      const th = document.createElement('th');
      if (i === 0) th.className = 'th-group-sep';
      th.textContent = h;
      tr2.appendChild(th);
    });
  }

  thead.appendChild(tr2);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  // Build a synthetic "total" row by summing every set.
  const totalSet = { kills: 0, errors: 0, continued_plus: 0, continued_minus: 0, block_kills: 0, block_plus: 0, block_minus: 0, block_errors: 0, dig_plus: 0, digs: 0, dig_errors: 0, pass_4: 0, pass_3: 0, pass_2: 0, pass_1: 0, pass_0: 0 };
  (session.sets || []).forEach(s => {
    Object.keys(totalSet).forEach(k => { totalSet[k] += s[k] || 0; });
  });

  const hasPerSet = (session.sets || []).length > 1;

  if (hasPerSet) {
    (session.sets || []).forEach((s, i) => {
      tbody.appendChild(buildSetRow(s, `Set ${i + 1}`, false, mode, hasBlocking, hasDefence));
    });
  }

  tbody.appendChild(buildSetRow(totalSet, 'Total', true, mode, hasBlocking, hasDefence));

  if (!hasPerSet) {
    const noteRow = document.createElement('tr');
    const noteTd = document.createElement('td');
    noteTd.colSpan = 20;
    noteTd.style.cssText = 'color:var(--text-dis);font-style:italic;font-size:0.8rem';
    noteTd.textContent = 'No per-set breakdown available';
    noteRow.appendChild(noteTd);
    tbody.appendChild(noteRow);
  }

  table.appendChild(tbody);
  scroll.appendChild(table);
  wrap.appendChild(scroll);
  return wrap;
}

function buildSetRow(s, label, isTotal, mode, hasBlocking, hasDefence) {
  const bk  = s.block_kills    || 0;
  const cp  = s.continued_plus  || 0;
  const cm  = s.continued_minus || 0;
  const att = (s.kills || 0) + (s.errors || 0) + cp + cm;
  const effVal   = effNum(s.kills, s.errors, att, bk);
  const pass4pct = hasDefence ? calcPassPct(s) : null;

  const tr = document.createElement('tr');
  if (isTotal) tr.className = 'tr-total';

  function td(content, cls) {
    const el = document.createElement('td');
    if (cls) el.className = cls;
    el.textContent = content;
    return el;
  }

  tr.appendChild(td(label, 'td-set-label'));
  tr.appendChild(td(s.kills  || 0));
  tr.appendChild(td(s.errors || 0));
  tr.appendChild(td(cp));
  tr.appendChild(td(cm));
  tr.appendChild(td(att));
  tr.appendChild(td(pctStr(s.kills,  att)));
  tr.appendChild(td(pctStr(s.errors, att)));

  const effTd = td(effStr(s.kills, s.errors, att, bk));
  if (effVal !== null) { effTd.style.color = effColor(effVal); effTd.style.fontWeight = '700'; }
  tr.appendChild(effTd);

  if (hasBlocking) {
    tr.appendChild(td(s.block_kills  || 0, 'td-group-sep'));
    tr.appendChild(td(s.block_plus   || 0));
    tr.appendChild(td(s.block_minus  || 0));
    tr.appendChild(td(s.block_errors || 0));
  }

  if (hasDefence) {
    tr.appendChild(td(s.dig_plus   || 0, 'td-group-sep'));
    tr.appendChild(td(s.digs       || 0));
    tr.appendChild(td(s.dig_errors || 0));
    tr.appendChild(td(pass4pct !== null ? (pass4pct * 100).toFixed(1) + '%' : '-'));
  }

  return tr;
}

async function renderHistory() {
  if (!state.currentUser) {
    const page = document.createElement('div');
    page.className = 'page';
    page.appendChild(emptyStateEl('🏐', 'No user selected', 'Pick or create a user from the top right.'));
    return page;
  }

  state.sessions = await api.getSessions(state.currentUser.id).catch(() => []);

  const page = document.createElement('div');
  page.className = 'page';

  const header = document.createElement('div');
  header.className = 'page-header';
  const heading = document.createElement('h1');
  heading.className = 'page-heading';
  heading.textContent = 'History';
  const logBtn = document.createElement('button');
  logBtn.className = 'btn-primary';
  logBtn.style.fontSize = '0.85rem';
  logBtn.textContent = '+ Log Session';
  logBtn.addEventListener('click', () => navigate('entry'));
  header.appendChild(heading);
  header.appendChild(logBtn);
  page.appendChild(header);

  if (!state.sessions.length) {
    page.appendChild(emptyStateEl('📋', 'No sessions yet', 'Log your first session to get started.'));
    return page;
  }

  // Toolbar: date filter
  const toolbar = document.createElement('div');
  toolbar.className = 'history-toolbar';

  const dateFilter = document.createElement('input');
  dateFilter.type = 'date';
  dateFilter.className = 'history-filter-input';
  dateFilter.title = 'Filter by date';
  toolbar.appendChild(dateFilter);
  page.appendChild(toolbar);

  // Table in a card
  // table-card handles the padding and the sideways scroll. Inline
  // overflow:hidden here used to clip the Efficiency column off the right
  // edge on a narrow phone with no way to scroll to it.
  const card = document.createElement('div');
  card.className = 'card table-card';

  let sortKey = 'event_date';
  let sortDir = -1; // -1 = descending, default to newest-first

  function rebuildTable() {
    card.innerHTML = '';
    const filterVal = dateFilter.value;

    let rows = [...state.sessions];

    if (filterVal) rows = rows.filter(s => s.event_date === filterVal);

    rows.sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey];
      if (sortKey === 'efficiency') {
        va = sessionEff(a);
        vb = sessionEff(b);
      }
      if (va < vb) return -1 * sortDir;
      if (va > vb) return  1 * sortDir;
      return 0;
    });

    const table = document.createElement('table');
    table.className = 'history-table';

    const thead = document.createElement('thead');
    const tr = document.createElement('tr');

    const cols = [
      { key: 'event_name', label: 'Event' },
      { key: 'event_date', label: 'Date' },
      { key: null,         label: 'Mode' },
      { key: 'efficiency', label: 'Efficiency' },
    ];

    cols.forEach(col => {
      const th = document.createElement('th');
      th.className = col.key === sortKey ? 'sorted' : '';
      th.innerHTML = col.label + (col.key ? `<span class="sort-arrow">${col.key === sortKey ? (sortDir === 1 ? '↑' : '↓') : '⇅'}</span>` : '');
      if (col.key) {
        th.addEventListener('click', () => {
          if (sortKey === col.key) sortDir *= -1;
          else { sortKey = col.key; sortDir = -1; }
          rebuildTable();
        });
      }
      tr.appendChild(th);
    });

    thead.appendChild(tr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    if (!rows.length) {
      const emptyRow = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.style.cssText = 'text-align:center;color:var(--text-dis);padding:32px;font-style:italic';
      td.textContent = 'No sessions match the current filter.';
      emptyRow.appendChild(td);
      tbody.appendChild(emptyRow);
    }

    rows.forEach(s => {
      const eff = sessionEff(s);
      const tr = document.createElement('tr');
      tr.addEventListener('click', () => navigate('session', { sessionId: s.id }));

      const nameTd = document.createElement('td');
      nameTd.className = 'history-event';
      nameTd.textContent = s.event_name;

      const dateTd = document.createElement('td');
      dateTd.textContent = fmtDate(s.event_date, { month: 'short', day: 'numeric', year: 'numeric' });

      const modeTd = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = `mode-badge mode-${s.mode}`;
      badge.textContent = MODE_LABELS[s.mode] || s.mode;
      modeTd.appendChild(badge);

      const effTd = document.createElement('td');
      effTd.className = 'history-eff';
      effTd.style.color = eff !== null ? effColor(eff) : 'var(--text-dis)';
      effTd.textContent = eff !== null ? (eff * 100).toFixed(1) + '%' : '-';

      tr.appendChild(nameTd);
      tr.appendChild(dateTd);
      tr.appendChild(modeTd);
      tr.appendChild(effTd);
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    card.appendChild(table);
  }

  dateFilter.addEventListener('input', rebuildTable);
  rebuildTable();
  page.appendChild(card);
  return page;
}

function sessionEff(s) {
  const { k, e, bk, att } = sessionTotals(s);
  return att ? (k + bk - e) / att : null;
}

function emptyStateEl(icon, title, sub) {
  const el = document.createElement('div');
  el.className = 'empty-state';
  el.innerHTML = `<div class="empty-icon">${icon}</div><div class="empty-title">${title}</div><div class="empty-sub">${sub}</div>`;
  return el;
}

async function init() {
  applyAccentColor();

  const gateForm = document.getElementById('gate-form');
  gateForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = document.getElementById('gate-input').value;
    if (!pw) return;

    // Stash the password and try a real call - if it's wrong, the API will
    // throw UNAUTHORIZED and we'll clear it back out.
    sessionStorage.setItem('vs_pw', pw);

    try {
      const users = await api.getUsers();
      hidePasswordGate();
      state.users = users;

      const lastUserId = parseInt(localStorage.getItem('vs_user'));
      state.currentUser = (lastUserId && users.find(u => u.id === lastUserId)) || users[0] || null;

      if (state.currentUser) {
        state.sessions = await api.getSessions(state.currentUser.id).catch(() => []);
      }

      await render();
    } catch (err) {
      if (err.message === 'UNAUTHORIZED') {
        sessionStorage.removeItem('vs_pw');
        document.getElementById('gate-error').hidden = false;
        const card = document.querySelector('.gate-card');
        card.classList.add('gate-shake');
        card.addEventListener('animationend', () => card.classList.remove('gate-shake'), { once: true });
      } else {
        document.getElementById('gate-error').textContent = 'Could not connect to server.';
        document.getElementById('gate-error').hidden = false;
      }
    }
  });

  // If sessionStorage still has the password from a previous tab load, try
  // skipping the gate. Refreshes feel instant when this works.
  const savedPw = sessionStorage.getItem('vs_pw');
  if (savedPw) {
    try {
      const users = await api.getUsers();
      hidePasswordGate();
      state.users = users;
      const lastUserId = parseInt(localStorage.getItem('vs_user'));
      state.currentUser = (lastUserId && users.find(u => u.id === lastUserId)) || users[0] || null;
      if (state.currentUser) {
        state.sessions = await api.getSessions(state.currentUser.id).catch(() => []);
      }
      await render();
    } catch {
      // Password no longer works (e.g. rotated), drop it and let the gate show.
      sessionStorage.removeItem('vs_pw');
    }
  }
}

init();
