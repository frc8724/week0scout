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
        <button class="smallBtn bad" type="button">Delete</button>
      `;
      row.querySelector("button").onclick = () => {
        // delete the matching createdAt record (good enough for Week 0)
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

  const c = card("AUTO (all stats)", `
    <div class="pill">All AUTO info on one page.</div>
    <div class="pill">Auto Result decides who goes inactive first in Shift 1.</div>
  `);

  // Back button (to Home)
  const topNav = document.createElement("div");
  topNav.className = "btnRow";
  topNav.innerHTML = `
    <button type="button" id="back">← Back</button>
    <button class="primary" type="button" id="next">Start TELEOP →</button>
  `;
  topNav.querySelector("#back").onclick = () => { state.step="home"; render(); };
  topNav.querySelector("#next").onclick = () => {
    state.teleopSegmentIndex = 0;
    initializeSegmentOnEnter(0);
    state.step="teleop";
    render();
  };

  // Auto Fuel
  c.appendChild(counterRow3(
    "Auto Fuel",
    r.autoFuel,
    ()=>{ r.autoFuel = clampNonNeg(r.autoFuel - 1); render(); },
    ()=>{ r.autoFuel = clampNonNeg(r.autoFuel + 1); render(); },
    ()=>{ r.autoFuel = clampNonNeg(r.autoFuel + 5); render(); },
    "Count fuel scored by this robot in AUTO."
  ));

  // Auto climb + finish position
  const details = document.createElement("div");
  details.className = "counter";
  details.innerHTML = `
    <div style="flex:1">
      <div class="big">Auto Climb</div>
      <div class="pill">Did they climb during AUTO?</div>
      <select id="autoClimb" style="margin-top:10px">
        <option value="None" ${r.autoClimb==="None"?"selected":""}>None</option>
        <option value="L1" ${r.autoClimb==="L1"?"selected":""}>Level 1</option>
        <option value="L2" ${r.autoClimb==="L2"?"selected":""}>Level 2</option>
        <option value="L3" ${r.autoClimb==="L3"?"selected":""}>Level 3</option>
      </select>
    </div>
  `;
  details.querySelector("#autoClimb").onchange = (e)=>{ r.autoClimb = e.target.value; };
  c.appendChild(details);

  const finish = document.createElement("div");
  finish.className = "counter";
  finish.innerHTML = `
    <div style="flex:1">
      <div class="big">Where did they finish AUTO?</div>
      <div class="pill">Simple location label.</div>
      <select id="autoFinish" style="margin-top:10px">
        <option value="Unknown" ${r.autoFinish==="Unknown"?"selected":""}>Unknown</option>
        <option value="NZ" ${r.autoFinish==="NZ"?"selected":""}>NZ</option>
        <option value="AZ" ${r.autoFinish==="AZ"?"selected":""}>AZ</option>
        <option value="Center" ${r.autoFinish==="Center"?"selected":""}>Center / Midfield</option>
        <option value="Near Source" ${r.autoFinish==="Near Source"?"selected":""}>Near Source</option>
        <option value="Near Tower" ${r.autoFinish==="Near Tower"?"selected":""}>Near Tower</option>
      </select>
    </div>
  `;
  finish.querySelector("#autoFinish").onchange = (e)=>{ r.autoFinish = e.target.value; };
  c.appendChild(finish);

  // Auto Result Winner
  const resultWrap = document.createElement("div");
  resultWrap.className = "card";
  resultWrap.style.marginTop = "12px";
  resultWrap.innerHTML = `
    <div class="big">Auto Result (Winner)</div>
    <div class="pill">Select Red / Blue / Tie. (Shows selection.)</div>
  `;
  const group = buttonGroup3(
    ["Red","Blue","Tie"],
    (r.autoWinnerAlliance === "Unknown" ? "" : r.autoWinnerAlliance),
    (val) => { r.autoWinnerAlliance = val; render(); },
    { Red: "bad", Blue: "primary", Tie: "warn" }
  );
  resultWrap.appendChild(group);

  const current = document.createElement("div");
  current.className = "pill";
  current.innerHTML = `Selected: <b>${escapeHtml(r.autoWinnerAlliance)}</b> (default Active-first if Tie/Unknown)`;
  resultWrap.appendChild(current);

  c.appendChild(resultWrap);

  c.appendChild(topNav);
  app.appendChild(c);
}

function showTeleop(app) {
  const r = state.record;
  const idx = state.teleopSegmentIndex;

  initializeSegmentOnEnter(idx);

  const meta = TELEOP_SEGMENTS[idx];
  const status = currentTeleopHubStatus();
  const seg = r.teleop[idx];

  const c = card(`TELEOP: ${meta.label}`, `
    <div class="pill">Your HUB is: <b>${status}</b></div>
    <div class="pill">Segment ${idx+1} of ${TELEOP_SEGMENTS.length}</div>
    <div style="height:10px"></div>
    <button class="${status==="Active" ? "good" : "bad"}" type="button" style="width:100%; font-size:22px; padding:18px">
      ${status==="Active" ? "ACTIVE (fuel & cycles reset this segment)" : "INACTIVE (multi-select what they did)"}
    </button>
  `);

  // Active segment controls
  if (status === "Active") {
    c.appendChild(counterRow3(
      "Fuel (this active segment)",
      seg.activeFuel,
      ()=>{ seg.activeFuel = clampNonNeg(seg.activeFuel - 1); render(); },
      ()=>{ seg.activeFuel = clampNonNeg(seg.activeFuel + 1); render(); },
      ()=>{ seg.activeFuel = clampNonNeg(seg.activeFuel + 5); render(); },
      "Resets to 0 when this segment becomes active."
    ));

    c.appendChild(counterRow2(
      "Cycles (this active segment)",
      seg.activeCycles,
      ()=>{ seg.activeCycles = clampNonNeg(seg.activeCycles - 1); render(); },
      ()=>{ seg.activeCycles = clampNonNeg(seg.activeCycles + 1); render(); },
      "How many cycles during this segment."
    ));
  } else {
    // Inactive multi-select checklist
    const wrap = document.createElement("div");
    wrap.className = "card";
    wrap.innerHTML = `
      <div class="big">Inactive Activity (select all that apply)</div>
      <div class="pill">No fuel counting in inactive.</div>
      <div class="checklist" id="checklist"></div>
    `;

    const list = wrap.querySelector("#checklist");
    INACTIVE_ACTIVITY_OPTIONS.forEach(opt => {
      const item = document.createElement("label");
      item.className = "checkItem";
      const checked = seg.inactiveActivities.includes(opt);
      item.innerHTML = `
        <input type="checkbox" ${checked ? "checked" : ""} />
        <span>${escapeHtml(opt)}</span>
      `;
      const cb = item.querySelector("input");
      cb.onchange = () => {
        const set = new Set(seg.inactiveActivities);
        if (cb.checked) set.add(opt);
        else set.delete(opt);
        seg.inactiveActivities = Array.from(set);
      };
      list.appendChild(item);
    });

    c.appendChild(wrap);
  }

  // Nav buttons
  const nav = document.createElement("div");
  nav.className = "btnRow";
  nav.innerHTML = `
    <button type="button" id="back">← Back</button>
    <button class="primary" type="button" id="next">${idx === TELEOP_SEGMENTS.length-1 ? "End Game →" : "Next →"}</button>
  `;

  nav.querySelector("#back").onclick = () => {
    if (idx === 0) {
      state.step = "auto";
      render();
      return;
    }
    state.teleopSegmentIndex--;
    render();
  };

  nav.querySelector("#next").onclick = () => {
    if (idx === TELEOP_SEGMENTS.length-1) {
      state.step = "endgame";
      render();
      return;
    }
    state.teleopSegmentIndex++;
    render();
  };

  c.appendChild(nav);
  app.appendChild(c);
}

function showEndgame(app) {
  const r = state.record;

  const c = card("End Game", `
    <div class="pill">End Game includes last active hub fuel, climb, and ratings (including accuracy).</div>
  `);

  // Endgame last active fuel scoring
  c.appendChild(counterRow3(
    "Last Active Hub Fuel Scoring",
    r.endgameLastActiveFuel,
    ()=>{ r.endgameLastActiveFuel = clampNonNeg(r.endgameLastActiveFuel - 1); render(); },
    ()=>{ r.endgameLastActiveFuel = clampNonNeg(r.endgameLastActiveFuel + 1); render(); },
    ()=>{ r.endgameLastActiveFuel = clampNonNeg(r.endgameLastActiveFuel + 5); render(); },
    "Fuel scored during End Game (both hubs active)."
  ));

  // Climb select
  const climbWrap = document.createElement("div");
  climbWrap.className = "counter";
  climbWrap.innerHTML = `
    <div style="flex:1">
      <div class="big">Climb</div>
      <div class="pill">End Game climb level</div>
      <select id="climb" style="margin-top:10px">
        <option value="None" ${r.endgameClimb==="None"?"selected":""}>None</option>
        <option value="L1" ${r.endgameClimb==="L1"?"selected":""}>Level 1</option>
        <option value="L2" ${r.endgameClimb==="L2"?"selected":""}>Level 2</option>
        <option value="L3" ${r.endgameClimb==="L3"?"selected":""}>Level 3</option>
      </select>
    </div>
  `;
  climbWrap.querySelector("#climb").onchange = (e)=>{ r.endgameClimb = e.target.value; };
  c.appendChild(climbWrap);

  // Ratings (including accuracy, moved here)
  c.appendChild(ratingRow(
    "Accuracy (overall)",
    r.accuracyRating,
    (v)=>{ r.accuracyRating = v; render(); },
    "1 = poor, 5 = excellent"
  ));
  c.appendChild(ratingRow(
    "Defense rating",
    r.defenseRating,
    (v)=>{ r.defenseRating = v; render(); },
    "If they played defense at any point"
  ));
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

  // Notes
  const notes = document.createElement("div");
  notes.className = "counter";
  notes.innerHTML = `
    <div style="flex:1">
      <div class="big">Notes</div>
      <div class="pill">Optional: breakdowns, penalties, amazing cycles, etc.</div>
      <textarea id="notes" placeholder="Optional...">${escapeHtml(r.notes)}</textarea>
    </div>
  `;
  notes.querySelector("#notes").oninput = (e)=>{ r.notes = e.target.value; };
  c.appendChild(notes);

  // Nav
  const nav = document.createElement("div");
  nav.className = "btnRow";
  nav.innerHTML = `
    <button type="button" id="back">← Back</button>
    <button class="primary" type="button" id="review">Review →</button>
  `;
  nav.querySelector("#back").onclick = () => {
    state.step = "teleop";
    // go back to last teleop segment
    state.teleopSegmentIndex = TELEOP_SEGMENTS.length - 1;
    render();
  };
  nav.querySelector("#review").onclick = () => {
    state.step = "review";
    render();
  };

  c.appendChild(nav);
  app.appendChild(c);
}

function showReview(app) {
  const r = state.record;

  // quick summaries
  const teleopSummary = r.teleop.map((seg, i) => {
    const name = TELEOP_SEGMENTS[i].label;
    if (seg.hubStatus === "Active") {
      return `<div class="pill">${escapeHtml(name)}: Active • Fuel ${seg.activeFuel} • Cycles ${seg.activeCycles}</div>`;
    }
    const list = Array.isArray(seg.inactiveActivities) && seg.inactiveActivities.length
      ? seg.inactiveActivities.join("; ")
      : "Nothing";
    return `<div class="pill">${escapeHtml(name)}: Inactive • ${escapeHtml(list)}</div>`;
  }).join("");

  const c = card("Review", `
    <div class="pill">Team <b>${escapeHtml(r.teamNumber||"—")}</b> • Match <b>${escapeHtml(r.matchNumber||"—")}</b> • ${escapeHtml(r.alliance)}</div>
    <div class="pill">Event: <b>${escapeHtml(r.event||"—")}</b></div>

    <div class="sectionTitle">AUTO</div>
    <div class="pill">Fuel: <b>${r.autoFuel}</b></div>
    <div class="pill">Auto Climb: <b>${escapeHtml(r.autoClimb)}</b></div>
    <div class="pill">Finish: <b>${escapeHtml(r.autoFinish)}</b></div>
    <div class="pill">Auto Winner: <b>${escapeHtml(r.autoWinnerAlliance)}</b></div>

    <div class="sectionTitle">TELEOP</div>
    ${teleopSummary}

    <div class="sectionTitle">END GAME</div>
    <div class="pill">Last Active Fuel: <b>${r.endgameLastActiveFuel}</b></div>
    <div class="pill">Climb: <b>${escapeHtml(r.endgameClimb)}</b></div>

    <div class="sectionTitle">RATINGS</div>
    <div class="pill">Accuracy: <b>${r.accuracyRating}</b></div>
    <div class="pill">Defense: <b>${r.defenseRating}</b></div>
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

  nav.querySelector("#back").onclick = () => {
    state.step = "endgame";
    render();
  };

  nav.querySelector("#save").onclick = () => {
    const records = loadRecords();
    records.push({ ...r });
    saveRecords(records);

    // Prep next match (keep event + scoutName)
    const next = newBlankRecord();
    next.event = r.event;
    next.scoutName = r.scoutName;
    state.record = next;
    state.step = "home";
    alert("Saved locally ✅");
    render();
  };

  c.appendChild(nav);
  app.appendChild(c);
}

// initial render
render();
