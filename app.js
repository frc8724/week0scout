// REBUILT Week 0 Scout
const LS_KEY = "rebuildt_scout_records_v4";

function loadRecords(){try{return JSON.parse(localStorage.getItem(LS_KEY)||"[]")}catch{return[]}}
function saveRecords(r){localStorage.setItem(LS_KEY,JSON.stringify(r))}
function clampNonNeg(n){return Math.max(0,n|0)}
function clamp1to5(n){return Math.min(5,Math.max(1,n|0))}
function nowIso(){return new Date().toISOString()}

const TELEOP_SEGMENTS=[
  {key:"TRANSITION",label:"Transition Shift"},
  {key:"SHIFT1",label:"Shift 1"},
  {key:"SHIFT2",label:"Shift 2"},
  {key:"SHIFT3",label:"Shift 3"},
  {key:"SHIFT4",label:"Shift 4"},
  {key:"ENDGAME",label:"End Game"}
];

const INACTIVE_ACTIVITY_OPTIONS=[
  "Something","Played defense","Picked up fuel","Passed","Herded","Hoarded"
];

const state={
  step:"setup",
  record:newBlankRecord(),
  teleopSegmentIndex:0
};

function newBlankRecord(){
  return{
    createdAt:nowIso(),
    event:"",matchNumber:"",scoutName:"",
    alliance:"Red",teamNumber:"",
    autoFuel:0,
    autoWinner:"Unknown",
    activeFirstOverride:"Auto",
    teleop:TELEOP_SEGMENTS.map(()=>({
      hubStatus:"Unknown",
      activeFuel:0,
      activeCycles:0,
      activeAccuracy:3,
      inactiveActivity:"Something"
    })),
    endgameClimb:"None",
    endgameScoredNoClimb:false,
    defenseRating:3,
    robotRating:3,
    driverRating:3,
    notes:""
  };
}

function isMyHubActiveForShift(n){
  const r=state.record;
  if(r.activeFirstOverride==="ActiveFirst")return n%2===1;
  if(r.activeFirstOverride==="InactiveFirst")return n%2===0;
  if(r.autoWinner==="My")return n%2===0;
  return n%2===1;
}

function currentTeleopHubStatus(){
  const i=state.teleopSegmentIndex;
  if(i===0||i===5)return"Active";
  return isMyHubActiveForShift(i)?"Active":"Inactive";
}

function maybeReset(i){
  const seg=state.record.teleop[i];
  const status=currentTeleopHubStatus();
  if(seg.hubStatus!==status){
    seg.hubStatus=status;
    if(status==="Active"){
      seg.activeFuel=0;
      seg.activeCycles=0;
    }
  }
}

function render(){
  const app=document.getElementById("app");
  app.innerHTML="";
  if(state.step==="setup")showSetup(app);
  if(state.step==="auto")showAuto(app);
  if(state.step==="autoResult")showAutoResult(app);
  if(state.step==="teleop")showTeleop(app);
  if(state.step==="endgame")showEndgame(app);
  if(state.step==="review")showReview(app);
}

function card(t,h=""){
  const d=document.createElement("div");
  d.className="card";
  d.innerHTML=`<div class="big">${t}</div>${h}`;
  return d;
}

function counterRow3(label,value,onM,onP,onP5,hint){
  const w=document.createElement("div");
  w.className="counter";
  w.innerHTML=`
    <div style="flex:1">
      <div class="big">${label}</div>
      <div class="pill">${hint||""}</div>
    </div>
    <div class="val">${value}</div>
    <div class="counterBtns">
      <button class="bad">-1</button>
      <button>+1</button>
      <button class="good">+5</button>
    </div>`;
  const[b1,b2,b3]=w.querySelectorAll("button");
  b1.onclick=onM;b2.onclick=onP;b3.onclick=onP5;
  return w;
}

function counterRow2(label,value,onM,onP,hint){
  const w=document.createElement("div");
  w.className="counter";
  w.innerHTML=`
    <div style="flex:1">
      <div class="big">${label}</div>
      <div class="pill">${hint||""}</div>
    </div>
    <div class="val">${value}</div>
    <div class="counterBtns">
      <button class="bad">-1</button>
      <button class="good">+1</button>
    </div>`;
  const[b1,b2]=w.querySelectorAll("button");
  b1.onclick=onM;b2.onclick=onP;
  return w;
}

function ratingRow(label,value,onChange){
  const w=document.createElement("div");
  w.className="counter";
  w.innerHTML=`
    <div style="flex:1">
      <div class="big">${label}</div>
    </div>
    <div class="val">${value}</div>
    <div style="min-width:200px">
      <input type="range" min="1" max="5" value="${value}">
    </div>`;
  const s=w.querySelector("input");
  s.oninput=e=>onChange(clamp1to5(e.target.value));
  return w;
}

/* ---------- Screens ---------- */

function showSetup(app){
  const r=state.record;
  const c=card("Match Setup",`
  <div class="row" style="margin-top:12px">
    <div><label>Event</label><input id="event" value="${r.event}"></div>
    <div><label>Match #</label><input id="match" value="${r.matchNumber}"></div>
    <div><label>Scout</label><input id="scout" value="${r.scoutName}"></div>
    <div><label>Team #</label><input id="team" value="${r.teamNumber}"></div>
    <div>
      <label>Alliance</label>
      <select id="alliance">
        <option ${r.alliance==="Red"?"selected":""}>Red</option>
        <option ${r.alliance==="Blue"?"selected":""}>Blue</option>
      </select>
    </div>
  </div>
  <div style="margin-top:14px">
    <button class="primary" id="start">Start AUTO</button>
  </div>
  `);
  app.appendChild(c);

  c.querySelector("#event").oninput=e=>r.event=e.target.value;
  c.querySelector("#match").oninput=e=>r.matchNumber=e.target.value;
  c.querySelector("#scout").oninput=e=>r.scoutName=e.target.value;
  c.querySelector("#team").oninput=e=>r.teamNumber=e.target.value;
  c.querySelector("#alliance").onchange=e=>r.alliance=e.target.value;
  c.querySelector("#start").onclick=()=>{state.step="auto";render();};
  wireFooter();
}

function showAuto(app){
  const r=state.record;
  const c=card("AUTO (Hub Active)");
  c.appendChild(counterRow3("AUTO Fuel",r.autoFuel,
    ()=>{r.autoFuel=clampNonNeg(r.autoFuel-1);render()},
    ()=>{r.autoFuel=clampNonNeg(r.autoFuel+1);render()},
    ()=>{r.autoFuel=clampNonNeg(r.autoFuel+5);render()},
    "Estimate is fine"
  ));
  const b=document.createElement("button");
  b.className="primary";
  b.innerText="Auto Result →";
  b.onclick=()=>{state.step="autoResult";render();};
  c.appendChild(b);
  app.appendChild(c);
  wireFooter();
}

function showAutoResult(app){
  const r=state.record;
  const c=card("AUTO Result");
  c.innerHTML+=`
  <div class="pill">Who won AUTO?</div>
  <div>
    <button id="my">My Alliance</button>
    <button id="opp">Opponent</button>
    <button id="tie">Tie</button>
  </div>
  <div style="margin-top:12px">
    <button class="primary" id="go">Start TELEOP →</button>
  </div>
  `;
  app.appendChild(c);
  c.querySelector("#my").onclick=()=>{r.autoWinner="My";render()};
  c.querySelector("#opp").onclick=()=>{r.autoWinner="Opponent";render()};
  c.querySelector("#tie").onclick=()=>{r.autoWinner="Tie";render()};
  c.querySelector("#go").onclick=()=>{state.teleopSegmentIndex=0;maybeReset(0);state.step="teleop";render();};
  wireFooter();
}

function showTeleop(app){
  const i=state.teleopSegmentIndex;
  maybeReset(i);
  const r=state.record;
  const seg=r.teleop[i];
  const status=currentTeleopHubStatus();

  const c=card("TELEOP: "+TELEOP_SEGMENTS[i].label,
    `<div class="pill">Hub: <b>${status}</b></div>`);

  if(status==="Active"){
    c.appendChild(counterRow3("Fuel (segment)",seg.activeFuel,
      ()=>{seg.activeFuel=clampNonNeg(seg.activeFuel-1);render()},
      ()=>{seg.activeFuel=clampNonNeg(seg.activeFuel+1);render()},
      ()=>{seg.activeFuel=clampNonNeg(seg.activeFuel+5);render()},
      "Resets each active segment"
    ));
    c.appendChild(counterRow2("Cycles (segment)",seg.activeCycles,
      ()=>{seg.activeCycles=clampNonNeg(seg.activeCycles-1);render()},
      ()=>{seg.activeCycles=clampNonNeg(seg.activeCycles+1);render()},
      "No +5 for cycles"
    ));
    c.appendChild(ratingRow("Accuracy (1-5)",seg.activeAccuracy,
      v=>{seg.activeAccuracy=v;render()}));
  }else{
    const w=document.createElement("div");
    w.className="counter";
    w.innerHTML=`
      <div style="flex:1">
        <div class="big">Inactive Activity</div>
      </div>
      <select id="act">
        ${INACTIVE_ACTIVITY_OPTIONS.map(o=>`<option ${seg.inactiveActivity===o?"selected":""}>${o}</option>`).join("")}
      </select>`;
    w.querySelector("#act").onchange=e=>seg.inactiveActivity=e.target.value;
    c.appendChild(w);
  }

  const next=document.createElement("button");
  next.className="primary";
  next.innerText=i===5?"Endgame →":"Next →";
  next.onclick=()=>{
    if(i===5){state.step="endgame";}
    else{state.teleopSegmentIndex++;}
    render();
  };
  c.appendChild(next);

  app.appendChild(c);
  wireFooter();
}

function showEndgame(app){
  const r=state.record;
  const c=card("End Game");

  c.innerHTML+=`
  <div>
    <label>Climb</label>
    <select id="climb">
      <option ${r.endgameClimb==="None"?"selected":""}>None</option>
      <option ${r.endgameClimb==="L1"?"selected":""}>L1</option>
      <option ${r.endgameClimb==="L2"?"selected":""}>L2</option>
      <option ${r.endgameClimb==="L3"?"selected":""}>L3</option>
    </select>
  </div>
  <label><input type="checkbox" id="scored" ${r.endgameScoredNoClimb?"checked":""}> Scored but did not climb</label>
  `;
  app.appendChild(c);

  c.querySelector("#climb").onchange=e=>r.endgameClimb=e.target.value;
  c.querySelector("#scored").onchange=e=>r.endgameScoredNoClimb=e.target.checked;

  c.appendChild(ratingRow("Defense Rating",r.defenseRating,v=>{r.defenseRating=v;render()}));
  c.appendChild(ratingRow("Robot Rating",r.robotRating,v=>{r.robotRating=v;render()}));
  c.appendChild(ratingRow("Driver Rating",r.driverRating,v=>{r.driverRating=v;render()}));

  const b=document.createElement("button");
  b.className="primary";
  b.innerText="Review →";
  b.onclick=()=>{state.step="review";render();};
  c.appendChild(b);

  wireFooter();
}

function showReview(app){
  const r=state.record;
  const c=card("Review");
  c.innerHTML+=`<div class="pill">Team ${r.teamNumber} Match ${r.matchNumber}</div>`;
  const save=document.createElement("button");
  save.className="good";
  save.innerText="Save Match";
  save.onclick=()=>{
    const recs=loadRecords();
    recs.push({...r});
    saveRecords(recs);
    state.record=newBlankRecord();
    state.step="setup";
    alert("Saved!");
    render();
  };
  c.appendChild(save);
  app.appendChild(c);
  wireFooter();
}

/* -------- CSV Export Only -------- */

function recordsToCsv(records){
  const header=["event","matchNumber","teamNumber","autoFuel","defenseRating","robotRating","driverRating"];
  const rows=[header.join(",")];
  records.forEach(r=>{
    rows.push([r.event,r.matchNumber,r.teamNumber,r.autoFuel,r.defenseRating,r.robotRating,r.driverRating].join(","));
  });
  return rows.join("\n");
}

async function shareOrDownload(filename,blob){
  const file=new File([blob],filename,{type:blob.type});
  if(navigator.canShare&&navigator.canShare({files:[file]})){
    await navigator.share({files:[file],title:filename});
    return;
  }
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;a.download=filename;a.click();
  URL.revokeObjectURL(url);
}

function wireFooter(){
  document.getElementById("btnExport").onclick=async()=>{
    const records=loadRecords();
    if(!records.length)return alert("No saved data.");
    const stamp=new Date().toISOString().slice(0,19).replaceAll(":","-");
    const blob=new Blob([recordsToCsv(records)],{type:"text/csv"});
    await shareOrDownload(`rebuildt_scout_${stamp}.csv`,blob);
  };
  document.getElementById("btnWipe").onclick=()=>{
    if(confirm("Wipe all data?")){
      localStorage.removeItem(LS_KEY);
      alert("Cleared.");
    }
  };
}

render();
