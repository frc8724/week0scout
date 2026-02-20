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
  if (seg.hubStatus !
