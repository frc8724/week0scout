// REBUILT Week 0 Scout (1 robot per device)
// Offline storage: localStorage

const LS_KEY = "rebuildt_scout_records_v2";

function loadRecords() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); }
  catch { return []; }
}
function saveRecords(records) {
  localStorage.setItem(LS_KEY, JSON.stringify(records));
}
function clampNonNeg(n){ return Math.max(0, n|0); }
function clamp1to5(n){ return Math.min(5, Math.max(1, n|0)); }
function nowIso() { return new Date().toISOString(); }

const TELEOP_SEGMENTS = [
  { key:"TRANSITION", label:"Transition Shift" }, // active
  { key:"SHIFT1", label:"Shift 1" },
  { key:"SHIFT2", label:"Shift 2" },
  { key:"SHIFT3", label:"Shift 3" },
  { key:"SHIFT4", label:"Shift 4" },
  { key:"ENDGAME", label:"End Game" } // active
];

const INACTIVE_ACTIVITY_OPTIONS = [
  "Something",
  "Played defense",
  "Picked up fuel",
  "Passed",
  "Herded",
  "Hoarded"
];

// --- App state ---
const state = {
  step: "setup", // setup | auto | autoResult | teleop | endgame | review
  record: newBlankRecord(),
  teleopSegmentIndex: 0,
};

function newBlankRecord() {
  return {
    createdAt: nowIso(),
    event: "",
    matchNumber: "",
    scoutName: "",
    alliance: "Red",
    teamNumber: "",

    // Auto
    autoFuel: 0,

    // Determines active/inactive order for Shift 1–4
    autoWinner: "Unknown", // My | Opponent | Tie | Unknown
    activeFirstOverride: "Auto", // Auto | ActiveFirst | InactiveFirst

    // Per teleop segment data (Transition, Shift1-4, Endgame)
    // Each entry filled as we go.
    teleop: TELEOP_SEGMENTS.map(() => ({
      hubStatus: "Unknown", // Active|Inactive, set when visiting
      // Active-only fields:
      activeFuel: 0,
      activeCycles: 0,
      activeAccuracy: 3, // 1–5
      // Inactive-only field:
      inactiveActivity: "Something"
    })),

    // Endgame outcomes (separate "endgame screen" still useful)
    endgameClimb: "None", // None | L1 | L2 | L3
    endgameScoredNoClimb: false,

    // Ratings
    defenseRating: 3, // 1–5 (overall if played defense at all)
    robotRating: 3,   // 1–5
    driverRating: 3,  // 1–5

    notes: ""
  };
}

// Manual-based logic for Shift 1–4
function isMyHubActiveForShift(shiftNum /*1-4*/) {
  const r = state.record;

  // Optional override (simpler in stands)
  if (r.activeFirstOverride === "ActiveFirst") return shiftNum % 2 === 1;
  if (r.activeFirstOverride === "InactiveFirst") return shiftNum % 2 === 0;

  // Auto-driven default. If unknown/tie => assume active first (your requirement)
  if (r.autoWinner === "Unknown" || r.autoWinner === "Tie") return shiftNum % 2 === 1;
  if (r.autoWinner === "My") return shiftNum % 2 === 0;
  return shiftNum % 2 === 1; // opponent won => active first
}

function currentTeleopHubStatus() {
  const idx = state.teleopSegmentIndex;
  // Transition active, Endgame active
  if (idx === 0) return "Active";
  if (idx >= 1 && idx <= 4) return isMyHubActiveForShift(idx) ? "Active" : "Inactive";
  return "Active";
}

// Reset active counters when entering a NEW active segment
function maybeResetActiveCountersOnEnter(idx) {
  const seg = state.record.teleop[idx];
  const status = currentTeleopHubStatus();
  // If we're entering segment and it just became Active, reset its active counts.
  // We reset only if it's currently 0/0? No — you asked reset to 0 every active segment:
  // We enforce by resetting the segment's activeFuel/activeCycles when we FIRST mark it active.
  if (seg.hubStatus !== status) {
    seg.hubStatus = status;
    if (status === "Active") {
      seg.activeFuel = 0;
      seg.activeCycles = 0;
      // keep accuracy default 3 unless scout changes
      seg.activeAccuracy = clamp1to5(seg.activeAccuracy || 3);
    }
  }
}

function render() {
  const app = document.getElementById("app");
  app.innerHTML = "";

  if (state.step === "setup") return showSetup(app);
  if (state.step === "auto") return showAuto(app);
  if (state.step === "autoResult") return showAutoResult(app);
  if (state.step === "teleop") return showTeleop(app);
  if (state.step === "endgame") return showEndgame(app);
  if (state.step === "review") return showReview(app);
}

function card(title, innerHtml) {
  const div = document.createElement("div");
  div.className = "card";
  div.innerHTML = `<div class="big">${title}</div>${innerHtml || ""}`;
  return div;
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function counterRow3(label, value, onMinus1, onPlus1, onPlus5, hint) {
  const wrap = document.createElement("div");
  wrap.className = "counter";
  wrap.innerHTML = `
    <div style="flex:1">
      <div class="big">${label}</div>
      <div class="hint">${hint || ""}</div>
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

function ratingRow(label, value, onChange, help) {
  const wrap = document.createElement("div");
  wrap.className = "counter";
  wrap.innerHTML = `
    <div style="flex:1">
      <div class="big">${label}</div>
      <div class="hint">${escapeHtml(help || "")}</div>
    </div>
    <div class="val">${value}</div>
    <div style="min-width:240px">
      <input type="range" min="1" max="5" step="1" value="${value}" />
      <div class="hint" style="display:flex; justify-content:space-between">
        <span>1</span><span>3</span><span>5</span>
      </div>
    </div>
  `;
  const slider = wrap.querySelector("input");
  slider.oninput = (e)=> onChange(clamp1to5(parseInt(e.target.value, 10)));
  return wrap;
}

// --- Screens ---
function showSetup(app) {
  const r = state.record;

  const c = card("Match Setup", `
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
      <button class="primary" id="startAuto" type="button">Start AUTO</button>
      <button id="reset" type="button">Reset Form</button>
    </div>
  `);

  app.appendChild(c);

  c.querySelector("#event").oninput = (e)=> r.event = e.target.value;
  c.querySelector("#matchNumber").oninput = (e)=> r.matchNumber = e.target.value;
  c.querySelector("#scoutName").oninput = (e)=> r.scoutName = e.target.value;
  c.querySelector("#teamNumber").oninput = (e)=> r.teamNumber = e.target.value;
  c.querySelector("#alliance").onchange = (e)=> r.alliance = e.target.value;

  wireFooterButtons();

  c.querySelector("#startAuto").onclick = ()=>{ state.step = "auto"; render(); };
  c.querySelector("#reset").onclick = ()=>{ state.record = newBlankRecord(); render(); };
}

function showAuto(app) {
  const r = state.record;

  const c = card("AUTO (Hub Active)", `
    <div style="margin-top:8px" class="pill">
      Count FUEL scored by this robot in AUTO.
    </div>
  `);

  c.appendChild(counterRow3(
    "AUTO Fuel",
    r.autoFuel,
    ()=>{ r.autoFuel = clampNonNeg(r.autoFuel - 1); render(); },
    ()=>{ r.autoFuel = clampNonNeg(r.autoFuel + 1); render(); },
    ()=>{ r.autoFuel = clampNonNeg(r.autoFuel + 5); render(); },
    "Estimate is fine. Week 0 = speed > perfection."
  ));

  const nav = document.createElement("div");
  nav.className = "btnRow";
  nav.innerHTML = `
    <button type="button" id="back">Back</button>
    <button class="primary" type="button" id="next">Auto Result →</button>
  `;
  nav.querySelector("#back").onclick = ()=>{ state.step="setup"; render(); };
  nav.querySelector("#next").onclick = ()=>{ state.step="autoResult"; render(); };

  c.appendChild(nav);
  app.appendChild(c);

  wireFooterButtons();
}

function showAutoResult(app) {
  const r = state.record;

  const c = card("AUTO Result → Shift Order", `
    <div style="margin-top:8px" class="pill">
      Who won AUTO (more fuel)? Determines who goes inactive first in Shift 1.
      If you don't choose, default is Active-first.
    </div>

    <div class="btnRow3">
      <button class="good" id="myWin" type="button">My Alliance</button>
      <button class="warn" id="tie" type="button">Tie</button>
      <button class="bad" id="oppWin" type="button">Opponent</button>
    </div>

    <div style="margin-top:12px" class="pill">
      Optional override (simpler): choose Active-first / Inactive-first directly.
    </div>

    <div class="btnRow3">
      <button id="ovAuto" type="button">Auto</button>
      <button id="ovActive" type="button">Active First</button>
      <button id="ovInactive" type="button">Inactive First</button>
    </div>

    <div style="margin-top:12px" class="pill">
      Current: AUTO winner = <b>${escapeHtml(r.autoWinner)}</b>, Override = <b>${escapeHtml(r.activeFirstOverride)}</b>
    </div>

    <div class="btnRow" style="margin-top:14px">
      <button type="button" id="back">Back</button>
      <button class="primary" type="button" id="goTeleop">Start TELEOP →</button>
    </div>
  `);

  app.appendChild(c);

  c.querySelector("#myWin").onclick = ()=>{ r.autoWinner="My"; render(); };
  c.querySelector("#tie").onclick = ()=>{ r.autoWinner="Tie"; render(); };
  c.querySelector("#oppWin").onclick = ()=>{ r.autoWinner="Opponent"; render(); };

  c.querySelector("#ovAuto").onclick = ()=>{ r.activeFirstOverride="Auto"; render(); };
  c.querySelector("#ovActive").onclick = ()=>{ r.activeFirstOverride="ActiveFirst"; render(); };
  c.querySelector("#ovInactive").onclick = ()=>{ r.activeFirstOverride="InactiveFirst"; render(); };

  c.querySelector("#back").onclick = ()=>{ state.step="auto"; render(); };
  c.querySelector("#goTeleop").onclick = ()=>{
    state.teleopSegmentIndex = 0;
    // ensure this segment status is initialized + active segment reset happens
    maybeResetActiveCountersOnEnter(state.teleopSegmentIndex);
    state.step="teleop";
    render();
  };

  wireFooterButtons();
}

function showTeleop(app) {
  const r = state.record;
  const idx = state.teleopSegmentIndex;
  const segMeta = TELEOP_SEGMENTS[idx];

  maybeResetActiveCountersOnEnter(idx);

  const status = currentTeleopHubStatus();
  const seg = r.teleop[idx];

  const c = card(`TELEOP: ${segMeta.label}`, `
    <div class="pill">Your HUB is: <b>${status}</b></div>
    <div class="pill" style="margin-left:8px">Segment ${idx+1} of ${TELEOP_SEGMENTS.length}</div>
    <div style="height:10px"></div>
    <button class="${status === "Active" ? "good" : "bad"}" type="button" style="width:100%; font-size:22px; padding:18px">
      ${status === "Active" ? "ACTIVE (record cycles, accuracy, fuel)" : "INACTIVE (record what they did)"}
    </button>
  `);

  if (status === "Active") {
    c.appendChild(counterRow3(
      "Active Fuel (this segment)",
      seg.activeFuel,
      ()=>{ seg.activeFuel = clampNonNeg(seg.activeFuel - 1); render(); },
      ()=>{ seg.activeFuel = clampNonNeg(seg.activeFuel + 1); render(); },
      ()=>{ seg.activeFuel = clampNonNeg(seg.activeFuel + 5); render(); },
      "Resets to 0 at start of each active segment."
    ));

    c.appendChild(counterRow3(
      "Cycles (this segment)",
      seg.activeCycles,
      ()=>{ seg.activeCycles = clampNonNeg(seg.activeCycles - 1); render(); },
      ()=>{ seg.activeCycles = clampNonNeg(seg.activeCycles + 1); render(); },
      ()=>{ seg.activeCycles = clampNonNeg(seg.activeCycles + 5); render(); },
      "How many scoring cycles while active."
    ));

    c.appendChild(ratingRow(
      "Accuracy (Active)",
      seg.activeAccuracy,
      (v)=>{ seg.activeAccuracy = v; render(); },
      "1 = poor, 5 = excellent"
    ));
  } else {
    // Inactive: record behavior (not fuel)
    const activityCard = document.createElement("div");
    activityCard.className = "counter";
    activityCard.innerHTML = `
      <div style="flex:1">
        <div class="big">Inactive: What did they do?</div>
        <div class="hint">No fuel counting here.</div>
      </div>
      <div style="min-width:280px">
        <select id="inactiveActivity">
          ${INACTIVE_ACTIVITY_OPTIONS.map(opt =>
            `<option value="${escapeHtml(opt)}" ${seg.inactiveActivity===opt?"selected":""}>${escapeHtml(opt)}</option>`
          ).join("")}
        </select>
      </div>
    `;
    activityCard.querySelector("#inactiveActivity").onchange = (e)=>{
      seg.inactiveActivity = e.target.value;
    };
    c.appendChild(activityCard);
  }

  const nav = document.createElement("div");
  nav.className = "btnRow";
  nav.innerHTML = `
    <button type="button" id="prev">Prev</button>
    <button class="primary" type="button" id="next">${idx === TELEOP_SEGMENTS.length-1 ? "Endgame →" : "Next →"}</button>
  `;
  nav.querySelector("#prev").onclick = ()=>{
    if (idx === 0) { state.step="autoResult"; render(); return; }
    state.teleopSegmentIndex--;
    render();
  };
  nav.querySelector("#next").onclick = ()=>{
    if (idx === TELEOP_SEGMENTS.length-1) {
      state.step="endgame";
      render();
      return;
    }
    state.teleopSegmentIndex++;
    render();
  };

  c.appendChild(nav);

  const quick = document.createElement("div");
  quick.className = "btnRow";
  quick.innerHTML = `
    <button class="warn" type="button" id="jumpEndgame">Jump to Endgame</button>
    <button type="button" id="review">Review / Save</button>
  `;
  quick.querySelector("#jumpEndgame").onclick = ()=>{ state.step="endgame"; render(); };
  quick.querySelector("#review").onclick = ()=>{ state.step="review"; render(); };
  c.appendChild(quick);

  app.appendChild(c);
  wireFooterButtons();
}

function showEndgame(app) {
  const r = state.record;

  const c = card("End Game", `
    <div class="pill">End Game outcomes + overall ratings.</div>

    <div style="margin-top:12px">
      <label>Climb / Tower Level</label>
      <select id="climb">
        <option value="None" ${r.endgameClimb==="None"?"selected":""}>None</option>
        <option value="L1" ${r.endgameClimb==="L1"?"selected":""}>Level 1</option>
        <option value="L2" ${r.endgameClimb==="L2"?"selected":""}>Level 2</option>
        <option value="L3" ${r.endgameClimb==="L3"?"selected":""}>Level 3</option>
      </select>
    </div>

    <div style="margin-top:12px">
      <label>
        <input type="checkbox" id="scoredNoClimb" ${r.endgameScoredNoClimb ? "checked" : ""} />
        Scored in End Game but did NOT climb
      </label>
    </div>

    <div style="margin-top:12px"></div>
  `);

  // Ratings
  c.appendChild(ratingRow(
    "Defense rating",
    r.defenseRating,
    (v)=>{ r.defenseRating = v; render(); },
    "If they played defense at any point (1–5)."
  ));
  c.appendChild(ratingRow(
    "Robot performance",
    r.robotRating,
    (v)=>{ r.robotRating = v; render(); },
    "Overall effectiveness (1–5)."
  ));
  c.appendChild(ratingRow(
    "Driver performance",
    r.driverRating,
    (v)=>{ r.driverRating = v; render(); },
    "Control, awareness, speed (1–5)."
  ));

  // Notes
  const notes = document.createElement("div");
  notes.className = "counter";
  notes.innerHTML = `
    <div style="flex:1">
      <div class="big">Notes</div>
      <div class="hint">Anything unusual: breakdown, penalties, great auto, etc.</div>
      <textarea id="notes" placeholder="Optional...">${escapeHtml(r.notes)}</textarea>
    </div>
  `;
  notes.querySelector("#notes").oninput = (e)=> r.notes = e.target.value;
  c.appendChild(notes);

  // Wire endgame fields
  c.querySelector("#climb").onchange = (e)=> r.endgameClimb = e.target.value;
  c.querySelector("#scoredNoClimb").onchange = (e)=> r.endgameScoredNoClimb = !!e.target.checked;

  const nav = document.createElement("div");
  nav.className = "btnRow";
  nav.innerHTML = `
    <button type="button" id="back">Back</button>
    <button class="primary" type="button" id="review">Review / Save →</button>
  `;
  nav.querySelector("#back").onclick = ()=>{ state.step="teleop"; render(); };
  nav.querySelector("#review").onclick = ()=>{ state.step="review"; render(); };

  c.appendChild(nav);
  app.appendChild(c);

  wireFooterButtons();
}

function showReview(app) {
  const r = state.record;

  const activeSegments = r.teleop
    .map((s, i) => ({ s, i }))
    .filter(x => x.s.hubStatus === "Active");

  const inactiveSegments = r.teleop
    .map((s, i) => ({ s, i }))
    .filter(x => x.s.hubStatus === "Inactive");

  const activeSummaryHtml = activeSegments.map(({s,i}) => {
    const name = TELEOP_SEGMENTS[i].label;
    return `<div class="pill" style="margin-top:8px">${escapeHtml(name)}:
      Fuel <b>${s.activeFuel}</b>, Cycles <b>${s.activeCycles}</b>, Acc <b>${s.activeAccuracy}</b>
    </div>`;
  }).join("") || `<div class="pill" style="margin-top:8px">No active segments recorded?</div>`;

  const inactiveSummaryHtml = inactiveSegments.map(({s,i}) => {
    const name = TELEOP_SEGMENTS[i].label;
    return `<div class="pill" style="margin-top:8px">${escapeHtml(name)}:
      <b>${escapeHtml(s.inactiveActivity)}</b>
    </div>`;
  }).join("") || `<div class="pill" style="margin-top:8px">No inactive segments recorded.</div>`;

  const c = card("Review", `
    <div class="pill">Event: <b>${escapeHtml(r.event||"—")}</b></div>
    <div class="pill" style="margin-left:8px">Match: <b>${escapeHtml(r.matchNumber||"—")}</b></div>
    <div class="pill" style="margin-left:8px">Team: <b>${escapeHtml(r.teamNumber||"—")}</b> (${escapeHtml(r.alliance)})</div>

    <div style="height:12px"></div>

    <div class="card">
      <div class="big">AUTO</div>
      <div class="pill" style="margin-top:8px">Fuel: <b>${r.autoFuel}</b></div>
      <div class="pill" style="margin-top:8px">Auto winner: <b>${escapeHtml(r.autoWinner)}</b> (override: <b>${escapeHtml(r.activeFirstOverride)}</b>)</div>
    </div>

    <div class="card">
      <div class="big">TELEOP (Active segments)</div>
      ${activeSummaryHtml}
    </div>

    <div class="card">
      <div class="big">TELEOP (Inactive segments)</div>
      ${inactiveSummaryHtml}
    </div>

    <div class="card">
      <div class="big">End Game + Ratings</div>
      <div class="pill" style="margin-top:8px">Climb: <b>${escapeHtml(r.endgameClimb)}</b></div>
      <div class="pill" style="margin-top:8px">Scored, no climb: <b>${r.endgameScoredNoClimb ? "Yes" : "No"}</b></div>
      <div class="pill" style="margin-top:8px">Defense rating: <b>${r.defenseRating}</b></div>
      <div class="pill" style="margin-top:8px">Robot rating: <b>${r.robotRating}</b></div>
      <div class="pill" style="margin-top:8px">Driver rating: <b>${r.driverRating}</b></div>
    </div>

    <div class="card">
      <div class="big">Notes</div>
      <div style="color:var(--muted); margin-top:6px; white-space:pre-wrap">${escapeHtml(r.notes||"—")}</div>
    </div>
  `);

  const nav = document.createElement("div");
  nav.className = "btnRow";
  nav.innerHTML = `
    <button type="button" id="back">Back</button>
    <button class="good" type="button" id="save">Save Match</button>
  `;
  nav.querySelector("#back").onclick = ()=>{ state.step="endgame"; render(); };
  nav.querySelector("#save").onclick = ()=>{
    const records = loadRecords();
    records.push({ ...r });
    saveRecords(records);

    // Prep next match quickly
    const next = newBlankRecord();
    next.event = r.event;
    next.scoutName = r.scoutName;
    state.record = next;
    state.step = "setup";
    alert("Saved locally ✅");
    render();
  };

  c.appendChild(nav);
  app.appendChild(c);

  wireFooterButtons();
}

// --- Export / Wipe ---
function recordsToCsv(records) {
  // Flatten teleop segments into columns (simple Week 0 export)
  const base = [
    "createdAt","event","matchNumber","scoutName","alliance","teamNumber",
    "autoFuel","autoWinner","activeFirstOverride",
    "endgameClimb","endgameScoredNoClimb",
    "defenseRating","robotRating","driverRating","notes"
  ];

  const teleopCols = [];
  TELEOP_SEGMENTS.forEach((seg, i) => {
    teleopCols.push(
      `teleop_${i}_${seg.key}_hubStatus`,
      `teleop_${i}_${seg.key}_activeFuel`,
      `teleop_${i}_${seg.key}_activeCycles`,
      `teleop_${i}_${seg.key}_activeAccuracy`,
      `teleop_${i}_${seg.key}_inactiveActivity`
    );
  });

  const header = [...base, ...teleopCols];
  const escape = (v) => `"${String(v ?? "").replaceAll('"','""')}"`;

  const rows = [header.join(",")];
  for (const r of records) {
    const row = [];
    for (const k of base) row.push(escape(r[k]));
    for (let i = 0; i < TELEOP_SEGMENTS.length; i++) {
      const t = r.teleop?.[i] || {};
      row.push(
        escape(t.hubStatus),
        escape(t.activeFuel),
        escape(t.activeCycles),
        escape(t.activeAccuracy),
        escape(t.inactiveActivity)
      );
    }
    rows.push(row.join(","));
  }
  return rows.join("\n");
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

function wireFooterButtons() {
  const btnExport = document.getElementById("btnExport");
  const btnWipe = document.getElementById("btnWipe");

  btnExport.onclick = async ()=>{
    const records = loadRecords();
    if (!records.length) return alert("No saved data yet.");

    const stamp = new Date().toISOString().replaceAll(":","-").slice(0,19);
    const jsonBlob = new Blob([JSON.stringify(records, null, 2)], { type: "application/json" });
    const csvBlob = new Blob([recordsToCsv(records)], { type: "text/csv" });

    try {
      await shareOrDownload(`rebuildt_scout_${stamp}.json`, jsonBlob);
      await shareOrDownload(`rebuildt_scout_${stamp}.csv`, csvBlob);
    } catch (e) {
      alert("Export canceled or failed.");
      console.warn(e);
    }
  };

  btnWipe.onclick = ()=>{
    if (!confirm("Wipe ALL locally saved scouting records?")) return;
    localStorage.removeItem(LS_KEY);
    alert("Local data wiped.");
  };
}

// Initial render
render();
