// REBUILT Week 0 Scout (1 robot per device)
// Key changes:
// - Back button on every page
// - AUTO is one page: Fuel, Auto Climb, Finish Position, Auto Result winner (Red/Blue/Tie) w/ selection highlight
// - Accuracy moved to End Game ratings (one time only)
// - Inactive Activity per shift is multi-select checklist with specified options
// - End Game: last active hub fuel scoring, climb, ratings (incl accuracy)
// - Home shows saved data list + count
// - Export CSV only

const LS_KEY = "rebuildt_scout_records_v6";

function loadRecords() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); }
  catch { return []; }
}
function saveRecords(records) {
  localStorage.setItem(LS_KEY, JSON.stringify(records));
}
function clampNonNeg(n){ return Math.max(0, n|0); }
function clamp1to5(n){ return Math.min(5, Math.max(1, n|0)); }
function nowIso(){ return new Date().toISOString(); }

const TELEOP_SEGMENTS = [
  { key:"TRANSITION", label:"Transition Shift" }, // always Active
  { key:"SHIFT1", label:"Shift 1" },
  { key:"SHIFT2", label:"Shift 2" },
  { key:"SHIFT3", label:"Shift 3" },
  { key:"SHIFT4", label:"Shift 4" }
  // End Game is a separate screen now
];

const INACTIVE_ACTIVITY_OPTIONS = [
  "Nothing",
  "Picked Up Fuel",
  "Played Defense",
  "Herd Fuel (NZ to AZ)",
  "Passed Fuel (NZ to AZ)",
  "Stole Fuel (from Opp AZ)"
];

// --- App state ---
const state = {
  step: "home", // home | auto | teleop | endgame | review
  record: newBlankRecord(),
  teleopSegmentIndex: 0
};

function newBlankRecord() {
  return {
    createdAt: nowIso(),

    // Setup
    event: "",
    matchNumber: "",
    scoutName: "",
    alliance: "Red", // robot being scouted
    teamNumber: "",

    // AUTO (one page)
    autoFuel: 0,
    autoClimb: "None", // None | L1 | L2 | L3
    autoFinish: "Unknown", // where they finished auto
    autoWinnerAlliance: "Unknown", // Red | Blue | Tie | Unknown

    // TELEOP per segment
    teleop: TELEOP_SEGMENTS.map(() => ({
      hubStatus: "Unknown", // Active|Inactive (set when entered)
      // Active-only
      activeFuel: 0,   // resets each active segment
      activeCycles: 0, // resets each active segment
      // Inactive-only (multi-select)
      inactiveActivities: [] // array of strings from options
    })),

    // END GAME
    endgameLastActiveFuel: 0, // "Last Active Hub Fuel Scoring"
    endgameClimb: "None", // None | L1 | L2 | L3

    // Ratings (end game screen)
    accuracyRating: 3, // 1–5 (only once, at end)
    defenseRating: 3,  // 1–5
    robotRating: 3,    // 1–5
    driverRating: 3,   // 1–5

    notes: ""
  };
}

/**
 * Manual-driven hub alternation:
 * - Transition Shift: both hubs active (for scoring; your hub is active)
 * - Shifts 1–4: alliance that won AUTO has its HUB inactive first (Shift 1), then alternates.
 * - If Tie/Unknown: assume Active first (your requirement)
 */
function isMyHubActiveForShift(shiftNum /*1-4*/) {
  const r = state.record;

  // If unknown/tie, default active first
  if (r.autoWinnerAlliance === "Unknown" || r.autoWinnerAlliance === "Tie") {
    return shiftNum % 2 === 1; // Shift1 active
  }

  const myAlliance = r.alliance; // Red/Blue
  const myAllianceWonAuto = (r.autoWinnerAlliance === myAlliance);

  if (myAllianceWonAuto) {
    return shiftNum % 2 === 0; // winner inactive first => Shift1 inactive
  } else {
    return shiftNum % 2 === 1; // loser active first => Shift1 active
  }
}

function currentTeleopHubStatus() {
  const idx = state.teleopSegmentIndex;
  if (idx === 0) return "Active"; // Transition
  const shiftNum = idx; // SHIFT1 index 1 => shiftNum 1
  return isMyHubActiveForShift(shiftNum) ? "Active" : "Inactive";
}

// Reset active counters when entering an active segment (always)
function initializeSegmentOnEnter(idx) {
  const seg = state.record.teleop[idx];
  const status = currentTeleopHubStatus();

  if (seg.hubStatus !== status) {
    seg.hubStatus = status;

    if (status === "Active") {
      seg.activeFuel = 0;
      seg.activeCycles = 0;
    } else {
      if (!Array.isArray(seg.inactiveActivities)) seg.inactiveActivities = [];
    }
  }
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function card(title, innerHtml) {
  const div = document.createElement("div");
  div.className = "card";
  div.innerHTML = `<div class="big">${title}</div>${innerHtml || ""}`;
  return div;
}

function counterRow3(label, value, onMinus1, onPlus1, onPlus5, hint) {
  const wrap = document.createElement("div");
  wrap.className = "counter";
  wrap.innerHTML = `
    <div style="flex:1">
      <div class="big">${label}</div>
      <div class="pill">${escapeHtml(hint || "")}</div>
    </div>
    <div class="val">${value}</div>
    <div class="counterBtns">
      <button class="bad" type="button">−1</button>
      <button type="button">+1</button>
      <button class="good" type="button">+5</button>
    </div>
  `;
  const [m1, p1, p5] = wrap.querySelectorAll("button");
  m1.onclick = onMinus1;
  p1.onclick = onPlus1;
  p5.onclick = onPlus5;
  return wrap;
}

function counterRow2(label, value, onMinus1, onPlus1, hint) {
  const wrap = document.createElement("div");
  wrap.className = "counter";
  wrap.innerHTML = `
    <div style="flex:1">
      <div class="big">${label}</div>
      <div class="pill">${escapeHtml(hint || "")}</div>
    </div>
    <div class="val">${value}</div>
    <div class="counterBtns">
      <button class="bad" type="button">−1</button>
      <button class="good" type="button">+1</button>
    </div>
  `;
  const [m1, p1] = wrap.querySelectorAll("button");
  m1.onclick = onMinus1;
  p1.onclick = onPlus1;
  return wrap;
}

function ratingRow(label, value, onChange, help) {
  const wrap = document.createElement("div");
  wrap.className = "counter";
  wrap.innerHTML = `
    <div style="flex:1">
      <div class="big">${escapeHtml(label)}</div>
      <div class="pill">${escapeHtml(help || "")}</div>
    </div>
    <div class="val">${value}</div>
    <div style="min-width:240px">
      <input type="range" min="1" max="5" step="1" value="${value}" />
      <div class="pill" style="display:flex; justify-content:space-between; margin-top:8px">
        <span>1</span><span>3</span><span>5</span>
      </div>
    </div>
  `;
  const slider = wrap.querySelector("input");
  slider.oninput = (e) => onChange(clamp1to5(parseInt(e.target.value, 10)));
  return wrap;
}

function buttonGroup3(labels, selectedValue, onSelect, classMap = {}) {
  const row = document.createElement("div");
  row.className = "btnRow3";
  labels.forEach((lbl) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = lbl;
    if (classMap[lbl]) btn.classList.add(classMap[lbl]);
    if (lbl === selectedValue) btn.classList.add("selected");
    btn.onclick = () => onSelect(lbl);
    row.appendChild(btn);
  });
  return row;
}

function wireFooterButtons() {
  const btnExport = document.getElementById("btnExport");
  const btnWipe = document.getElementById("btnWipe");

  btnExport.onclick = async () => {
    const records = loadRecords();
    if (!records.length) return alert("No saved data yet.");

    const stamp = new Date().toISOString().replaceAll(":","-").slice(0,19);
    const csvBlob = new Blob([recordsToCsv(records)], { type: "text/csv" });

    try {
      await shareOrDownload(`rebuildt_scout_${stamp}.csv`, csvBlob);
    } catch (e) {
      alert("Export canceled or failed.");
      console.warn(e);
    }
  };

  btnWipe.onclick = () => {
    if (!confirm("Wipe ALL locally saved scouting records?")) return;
    localStorage.removeItem(LS_KEY);
    alert("Local data wiped.");
    render();
  };
}

async function shareOrDownload(filename, blob) {
  const file = new File([blob], filename, { type: blob.type });

  // iOS Share Sheet (AirDrop) when available
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: filename });
    return;
  }

  // Fallback download
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// --- CSV export (flattened) ---
function recordsToCsv(records) {
  const baseCols = [
    "createdAt","event","matchNumber","scoutName","teamNumber","alliance",
    "autoFuel","autoClimb","autoFinish","autoWinnerAlliance",
    "endgameLastActiveFuel","endgameClimb",
    "accuracyRating","defenseRating","robotRating","driverRating",
    "notes"
  ];

  const teleopCols = [];
  TELEOP_SEGMENTS.forEach((seg, i) => {
    teleopCols.push(
      `teleop_${i}_${seg.key}_hubStatus`,
      `teleop_${i}_${seg.key}_activeFuel`,
      `teleop_${i}_${seg.key}_activeCycles`,
      `teleop_${i}_${seg.key}_inactiveActivities`
    );
  });

  const header = [...baseCols, ...teleopCols];

  const escape = (v) => `"${String(v ?? "").replaceAll('"','""')}"`;

  const rows = [header.join(",")];

  for (const r of records) {
    const row = [];

    for (const col of baseCols) row.push(escape(r[col]));

    for (let i = 0; i < TELEOP_SEGMENTS.length; i++) {
      const t = r.teleop?.[i] || {};
      const inactive = Array.isArray(t.inactiveActivities) ? t.inactiveActivities.join("; ") : "";
      row.push(
        escape(t.hubStatus),
        escape(t.activeFuel),
        escape(t.activeCycles),
        escape(inactive)
      );
    }

    rows.push(row.join(","));
  }

  return rows.join("\n");
}

// --- Screens ---
function render() {
  const app = document.getElementById("app");
  app.innerHTML = "";

  if (state.step === "home") showHome(app);
  if (state.step === "auto") showAuto(app);
  if (state.step === "teleop") showTeleop(app);
  if (state.step === "endgame") showEndgame(app);
  if (state.step === "review") showReview(app);

  wireFooterButtons();
}

function showHome(app) {
  const r = state.record;
  const records = loadRecords();
  const recent = [...records].slice(-8).reverse();

  const c = card("Home", `
    <div class="pill">Saved matches: <b>${records.length}</b></div>
    <div class="pill">This device scouts <b>1 robot</b> per match</div>

    <div class="sectionTitle">New Match</div>
    <div class="row" style="margin-top:12px">
      <div>
        <label>Event</label>
        <input id="event" placeholder="Week 0 / Scrimmage Name" value="${escapeHtml(r.event)}" />
      </div>
      <div>
        <label>Match #</label>
        <input id="matchNumber" inputmode="numeric" placeholder="e.g. 12" value="${escapeHtml(r.matchNumber)}" />
      </div>
      <div>
        <label>Scout Name</label>
        <input id="scoutName" placeholder="e.g. Riley" value="${escapeHtml(r.scoutName)}" />
      </div>
      <div>
        <label>Team # (robot you’re scouting)</label>
        <input id="teamNumber" inputmode="numeric" placeholder="e.g. 8724" value="${escapeHtml(r.teamNumber)}" />
      </div>
      <div>
        <label>Alliance</label>
        <select id="alliance">
          <option ${r.alliance==="Red"?"selected":""}>Red</option>
          <option ${r.alliance==="Blue"?"selected":""}>Blue</option>
        </select>
      </div>
    </div>

    <div class="btnRow" style="margin-top:14px">
      <button class="primary" id="startAuto" type="button">Start AUTO →</button>
      <button id="resetForm" type="button">Reset Form</button>
    </div>

    <div class="sectionTitle">Recent Saved</div>
    <div class="savedList" id="savedList"></div>
  `);

  app.appendChild(c);

  c.querySelector("#event").oninput = (e)=> r.event = e.target.value;
  c.querySelector("#matchNumber").oninput = (e)=> r.matchNumber = e.target.value;
  c.querySelector("#scoutName").oninput = (e)=> r.scoutName = e.target.value;
  c.querySelector("#teamNumber").oninput = (e)=> r.teamNumber = e.target.value;
  c.querySelector("#alliance").onchange = (e)=> r.alliance = e.target.value;

  c.querySelector("#startAuto").onclick = () => {
    state.step = "auto";
    render();
  };

  c.querySelector("#resetForm").onclick = () => {
    const next = newBlankRecord();
    // keep event + scoutName as convenience
    next.event = r.event;
    next.scoutName = r.scoutName;
    state.record = next;
    render();
  };

  const list = c.querySelector("#savedList");
  if (!recent.length) {
    list.innerHTML = `<div class="pill">No saved matches yet.</div>`;
  } else {
    recent.forEach((rec, idx) => {
      const row = document.createElement("div");
      row.className = "savedRow";
      row.innerHTML = `
        <div>
          <div><b>Team ${escapeHtml(rec.teamNumber || "—")}</b> • Match ${escapeHtml(rec.matchNumber || "—")} • ${escapeHtml(rec.alliance || "")}</div>
          <div class="meta">${escapeHtml(rec.event || "")} • ${escapeHtml(rec.createdAt || "")}</div>
        </div>
        <button class="smallBtn bad" typ
