// REBUILT Week 0 Scout
// Offline storage: localStorage (simple + reliable for Week 0)

const LS_KEY = "rebuildt_scout_records_v1";

function loadRecords() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); }
  catch { return []; }
}
function saveRecords(records) {
  localStorage.setItem(LS_KEY, JSON.stringify(records));
}

function clampNonNeg(n){ return Math.max(0, n|0); }

function nowIso() {
  return new Date().toISOString();
}

// --- App state ---
const state = {
  step: "setup", // setup | auto | autoResult | teleop | endgame | review
  record: newBlankRecord(),
  teleopSegmentIndex: 0 // 0=Transition, 1=Shift1,2=Shift2,3=Shift3,4=Shift4,5=EndGame
};

function newBlankRecord() {
  return {
    createdAt: nowIso(),

    event: "",
    matchNumber: "",
    scoutName: "",
    alliance: "Red", // Red | Blue
    teamNumber: "",

    // Auto
    autoFuel: 0,

    // Auto result drives hub active order for shifts
    autoWinner: "Unknown", // My | Opponent | Tie | Unknown
    activeFirstOverride: "Auto", // Auto | ActiveFirst | InactiveFirst

    // Teleop fuel by whether your HUB was active/inactive at time
    teleopFuelActive: 0,
    teleopFuelInactive: 0,

    // Endgame
    endgameClimb: "None", // None | L1 | L2 | L3
    endgameScoredNoClimb: false,

    notes: ""
  };
}

const TELEOP_SEGMENTS = [
  { key:"TRANSITION", label:"Transition Shift", hub:"Active" }, // both active :contentReference[oaicite:7]{index=7}
  { key:"SHIFT1", label:"Shift 1", hub:"?" },
  { key:"SHIFT2", label:"Shift 2", hub:"?" },
  { key:"SHIFT3", label:"Shift 3", hub:"?" },
  { key:"SHIFT4", label:"Shift 4", hub:"?" },
  { key:"ENDGAME", label:"End Game", hub:"Active" } // both active :contentReference[oaicite:8]{index=8}
];

// Determine if "my hub is active" for a given shift (1-4)
// Manual: alliance that wins AUTO has its HUB inactive for Shift 1, then alternates :contentReference[oaicite:9]{index=9}
function isMyHubActiveForShift(shiftNum /*1-4*/) {
  const r = state.record;

  // Override is simplest for week 0 use in stands
  if (r.activeFirstOverride === "ActiveFirst") {
    return shiftNum % 2 === 1; // Shift1 active, Shift2 inactive...
  }
  if (r.activeFirstOverride === "InactiveFirst") {
    return shiftNum % 2 === 0; // Shift1 inactive, Shift2 active...
  }

  // Auto-driven (default). If unknown/tie -> assume Active first (your requirement)
  if (r.autoWinner === "Unknown" || r.autoWinner === "Tie") {
    return shiftNum % 2 === 1; // Active first
  }
  if (r.autoWinner === "My") {
    return shiftNum % 2 === 0; // Inactive first
  }
  // Opponent won auto
  return shiftNum % 2 === 1; // Active first
}

function currentTeleopHubStatus() {
  const idx = state.teleopSegmentIndex;
  if (idx === 0) return "Active";
  if (idx >= 1 && idx <= 4) return isMyHubActiveForShift(idx) ? "Active" : "Inactive";
  return "Active"; // End Game
}

function render() {
  const app = document.getElementById("app");
  app.innerHTML = "";

  const step = state.step;
  if (step === "setup") return showSetup(app);
  if (step === "auto") return showAuto(app);
  if (step === "autoResult") return showAutoResult(app);
  if (step === "teleop") return showTeleop(app);
  if (step === "endgame") return showEndgame(app);
  if (step === "review") return showReview(app);
}

function card(title, innerHtml) {
  const div = document.createElement("div");
  div.className = "card";
  div.innerHTML = `<div class="big">${title}</div>${innerHtml || ""}`;
  return div;
}

function counterRow(label, value, onInc, onDec, hint) {
  const wrap = document.createElement("div");
  wrap.className = "counter";
  wrap.innerHTML = `
    <div>
      <div class="big">${label}</div>
      <div class="hint">${hint || ""}</div>
    </div>
    <div class="val">${value}</div>
    <div class="counterBtns">
      <button class="bad" type="button">−</button>
      <button class="good" type="button">+</button>
    </div>
  `;
  const [decBtn, incBtn] = wrap.querySelectorAll("button");
  decBtn.onclick = onDec;
  incBtn.onclick = onInc;
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

  rememberFooterButtons();

  c.querySelector("#startAuto").onclick = ()=>{
    state.step = "auto";
    render();
  };
  c.querySelector("#reset").onclick = ()=>{
    state.record = newBlankRecord();
    render();
  };
}

function showAuto(app) {
  const r = state.record;

  const c = card("AUTO (Hub Active)", `
    <div style="margin-top:8px" class="pill">Count FUEL scored by this robot in AUTO (both hubs active).</div>
  `);
  c.appendChild(counterRow(
    "AUTO Fuel",
    r.autoFuel,
    ()=>{ r.autoFuel = clampNonNeg(r.autoFuel + 1); render(); },
    ()=>{ r.autoFuel = clampNonNeg(r.autoFuel - 1); render(); },
    "Each fuel through the hub (your best estimate)."
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

  rememberFooterButtons();
}

function showAutoResult(app) {
  const r = state.record;

  const c = card("AUTO Result → Shift Order", `
    <div style="margin-top:8px" class="pill">
      Who scored MORE fuel in AUTO? (Determines who goes inactive first in Shift 1.)
    </div>

    <div class="btnRow3">
      <button class="good" id="myWin" type="button">My Alliance</button>
      <button class="warn" id="tie" type="button">Tie</button>
      <button class="bad" id="oppWin" type="button">Opponent</button>
    </div>

    <div style="margin-top:12px" class="pill">
      Optional override (simpler in stands):
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
    state.step="teleop";
    render();
  };

  rememberFooterButtons();
}

function showTeleop(app) {
  const r = state.record;
  const seg = TELEOP_SEGMENTS[state.teleopSegmentIndex];
  const hubStatus = currentTeleopHubStatus();

  const bannerColor = hubStatus === "Active" ? "good" : "bad";

  const c = card(`TELEOP: ${seg.label}`, `
    <div class="pill">Your HUB is: <b class="${hubStatus === "Active" ? "" : ""}">${hubStatus}</b></div>
    <div class="pill" style="margin-left:8px">Segment ${state.teleopSegmentIndex+1} of ${TELEOP_SEGMENTS.length}</div>
    <div style="height:10px"></div>
    <button class="${bannerColor}" type="button" style="width:100%; font-size:22px; padding:18px">
      ${hubStatus === "Active" ? "ACTIVE (fuel counts)" : "INACTIVE (fuel = 0 pts)"} 
    </button>
  `);

  // Counters:
  if (hubStatus === "Active") {
    c.appendChild(counterRow(
      "Teleop Fuel (Active)",
      r.teleopFuelActive,
      ()=>{ r.teleopFuelActive = clampNonNeg(r.teleopFuelActive + 1); render(); },
      ()=>{ r.teleopFuelActive = clampNonNeg(r.teleopFuelActive - 1); render(); },
      "Use +/− as fuel goes in."
    ));
  } else {
    c.appendChild(counterRow(
      "Teleop Fuel (Inactive)",
      r.teleopFuelInactive,
      ()=>{ r.teleopFuelInactive = clampNonNeg(r.teleopFuelInactive + 1); render(); },
      ()=>{ r.teleopFuelInactive = clampNonNeg(r.teleopFuelInactive - 1); render(); },
      "Still record for performance (but worth 0 points)."
    ));
  }

  const nav = document.createElement("div");
  nav.className = "btnRow";
  nav.innerHTML = `
    <button type="button" confirm="0" id="prev">Prev Segment</button>
    <button class="primary" type="button" id="next">${state.teleopSegmentIndex === TELEOP_SEGMENTS.length-1 ? "Endgame →" : "Next Segment →"}</button>
  `;
  nav.querySelector("#prev").onclick = ()=>{
    if (state.teleopSegmentIndex === 0) { state.step="autoResult"; render(); return; }
    state.teleopSegmentIndex--;
    render();
  };
  nav.querySelector("#next").onclick = ()=>{
    if (state.teleopSegmentIndex === TELEOP_SEGMENTS.length-1) {
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
  rememberFooterButtons();
}

function showEndgame(app) {
  const r = state.record;

  const c = card("End Game", `
    <div class="pill">Record what happened at the end.</div>

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

    <div style="margin-top:12px">
      <label>Notes</label>
      <textarea id="notes" placeholder="Fast cycles? defense? breakdown?">${escapeHtml(r.notes)}</textarea>
    </div>

    <div class="btnRow" style="margin-top:14px">
      <button type="button" id="back">Back</button>
      <button class="primary" type="button" id="review">Review / Save →</button>
    </div>
  `);

  app.appendChild(c);

  c.querySelector("#climb").onchange = (e)=> r.endgameClimb = e.target.value;
  c.querySelector("#scoredNoClimb").onchange = (e)=> r.endgameScoredNoClimb = !!e.target.checked;
  c.querySelector("#notes").oninput = (e)=> r.notes = e.target.value;

  c.querySelector("#back").onclick = ()=>{ state.step="teleop"; render(); };
  c.querySelector("#review").onclick = ()=>{ state.step="review"; render(); };

  rememberFooterButtons();
}

function showReview(app) {
  const r = state.record;

  const summary = `
    <div class="pill">Event: <b>${escapeHtml(r.event||"—")}</b></div>
    <div class="pill" style="margin-left:8px">Match: <b>${escapeHtml(r.matchNumber||"—")}</b></div>
    <div class="pill" style="margin-left:8px">Team: <b>${escapeHtml(r.teamNumber||"—")}</b> (${escapeHtml(r.alliance)})</div>

    <div style="height:10px"></div>

    <div class="card" style="margin-top:12px">
      <div class="big">Counts</div>
      <div style="margin-top:8px" class="pill">AUTO Fuel: <b>${r.autoFuel}</b></div>
      <div style="margin-top:8px" class="pill">TELEOP Fuel (Active): <b>${r.teleopFuelActive}</b></div>
      <div style="margin-top:8px" class="pill">TELEOP Fuel (Inactive): <b>${r.teleopFuelInactive}</b></div>
      <div style="margin-top:8px" class="pill">Endgame Climb: <b>${escapeHtml(r.endgameClimb)}</b></div>
      <div style="margin-top:8px" class="pill">Endgame scored-no-climb: <b>${r.endgameScoredNoClimb ? "Yes" : "No"}</b></div>
    </div>

    <div class="card">
      <div class="big">Notes</div>
      <div style="color:var(--muted); margin-top:6px; white-space:pre-wrap">${escapeHtml(r.notes||"—")}</div>
    </div>
  `;

  const c = card("Review", summary);

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

    // Prep for next match quickly
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
  rememberFooterButtons();
}

// --- Export / Wipe ---
function recordsToCsv(records) {
  const header = [
    "createdAt","event","matchNumber","scoutName","alliance","teamNumber",
    "autoFuel","autoWinner","activeFirstOverride",
    "teleopFuelActive","teleopFuelInactive",
    "endgameClimb","endgameScoredNoClimb","notes"
  ];
  const escape = (v) => `"${String(v ?? "").replaceAll('"','""')}"`;
  const rows = [header.join(",")];
  for (const r of records) {
    rows.push(header.map((k)=> escape(r[k])).join(","));
  }
  return rows.join("\n");
}

async function shareOrDownload(filename, blob) {
  const file = new File([blob], filename, { type: blob.type });

  // iOS Share Sheet (AirDrop) if available
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: filename });
    return;
  }

  // Fallback: standard download (then share from Files)
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function rememberFooterButtons() {
  // Footer buttons are fixed; attach once safely
  const btnExport = document.getElementById("btnExport");
  const btnWipe = document.getElementById("btnWipe");

  btnExport.onclick = async ()=>{
    const records = loadRecords();
    if (!records.length) return alert("No saved data yet.");

    const stamp = new Date().toISOString().replaceAll(":","-").slice(0,19);
    const jsonBlob = new Blob([JSON.stringify(records, null, 2)], { type: "application/json" });
    const csvBlob = new Blob([recordsToCsv(records)], { type: "text/csv" });

    try {
      // Offer JSON first; CSV second
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

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

// Initial render
render();
