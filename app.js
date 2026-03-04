// REBUILT Scout (Week 0) - v12
// - Auto: no auto fuel; auto climb yes/no; finish simplified
// - Teleop: one Active section + one Inactive section (no per-shift detail)
// - Cycles: -1/+1 only
// - Accuracy rating meaning defined:
//   1:<20%  2:<50%  3:<75%  4:<90%  5:>90%
// - CSV export includes computed analytics fields (estimated attempts/scored, etc.)
// - Focus-preserving render to avoid iOS losing cursor while typing

const LS_KEY = "rebuildt_scout_records_v12";
const DEVICE_ID_KEY = "rebuildt_scout_device_id";

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

function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = Math.random().toString(36).slice(2, 8);
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

const INACTIVE_ACTIVITY_OPTIONS = [
  "Nothing",
  "Picked Up Fuel",
  "Played Defense",
  "Herd Fuel (NZ to AZ)",
  "Passed Fuel (NZ to AZ)",
  "Stole Fuel (from Opp AZ)"
];

const AUTO_FINISH_OPTIONS = [
  "Alliance Zone",
  "Neutral Zone",
  "Tower (Climbed)"
];

const AUTO_START_POS_OPTIONS = [
  "Depot Trench",
  "Depot Bump",
  "Hub",
  "Outpost Bump",
  "Outpost Trench"
];

const CYCLE_FUEL_BUCKETS = [
  "<10",
  "10-20",
  "20-30",
  "30+"
];

// --- Analytics helpers (for export) ---
function fuelBucketMidpoint(bucket){
  // Midpoints tuned for “estimate without over-crediting”
  if(bucket === "<10") return 5;
  if(bucket === "10-20") return 15;
  if(bucket === "20-30") return 25;
  if(bucket === "30+") return 35;
  return 0;
}
function accuracyPercentFromRating(rating){
  // your defined bands; we pick a representative value in each band
  // (you can tweak these later if your scouts trend high/low)
  const map = {
    1: 0.10, // <20%
    2: 0.35, // <50%
    3: 0.62, // <75%
    4: 0.82, // <90%
    5: 0.95  // >90%
  };
  return map[rating] ?? 0;
}

// --- App state ---
const state = {
  step: "home", // home | auto | teleop | endgame | review
  record: newBlankRecord()
};

function newBlankRecord() {
  return {
    createdAt: nowIso(),
    deviceId: getDeviceId(),

    event: "",
    matchNumber: "",
    scoutName: "",
    alliance: "Red",
    teamNumber: "",

    autoStartPos: "Hub",
    autoClimb: false,                 // boolean
    autoFinish: "Alliance Zone",
    autoWinnerAlliance: "Unknown",    // Red | Blue | Tie | Unknown

    // TELEOP (aggregated)
    teleopActiveCycles: 0,
    teleopCycleFuelCount: "<10",
    teleopInactiveActivities: [],

    // ENDGAME
    endgameClimb: "No",               // No | Low | Mid | High

    // Ratings / notes
    accuracyRating: 3,
    noDefense: false,
    defenseRating: 3,
    robotRating: 3,
    driverRating: 3,

    notes: ""
  };
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

function counterRow2(label, value, onMinus1, onPlus1, hint) {
  const wrap = document.createElement("div");
  wrap.className = "counter";
  wrap.innerHTML = `
    <div style="flex:1">
      <div class="big">${escapeHtml(label)}</div>
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

function ratingRow(label, value, onChange, help, disabled=false) {
  const wrap = document.createElement("div");
  wrap.className = "counter";
  wrap.innerHTML = `
    <div style="flex:1">
      <div class="big">${escapeHtml(label)}</div>
      <div class="pill">${escapeHtml(help || "")}</div>
    </div>
    <div class="val">${disabled ? "—" : value}</div>
    <div style="min-width:240px">
      <input type="range" min="1" max="5" step="1" value="${value}" ${disabled ? "disabled" : ""}/>
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

// --- Shift logic (for labeling only) ---
function isMyHubActiveForShift(shiftNum /*1-4*/) {
  const r = state.record;

  if (r.autoWinnerAlliance === "Unknown" || r.autoWinnerAlliance === "Tie") {
    return shiftNum % 2 === 1; // Shift1 active
  }

  const myAlliance = r.alliance;
  const myAllianceWonAuto = (r.autoWinnerAlliance === myAlliance);
  if (myAllianceWonAuto) return shiftNum % 2 === 0; // winner inactive first
  return shiftNum % 2 === 1;
}

function activeShiftLabels() {
  const actives = ["Transition"];
  for (let s = 1; s <= 4; s++) if (isMyHubActiveForShift(s)) actives.push(`Shift ${s}`);
  return actives;
}
function inactiveShiftLabels() {
  const inactives = [];
  for (let s = 1; s <= 4; s++) if (!isMyHubActiveForShift(s)) inactives.push(`Shift ${s}`);
  return inactives;
}

// --- Footer ---
function wireFooterButtons() {
  const btnExport = document.getElementById("btnExport");
  const btnWipe = document.getElementById("btnWipe");

  btnExport.onclick = async () => {
    const records = loadRecords();
    if (!records.length) return alert("No saved data yet.");

    const stamp = new Date().toISOString().replaceAll(":","-").slice(0,19);

    // helpful filename for later merging/debugging
    const safeScout = (state.record.scoutName || "scout").replaceAll(/[^a-z0-9]/gi, "");
    const filename = `rebuildt_${stamp}_${safeScout}.csv`;

    const csvBlob = new Blob([recordsToCsv(records)], { type: "text/csv" });

    try {
      await shareOrDownload(filename, csvBlob);
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

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: filename });
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// --- CSV ---
function recordsToCsv(records) {
  const cols = [
    // identifiers
    "createdAt","deviceId","event","matchNumber","scoutName","teamNumber","alliance",

    // auto
    "autoStartPos","autoClimb","autoFinish","autoWinnerAlliance",

    // teleop raw
    "teleopActiveCycles","teleopCycleFuelCount","teleopInactiveActivities",

    // endgame raw
    "endgameClimb",

    // ratings raw
    "accuracyRating","noDefense","defenseRating","robotRating","driverRating",

    // analytics (computed)
    "activeWindows","inactiveWindows","activeWindowCount","inactiveWindowCount",
    "fuelBucketMidpoint","accuracyPercent",
    "estimatedFuelAttempted","estimatedFuelScored","estimatedFuelScoredPerCycle",

    // notes
    "notes"
  ];

  const escape = (v) => `"${String(v ?? "").replaceAll('"','""')}"`;
  const rows = [cols.join(",")];

  for (const r of records) {
    const inactive = Array.isArray(r.teleopInactiveActivities)
      ? r.teleopInactiveActivities.join("; ")
      : "";

    // computed window labels
    // (uses the record’s alliance + auto winner)
    state.record = r; // temporary for label helpers
    const act = activeShiftLabels();
    const inact = inactiveShiftLabels();

    const midpoint = fuelBucketMidpoint(r.teleopCycleFuelCount);
    const accPct = accuracyPercentFromRating(r.accuracyRating);
    const attempts = (r.teleopActiveCycles || 0) * midpoint;
    const scored = attempts * accPct;
    const scoredPerCycle = (r.teleopActiveCycles || 0) > 0 ? (scored / r.teleopActiveCycles) : 0;

    const row = cols.map((c) => {
      if (c === "teleopInactiveActivities") return escape(inactive);
      if (c === "defenseRating" && r.noDefense) return escape("");

      if (c === "activeWindows") return escape(act.join(", "));
      if (c === "inactiveWindows") return escape(inact.join(", "));
      if (c === "activeWindowCount") return escape(act.length);
      if (c === "inactiveWindowCount") return escape(inact.length);

      if (c === "fuelBucketMidpoint") return escape(midpoint);
      if (c === "accuracyPercent") return escape(accPct);

      if (c === "estimatedFuelAttempted") return escape(attempts);
      if (c === "estimatedFuelScored") return escape(scored.toFixed(1));
      if (c === "estimatedFuelScoredPerCycle") return escape(scoredPerCycle.toFixed(1));

      return escape(r[c]);
    });

    rows.push(row.join(","));
  }

  return rows.join("\n");
}

// --- Focus-preserving render (prevents “lose focus after 1 char” on iOS) ---
function render() {
  const active = document.activeElement;
  const activeId = active && active.id ? active.id : null;

  let selStart = null, selEnd = null;
  const isTextInput =
    active &&
    (active.tagName === "INPUT" || active.tagName === "TEXTAREA") &&
    typeof active.selectionStart === "number";

  if (isTextInput) {
    selStart = active.selectionStart;
    selEnd = active.selectionEnd;
  }

  const app = document.getElementById("app");
  app.innerHTML = "";

  if (state.step === "home") showHome(app);
  if (state.step === "auto") showAuto(app);
  if (state.step === "teleop") showTeleop(app);
  if (state.step === "endgame") showEndgame(app);
  if (state.step === "review") showReview(app);

  wireFooterButtons();

  if (activeId) {
    const el = document.getElementById(activeId);
    if (el && typeof el.focus === "function") {
      el.focus();
      if (
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA") &&
        selStart !== null &&
        typeof el.setSelectionRange === "function"
      ) {
        el.setSelectionRange(selStart, selEnd ?? selStart);
      }
    }
  }
}

// --- Screens ---
function showHome(app) {
  const r = state.record;
  const records = loadRecords();
  const recent = [...records].slice(-8).reverse();

  const c = card("Home", `
    <div class="pill">Saved matches: <b>${records.length}</b></div>

    <div class="sectionTitle">New Match</div>
    <div id="reqMsg" class="inlineWarn" style="display:none;">
      Match # and Team # are required to start.
    </div>

    <div class="row" style="margin-top:12px">
      <div>
        <label>Event</label>
        <input id="event" placeholder="Week 0 / Scrimmage Name" value="${escapeHtml(r.event)}" />
      </div>
      <div>
        <label>Match # <span class="reqStar">*</span></label>
        <input id="matchNumber" inputmode="numeric" placeholder="e.g. 12" value="${escapeHtml(r.matchNumber)}" />
      </div>
      <div>
        <label>Scout Name</label>
        <input id="scoutName" placeholder="Scout name" value="${escapeHtml(r.scoutName)}" />
      </div>
      <div>
        <label>Team # <span class="reqStar">*</span></label>
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

  const elEvent = c.querySelector("#event");
  const elMatch = c.querySelector("#matchNumber");
  const elScout = c.querySelector("#scoutName");
  const elTeam = c.querySelector("#teamNumber");
  const elAlli = c.querySelector("#alliance");
  const btnStart = c.querySelector("#startAuto");
  const reqMsg = c.querySelector("#reqMsg");

  function canStart() {
    const teamOk = String(r.teamNumber || "").trim().length > 0;
    const matchOk = String(r.matchNumber || "").trim().length > 0;
    return teamOk && matchOk;
  }

  function updateStartUi(showWarningIfInvalid=false) {
    const ok = canStart();
    btnStart.disabled = !ok;
    if (showWarningIfInvalid) reqMsg.style.display = ok ? "none" : "block";
    else reqMsg.style.display = "none";
  }

  elEvent.addEventListener("input", (e)=> { r.event = e.target.value; });
  elMatch.addEventListener("input", (e)=> { r.matchNumber = e.target.value; updateStartUi(false); });
  elScout.addEventListener("input", (e)=> { r.scoutName = e.target.value; });
  elTeam.addEventListener("input", (e)=> { r.teamNumber = e.target.value; updateStartUi(false); });
  elAlli.addEventListener("change", (e)=> { r.alliance = e.target.value; });

  updateStartUi(false);

  btnStart.onclick = () => {
    if (!canStart()) { updateStartUi(true); return; }
    state.step = "auto";
    render();
  };

  c.querySelector("#resetForm").onclick = () => {
    const next = newBlankRecord();
    next.event = r.event;
    next.scoutName = r.scoutName;
    next.alliance = r.alliance;
    state.record = next;
    render();
  };

  const list = c.querySelector("#savedList");
  if (!recent.length) {
    list.innerHTML = `<div class="pill">No saved matches yet.</div>`;
  } else {
    recent.forEach((rec) => {
      const row = document.createElement("div");
      row.className = "savedRow";
      row.innerHTML = `
        <div>
          <div><b>Team ${escapeHtml(rec.teamNumber || "—")}</b> • Match ${escapeHtml(rec.matchNumber || "—")} • ${escapeHtml(rec.alliance || "")}</div>
          <div class="meta">${escapeHtml(rec.event || "")} • ${escapeHtml(rec.createdAt || "")} • device ${escapeHtml(rec.deviceId || "")}</div>
        </div>
        <button class="smallBtn bad" type="button">Delete</button>
      `;
      row.querySelector("button").onclick = () => {
        const all = loadRecords();
        const target = rec.createdAt;
        const filtered = all.filter(x => x.createdAt !== target);
        saveRecords(filtered);
        render();
      };
      list.appendChild(row);
    });
  }
}

function showAuto(app) {
  const r = state.record;
  const winnerSelected = (r.autoWinnerAlliance === "Red" || r.autoWinnerAlliance === "Blue" || r.autoWinnerAlliance === "Tie");

  const c = card("AUTO", `
    <div class="pill">Auto Result winner is <b>required</b> before TELEOP.</div>
    ${winnerSelected ? "" : `<div class="inlineWarn">Select Auto Result winner (Red / Blue / Tie) to allow TELEOP.</div>`}
  `);

  const nav = document.createElement("div");
  nav.className = "btnRow";
  nav.innerHTML = `
    <button type="button" id="back">← Back</button>
    <button class="primary" type="button" id="next" ${winnerSelected ? "" : "disabled"}>Start TELEOP →</button>
  `;
  nav.querySelector("#back").onclick = () => { state.step="home"; render(); };
  nav.querySelector("#next").onclick = () => { if (!winnerSelected) return; state.step="teleop"; render(); };

  const startPos = document.createElement("div");
  startPos.className = "counter";
  startPos.innerHTML = `
    <div style="flex:1">
      <div class="big">Auto Starting Position</div>
      <div class="pill">Choose one</div>
      <select id="autoStartPos" style="margin-top:10px">
        ${AUTO_START_POS_OPTIONS.map(opt =>
          `<option value="${escapeHtml(opt)}" ${r.autoStartPos===opt?"selected":""}>${escapeHtml(opt)}</option>`
        ).join("")}
      </select>
    </div>
  `;
  startPos.querySelector("#autoStartPos").onchange = (e)=>{ r.autoStartPos = e.target.value; };
  c.appendChild(startPos);

  const climb = document.createElement("div");
  climb.className = "counter";
  climb.innerHTML = `
    <div style="flex:1">
      <div class="big">Auto Climb</div>
      <div class="pill">Did they climb during AUTO?</div>
      <label class="checkItem" style="margin-top:10px">
        <input type="checkbox" id="autoClimb" ${r.autoClimb ? "checked" : ""} />
        <span>Yes</span>
      </label>
    </div>
  `;
  climb.querySelector("#autoClimb").onchange = (e)=>{ r.autoClimb = !!e.target.checked; };
  c.appendChild(climb);

  const finish = document.createElement("div");
  finish.className = "counter";
  finish.innerHTML = `
    <div style="flex:1">
      <div class="big">Finish (AUTO)</div>
      <div class="pill">Choose one</div>
      <select id="autoFinish" style="margin-top:10px">
        ${AUTO_FINISH_OPTIONS.map(opt =>
          `<option value="${escapeHtml(opt)}" ${r.autoFinish===opt?"selected":""}>${escapeHtml(opt)}</option>`
        ).join("")}
      </select>
    </div>
  `;
  finish.querySelector("#autoFinish").onchange = (e)=>{ r.autoFinish = e.target.value; };
  c.appendChild(finish);

  const resultWrap = document.createElement("div");
  resultWrap.className = "card";
  resultWrap.style.marginTop = "12px";
  resultWrap.innerHTML = `
    <div class="big">Auto Result (Winner) <span class="reqStar">*</span></div>
    <div class="pill">Select Red / Blue / Tie</div>
  `;
  const group = buttonGroup3(
    ["Red","Blue","Tie"],
    winnerSelected ? r.autoWinnerAlliance : "",
    (val) => { r.autoWinnerAlliance = val; render(); },
    { Red: "bad", Blue: "primary", Tie: "warn" }
  );
  resultWrap.appendChild(group);

  const current = document.createElement("div");
  current.className = "pill";
  current.innerHTML = `Selected: <b>${escapeHtml(r.autoWinnerAlliance)}</b>`;
  resultWrap.appendChild(current);

  c.appendChild(resultWrap);
  c.appendChild(nav);
  app.appendChild(c);
}

function showTeleop(app) {
  const r = state.record;

  const act = activeShiftLabels();
  const inact = inactiveShiftLabels();

  const c = card("TELEOP", `
    <div class="pill">
      Your HUB is <b>Active</b> during: ${escapeHtml(act.join(", "))}.
      ${inact.length ? ` <b>Inactive</b> during: ${escapeHtml(inact.join(", "))}.` : ""}
    </div>
    <div class="pill">Log what they did overall while Active vs Inactive.</div>
  `);

  const activeCard = document.createElement("div");
  activeCard.className = "card";
  activeCard.style.marginTop = "12px";
  activeCard.innerHTML = `<div class="big">Active</div><div class="pill">When their HUB was active.</div>`;

  activeCard.appendChild(counterRow2(
    "Cycles",
    r.teleopActiveCycles,
    ()=>{ r.teleopActiveCycles = clampNonNeg(r.teleopActiveCycles - 1); render(); },
    ()=>{ r.teleopActiveCycles = clampNonNeg(r.teleopActiveCycles + 1); render(); },
    "How many times they collected Fuel and then shot again."
  ));

  const bucket = document.createElement("div");
  bucket.className = "counter";
  bucket.innerHTML = `
    <div style="flex:1">
      <div class="big">Cycle Fuel Count</div>
      <div class="pill">Typical Fuel per cycle (estimate)</div>
      <select id="cycleBucket" style="margin-top:10px">
        ${CYCLE_FUEL_BUCKETS.map(opt =>
          `<option value="${escapeHtml(opt)}" ${r.teleopCycleFuelCount===opt?"selected":""}>${escapeHtml(opt)}</option>`
        ).join("")}
      </select>
    </div>
  `;
  bucket.querySelector("#cycleBucket").onchange = (e)=>{ r.teleopCycleFuelCount = e.target.value; };
  activeCard.appendChild(bucket);

  // Show live estimate so scouts can sanity-check their inputs (optional but helpful)
  const estMid = fuelBucketMidpoint(r.teleopCycleFuelCount);
  const estAcc = accuracyPercentFromRating(r.accuracyRating);
  const estAttempt = (r.teleopActiveCycles || 0) * estMid;
  const estScored = estAttempt * estAcc;

  const live = document.createElement("div");
  live.className = "pill";
  live.innerHTML = `Live estimate (based on End Game Accuracy slider): Attempted ~<b>${estAttempt}</b>, Scored ~<b>${estScored.toFixed(0)}</b>`;
  activeCard.appendChild(live);

  c.appendChild(activeCard);

  const inactiveCard = document.createElement("div");
  inactiveCard.className = "card";
  inactiveCard.style.marginTop = "12px";
  inactiveCard.innerHTML = `
    <div class="big">Inactive</div>
    <div class="pill">What they did overall while their HUB was inactive.</div>
    <div class="checklist"></div>
  `;
  const host = inactiveCard.querySelector(".checklist");
  INACTIVE_ACTIVITY_OPTIONS.forEach((opt) => {
    const id = `teleopInactive_${opt.replaceAll(" ","_").replaceAll("(","").replaceAll(")","")}`;
    const checked = Array.isArray(r.teleopInactiveActivities) && r.teleopInactiveActivities.includes(opt);
    const item = document.createElement("label");
    item.className = "checkItem";
    item.innerHTML = `
      <input type="checkbox" id="${escapeHtml(id)}" ${checked ? "checked" : ""} />
      <span>${escapeHtml(opt)}</span>
    `;
    const cb = item.querySelector("input");
    cb.onchange = () => {
      if (!Array.isArray(r.teleopInactiveActivities)) r.teleopInactiveActivities = [];
      const has = r.teleopInactiveActivities.includes(opt);
      if (cb.checked && !has) r.teleopInactiveActivities.push(opt);
      if (!cb.checked && has) r.teleopInactiveActivities = r.teleopInactiveActivities.filter(x => x !== opt);
    };
    host.appendChild(item);
  });
  c.appendChild(inactiveCard);

  const nav = document.createElement("div");
  nav.className = "btnRow";
  nav.innerHTML = `
    <button type="button" id="back">← Back</button>
    <button class="primary" type="button" id="next">End Game →</button>
  `;
  nav.querySelector("#back").onclick = () => { state.step="auto"; render(); };
  nav.querySelector("#next").onclick = () => { state.step="endgame"; render(); };
  c.appendChild(nav);

  app.appendChild(c);
}

function showEndgame(app) {
  const r = state.record;

  const c = card("End Game", `<div class="pill">Climb + ratings + notes.</div>`);

  const climbWrap = document.createElement("div");
  climbWrap.className = "counter";
  climbWrap.innerHTML = `
    <div style="flex:1">
      <div class="big">Climb</div>
      <div class="pill">End Game climb level</div>
      <select id="climb" style="margin-top:10px">
        <option value="No" ${r.endgameClimb==="No"?"selected":""}>No</option>
        <option value="Low" ${r.endgameClimb==="Low"?"selected":""}>Low</option>
        <option value="Mid" ${r.endgameClimb==="Mid"?"selected":""}>Mid</option>
        <option value="High" ${r.endgameClimb==="High"?"selected":""}>High</option>
      </select>
    </div>
  `;
  climbWrap.querySelector("#climb").onchange = (e)=>{ r.endgameClimb = e.target.value; };
  c.appendChild(climbWrap);

  c.appendChild(ratingRow(
    "Accuracy (overall)",
    r.accuracyRating,
    (v)=>{ r.accuracyRating = v; render(); },
    "1:<20%  2:<50%  3:<75%  4:<90%  5:>90%"
  ));

  const defenseCard = document.createElement("div");
  defenseCard.className = "card";
  defenseCard.innerHTML = `
    <div class="big">Defense</div>
    <label class="checkItem" style="margin-top:10px">
      <input type="checkbox" id="noDefense" ${r.noDefense ? "checked" : ""} />
      <span>No Defense</span>
    </label>
    <div id="defenseSlider"></div>
  `;
  const noDefCb = defenseCard.querySelector("#noDefense");
  const sliderHost = defenseCard.querySelector("#defenseSlider");

  function renderDefenseSlider() {
    sliderHost.innerHTML = "";
    sliderHost.appendChild(ratingRow(
      "Defense rating",
      r.defenseRating,
      (v)=>{ r.defenseRating = v; render(); },
      "If they played defense at any point",
      r.noDefense
    ));
  }
  noDefCb.onchange = () => { r.noDefense = !!noDefCb.checked; renderDefenseSlider(); };
  renderDefenseSlider();
  c.appendChild(defenseCard);

  c.appendChild(ratingRow(
    "Robot performance",
    r.robotRating,
    (v)=>{ r.robotRating = v; render(); },
    "Overall effectiveness"
  ));
  c.appendChild(ratingRow(
    "Driver performance",
    r.driverRating,
    (v)=>{ r.driverRating = v; render(); },
    "Control, awareness, speed"
  ));

  const notes = document.createElement("div");
  notes.className = "counter";
  notes.innerHTML = `
    <div style="flex:1">
      <div class="big">Notes</div>
      <div class="pill">Optional</div>
      <textarea id="notes" placeholder="Optional...">${escapeHtml(r.notes)}</textarea>
    </div>
  `;
  notes.querySelector("#notes").oninput = (e)=>{ r.notes = e.target.value; };
  c.appendChild(notes);

  const nav = document.createElement("div");
  nav.className = "btnRow";
  nav.innerHTML = `
    <button type="button" id="back">← Back</button>
    <button class="primary" type="button" id="review">Review →</button>
  `;
  nav.querySelector("#back").onclick = () => { state.step = "teleop"; render(); };
  nav.querySelector("#review").onclick = () => { state.step = "review"; render(); };
  c.appendChild(nav);

  app.appendChild(c);
}

function showReview(app) {
  const r = state.record;

  const inactiveList = Array.isArray(r.teleopInactiveActivities) && r.teleopInactiveActivities.length
    ? r.teleopInactiveActivities.join("; ")
    : "Nothing";

  const defenseText = r.noDefense ? "No Defense" : String(r.defenseRating);

  // quick computed preview
  const midpoint = fuelBucketMidpoint(r.teleopCycleFuelCount);
  const accPct = accuracyPercentFromRating(r.accuracyRating);
  const attempts = (r.teleopActiveCycles || 0) * midpoint;
  const scored = attempts * accPct;

  const c = card("Review", `
    <div class="pill">Team <b>${escapeHtml(r.teamNumber||"—")}</b> • Match <b>${escapeHtml(r.matchNumber||"—")}</b> • ${escapeHtml(r.alliance)}</div>
    <div class="pill">Event: <b>${escapeHtml(r.event||"—")}</b> • Device: <b>${escapeHtml(r.deviceId||"—")}</b></div>

    <div class="sectionTitle">AUTO</div>
    <div class="pill">Start: <b>${escapeHtml(r.autoStartPos)}</b></div>
    <div class="pill">Auto Climb: <b>${r.autoClimb ? "Yes" : "No"}</b></div>
    <div class="pill">Finish: <b>${escapeHtml(r.autoFinish)}</b></div>
    <div class="pill">Auto Winner: <b>${escapeHtml(r.autoWinnerAlliance)}</b></div>

    <div class="sectionTitle">TELEOP</div>
    <div class="pill">Active Cycles: <b>${r.teleopActiveCycles ?? 0}</b></div>
    <div class="pill">Fuel per Cycle: <b>${escapeHtml(r.teleopCycleFuelCount || "—")}</b> (midpoint ${midpoint})</div>
    <div class="pill">Inactive Activities: <b>${escapeHtml(inactiveList)}</b></div>
    <div class="pill">Estimated Attempted: <b>${attempts}</b> • Estimated Scored: <b>${scored.toFixed(0)}</b></div>

    <div class="sectionTitle">END GAME</div>
    <div class="pill">Climb: <b>${escapeHtml(r.endgameClimb)}</b></div>

    <div class="sectionTitle">RATINGS</div>
    <div class="pill">Accuracy: <b>${r.accuracyRating}</b> <span class="meta">(1:<20% 2:<50% 3:<75% 4:<90% 5:>90%)</span></div>
    <div class="pill">Defense: <b>${escapeHtml(defenseText)}</b></div>
    <div class="pill">Robot: <b>${r.robotRating}</b></div>
    <div class="pill">Driver: <b>${r.driverRating}</b></div>

    <div class="sectionTitle">NOTES</div>
    <div class="pill" style="white-space:pre-wrap">${escapeHtml(r.notes||"—")}</div>
  `);

  const nav = document.createElement("div");
  nav.className = "btnRow";
  nav.innerHTML = `
    <button type="button" id="back">← Back</button>
    <button class="good" type="button" id="save">Save Match</button>
  `;

  nav.querySelector("#back").onclick = () => { state.step = "endgame"; render(); };

  nav.querySelector("#save").onclick = () => {
    const records = loadRecords();
    records.push({ ...r });
    saveRecords(records);

    const next = newBlankRecord();
    next.event = r.event;
    next.scoutName = r.scoutName;
    next.alliance = r.alliance;
    state.record = next;
    state.step = "home";
    alert("Saved locally ✅");
    render();
  };

  c.appendChild(nav);
  app.appendChild(c);
}

// start
render();
