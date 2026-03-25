/**
 * DefSpace v6 — Mission Engine: 20 Scenarios, 22 Countermeasures, Scoring
 */
"use strict";

const MissionLog = {
  _log:[], _max:5000,
  record(level, cat, msg, data={}) {
    const e={id:this._log.length, ts:Date.now(), simTime:MissionState.simTime, level, category:cat, msg, data};
    this._log.push(e); if(this._log.length>this._max) this._log.shift();
    const m={INFO:"log",WARN:"warn",ALERT:"warn",CRITICAL:"error"}[level]||"log";
    console[m](`[${level}][${cat}]`,msg,data||"");
    window.dispatchEvent(new CustomEvent("ds:log",{detail:e}));
    return e;
  },
  info:     (c,m,d)=>MissionLog.record("INFO",    c,m,d),
  warn:     (c,m,d)=>MissionLog.record("WARN",    c,m,d),
  alert:    (c,m,d)=>MissionLog.record("ALERT",   c,m,d),
  critical: (c,m,d)=>MissionLog.record("CRITICAL",c,m,d),
  getAll:   ()=>[...MissionLog._log],
  getLast:  (n=50)=>MissionLog._log.slice(-n),
  clear:    ()=>{MissionLog._log=[];},
  export:   ()=>JSON.stringify(MissionLog._log,null,2),
};

const MissionState = {
  simTime:0, running:false, speed:1,
  activeScenario:null, selectedAsset:"ISS",
  score:100, dvBudget:{used:0,total:500},
  threats:[], activeCMs:[], cmCooldowns:{},
  conjunctions:[], objectives:[], objectiveStatus:{},
  timeline:[], instructorMode:false, paused:false, startWallTime:null,
};

const SCENARIOS=[
  {id:1,name:"Kessler Cascade — SL-16 Fragmentation",type:"DEBRIS",difficulty:"MED",duration:600,
   doctrine:["ISRO SSA Conjunction Management Protocol Rev-3","IADC Space Debris Mitigation Guidelines 2002"],
   description:"SL-16 rocket body (NORAD 25260) has fragmented in 71° LEO. Debris cloud expanding. Multiple ISS conjunction threats within 90 min.",
   objectives:[
     {id:"O1",text:"Compute conjunction Pc for all asset pairs",points:15},
     {id:"O2",text:"Execute evasive manoeuvre if Pc > 1e-4",points:25},
     {id:"O3",text:"Protect CARTOSAT-3 from debris intersection",points:20},
     {id:"O4",text:"Notify ground stations Hassan + Bangalore",points:10},
     {id:"O5",text:"File SSA conjunction report within 10 sim-minutes",points:30},
   ],
   threats:[
     {t:0,  type:"DEBRIS_FRAG",asset:"SL16",      severity:"HIGH",    msg:"SL-16 FRAGMENTATION — 847 fragments, Δv 0–500m/s"},
     {t:90, type:"CONJUNCTION", asset:"ISS",       severity:"CRITICAL",msg:"ISS TCA 23min, Pc=8.3e-4 — ABOVE RED THRESHOLD"},
     {t:180,type:"CONJUNCTION", asset:"CARTOSAT3", severity:"HIGH",    msg:"CARTOSAT-3 debris risk, Pc=2.1e-4"},
     {t:420,type:"CONJUNCTION", asset:"RISAT2B",   severity:"MED",     msg:"RISAT-2B secondary conjunction, Pc=3.8e-5"},
   ],
   fragEvent:{mass_kg:9000,type:"explosion"}},

  {id:2,name:"Electronic Warfare: Uplink Denial",type:"JAMMING",difficulty:"HIGH",duration:480,
   doctrine:["DSA Electronic Warfare Standing Orders (EWSO) §4.2"],
   description:"Hostile ground station broadcasting wideband jamming on S-band uplink for IRNSS-1A/1B. Uplink BER degrading.",
   objectives:[
     {id:"O1",text:"Detect and characterise jamming signal",points:15},
     {id:"O2",text:"Activate FHSS frequency hopping on affected assets",points:30},
     {id:"O3",text:"Switch to backup uplink station",points:20},
     {id:"O4",text:"Maintain NavIC navigation continuity > 95%",points:35},
   ],
   threats:[
     {t:0,  type:"JAMMING",asset:"IRNSS_1A",severity:"HIGH",    msg:"S-band uplink jamming — BER degraded 1e-9→1e-3"},
     {t:60, type:"JAMMING",asset:"IRNSS_1B",severity:"HIGH",    msg:"IRNSS-1B uplink jammed — NavIC integrity compromised"},
     {t:240,type:"JAMMING",asset:"IRNSS_1C",severity:"MED",     msg:"Spillover jamming IRNSS-1C — spread spectrum recommended"},
   ]},

  {id:3,name:"ASAT Engagement — DA-ASAT + Co-orbital",type:"ASAT",difficulty:"HIGH",duration:900,
   doctrine:["NSCS Space Contingency Response Framework"],
   description:"DA-ASAT launch detected 39.8°N 75.4°E. Co-orbital inspector at GEO approaching IRNSS-1C aggressively.",
   objectives:[
     {id:"O1",text:"Track and characterise DA-ASAT trajectory",points:20},
     {id:"O2",text:"Execute IRNSS-1C evasive manoeuvre before intercept",points:35},
     {id:"O3",text:"Activate EMCON on all affected assets",points:15},
     {id:"O4",text:"Alert NSCS Space Situation Room",points:15},
     {id:"O5",text:"Assess post-event debris field",points:15},
   ],
   threats:[
     {t:0,  type:"ASAT_LAUNCH",asset:"IRNSS_1C",severity:"CRITICAL",msg:"DA-ASAT LAUNCH — intercept T+18min, IRNSS-1C probable"},
     {t:300,type:"COORBITAL",  asset:"IRNSS_1C",severity:"HIGH",    msg:"Co-orbital inspector 2.1km, approach 3m/s"},
     {t:600,type:"LASER_DAZZLE",asset:"CARTOSAT3",severity:"MED",   msg:"CARTOSAT-3 sensor dazzling — imaging degraded"},
   ]},

  {id:4,name:"Solar Storm Alpha — X2.4 Flare + CME",type:"SPACE_WEATHER",difficulty:"LOW",duration:720,
   doctrine:["NDMA Satellite Reentry Emergency Protocol"],
   description:"AR3456 X2.4 flare at 14:23 UTC. CME Bt=-18nT expected T+48h. Dst forecast -180nT.",
   objectives:[
     {id:"O1",text:"Enter shield mode on radiation-sensitive payloads",points:20},
     {id:"O2",text:"Slew CARTOSAT-3 payload away from solar direction",points:20},
     {id:"O3",text:"Compute atmospheric drag increase for LEO assets",points:25},
     {id:"O4",text:"Issue geomagnetic storm warning to ground ops",points:15},
     {id:"O5",text:"Monitor radiation belt enhancement",points:20},
   ],
   threats:[
     {t:0,  type:"SOLAR_FLARE",asset:"ALL",      severity:"MED", msg:"X2.4 SOLAR FLARE — EUV enhancement, GPS errors expected"},
     {t:120,type:"RADIATION",   asset:"CARTOSAT3",severity:"HIGH",msg:"SEP flux above threshold — payload safe mode recommended"},
     {t:300,type:"GEOMAGNETIC", asset:"ALL",      severity:"HIGH",msg:"CME ARRIVAL — Kp=7.3, G3 storm, drag +40% LEO"},
   ],
   spaceWeatherEvent:{Kp:7.3,F107:220,magnitude:2.4}},

  {id:5,name:"Cyber Intrusion — Ground Segment Compromise",type:"CYBER",difficulty:"HIGH",duration:540,
   doctrine:["NTRO MCF Cyber Hardening Standard MCS-2023"],
   description:"Anomalous commands from Hassan MCF. APT access to mission control network. Suspicious command sequence queued.",
   objectives:[
     {id:"O1",text:"Detect and block unauthorized command sequence",points:30},
     {id:"O2",text:"Isolate compromised ground segment network",points:25},
     {id:"O3",text:"Switch all uplinks to encrypted backup channel",points:20},
     {id:"O4",text:"Initiate AES-256 re-keying on all spacecraft",points:15},
     {id:"O5",text:"Complete NTRO incident report",points:10},
   ],
   threats:[
     {t:0,  type:"CYBER",asset:"CARTOSAT3",severity:"CRITICAL",msg:"UNAUTHORIZED COMMAND — Hassan MCF, suspected APT"},
     {t:60, type:"CYBER",asset:"RISAT2B",  severity:"HIGH",    msg:"RISAT-2B command auth bypass attempted"},
     {t:240,type:"CYBER",asset:"IRNSS_1A", severity:"MED",     msg:"NavIC nav message spoof attempt"},
   ]},

  {id:6,name:"Directed Energy: Laser Dazzling",type:"LASER",difficulty:"MED",duration:420,
   doctrine:["DSA Electronic Warfare Standing Orders (EWSO) §4.2"],
   description:"CARTOSAT-3 imaging payload showing saturation consistent with ground-based laser dazzling in 72°E–84°E corridor.",
   objectives:[
     {id:"O1",text:"Detect and confirm laser dazzling signature",points:20},
     {id:"O2",text:"Slew payload to avoid continued dazzling",points:30},
     {id:"O3",text:"Assess permanent damage vs temporary saturation",points:25},
     {id:"O4",text:"Document event for EWSO §4.2 reporting",points:25},
   ],
   threats:[
     {t:0,  type:"LASER",asset:"CARTOSAT3",severity:"HIGH",    msg:"LASER DAZZLE — sensor saturation, 532nm green laser"},
     {t:180,type:"LASER",asset:"CARTOSAT3",severity:"CRITICAL",msg:"ESCALATION — sustained dazzling, damage threshold approaching"},
   ]},

  {id:7,name:"NavIC Constellation Denial",type:"COMBINED_ARMS",difficulty:"EXPERT",duration:900,
   doctrine:["DSA Electronic Warfare Standing Orders (EWSO) §4.2","ISRO SSA Conjunction Management Protocol Rev-3"],
   description:"Full-spectrum NavIC attack: L5 jamming, co-orbital inspection of IRNSS-1C, cyber intrusion on Port Blair uplink.",
   objectives:[
     {id:"O1",text:"Maintain NavIC PNT accuracy for >3 of 7 visible SVs",points:25},
     {id:"O2",text:"Counter all three simultaneous threat vectors",points:30},
     {id:"O3",text:"Issue NOTAM for GPS/NavIC degradation Indian FIR",points:20},
     {id:"O4",text:"Execute QKD re-keying on uplink chain",points:25},
   ],
   threats:[
     {t:0,  type:"JAMMING",  asset:"IRNSS_1A",severity:"CRITICAL",msg:"L5 jamming — IRNSS-1A signal denial"},
     {t:0,  type:"JAMMING",  asset:"IRNSS_1B",severity:"CRITICAL",msg:"L5 jamming — IRNSS-1B signal denial"},
     {t:60, type:"COORBITAL",asset:"IRNSS_1C",severity:"HIGH",    msg:"Co-orbital inspector 800m, closing 1.2m/s"},
     {t:120,type:"CYBER",    asset:"IRNSS_1C",severity:"HIGH",    msg:"Port Blair uplink anomaly — possible intrusion"},
   ]},

  {id:8,name:"Uncontrolled Reentry — Nuclear-Powered Satellite",type:"REENTRY",difficulty:"HIGH",duration:720,
   doctrine:["NDMA Satellite Reentry Emergency Protocol","IADC Space Debris Mitigation Guidelines 2002"],
   description:"Foreign RTG satellite decaying. 6h reentry window, footprint includes Bay of Bengal.",
   objectives:[
     {id:"O1",text:"Compute reentry corridor ±3hr uncertainty window",points:20},
     {id:"O2",text:"Issue NDMA reentry alert for affected regions",points:20},
     {id:"O3",text:"Coordinate with maritime and aviation authorities",points:20},
     {id:"O4",text:"Track surviving fragments to impact",points:25},
     {id:"O5",text:"Provide radiological contamination assessment",points:15},
   ],
   threats:[
     {t:0,  type:"REENTRY",asset:"COSMOS",severity:"HIGH",    msg:"UNCONTROLLED REENTRY — RTG satellite, perigee 112km"},
     {t:300,type:"REENTRY",asset:"COSMOS",severity:"CRITICAL",msg:"REENTRY IMMINENT — 40min, Bay of Bengal confirmed"},
   ]},

  {id:9,name:"Rendezvous & Proximity Ops — Hostile Inspection",type:"PROXIMITY",difficulty:"EXPERT",duration:1080,
   doctrine:["ISRO RPOD Safety Standard ISRO-SAF-3401","NSCS Space Contingency Response Framework"],
   description:"UMO-7734 performing rendezvous with CARTOSAT-3. RPOD within keep-out zone. Suspected intelligence collection.",
   objectives:[
     {id:"O1",text:"Characterise UMO-7734 orbital parameters",points:15},
     {id:"O2",text:"Maintain CARTOSAT-3 keep-out zone ≥500m",points:35},
     {id:"O3",text:"Execute counter-RPOD manoeuvre if KOZ breached",points:25},
     {id:"O4",text:"Activate EMCON — RF silence on CARTOSAT-3",points:15},
     {id:"O5",text:"File NSCS proximity event report",points:10},
   ],
   threats:[
     {t:0,  type:"PROXIMITY",asset:"CARTOSAT3",severity:"HIGH",    msg:"UMO-7734 — 8.3km range, closing 12m/s, RPOD profile"},
     {t:240,type:"PROXIMITY",asset:"CARTOSAT3",severity:"CRITICAL",msg:"KOZ BREACH IMMINENT — UMO-7734 at 420m"},
   ]},

  {id:10,name:"HEMP — High-Altitude Nuclear EMP",type:"EMP",difficulty:"EXPERT",duration:540,
   doctrine:["DRDO EMP Hardening Standard EMP-STD-07"],
   description:"Nuclear detonation at 300km detected. E1 pulse 2000km radius. Ground segments and unprotected spacecraft at risk.",
   objectives:[
     {id:"O1",text:"Activate EMP hardening on all spacecraft",points:25},
     {id:"O2",text:"Switch to radiation-hardened backup processors",points:20},
     {id:"O3",text:"Assess ground station electronics damage",points:20},
     {id:"O4",text:"Implement EMCON across affected assets",points:20},
     {id:"O5",text:"Restore comms via hardened backup within 15min",points:15},
   ],
   threats:[
     {t:0, type:"EMP",asset:"ALL",      severity:"CRITICAL",msg:"HEMP EVENT — 300km detonation, E1/E2/E3, Lucknow at risk"},
     {t:15,type:"EMP",asset:"IRNSS_1A", severity:"CRITICAL",msg:"IRNSS-1A COMMS LOSS — EMP effects"},
   ]},

  {id:11,name:"ISS Emergency Collision Avoidance",type:"DEBRIS",difficulty:"MED",duration:360,
   doctrine:["ISRO SSA Conjunction Management Protocol Rev-3"],
   description:"2025-041C on collision course with ISS. TCA 47min, Pc=1.3e-3. Crew shelter + CAM.",
   objectives:[
     {id:"O1",text:"Verify conjunction data with JSC and CSpOC",points:15},
     {id:"O2",text:"Crew shelter in Soyuz within T-15min",points:25},
     {id:"O3",text:"Execute ISS debris avoidance manoeuvre",points:40},
     {id:"O4",text:"Post-manoeuvre Pc verification < 1e-5",points:20},
   ],
   threats:[{t:0,type:"CONJUNCTION",asset:"ISS",severity:"CRITICAL",msg:"ISS COLLISION WARNING — 2025-041C TCA 47min Pc=1.3e-3"}]},

  {id:12,name:"SIGINT Threat — Foreign ELINT Satellite",type:"SIGINT",difficulty:"MED",duration:480,
   doctrine:["NSCS Space Contingency Response Framework"],
   description:"Foreign ELINT sat in retrograde LEO overflying Hassan, Bangalore, Lucknow MCFs. Command frequency collection.",
   objectives:[
     {id:"O1",text:"Detect and track ELINT satellite overflight windows",points:15},
     {id:"O2",text:"Activate EMCON during overflight windows",points:25},
     {id:"O3",text:"Switch to QKD-secured uplinks for sensitive ops",points:30},
     {id:"O4",text:"File NSCS SIGINT threat assessment",points:30},
   ],
   threats:[
     {t:120,type:"SIGINT",asset:"CARTOSAT3",severity:"MED",msg:"ELINT OVERFLIGHT — Hassan 8min window, RF collection likely"},
     {t:280,type:"SIGINT",asset:"ALL",       severity:"MED",msg:"SECOND PASS — Bangalore 6min window"},
   ]},

  {id:13,name:"Extreme Geomagnetic Storm — Carrington-Class X9.3",type:"SPACE_WEATHER",difficulty:"EXPERT",duration:1200,
   doctrine:["NDMA Satellite Reentry Emergency Protocol","ISRO SSA Conjunction Management Protocol Rev-3"],
   description:"X9.3 flare — most powerful since Carrington 1859. CME T+18hr. Kp=9+, Dst < -500nT.",
   objectives:[
     {id:"O1",text:"Protect all satellites with shield/safe mode",points:20},
     {id:"O2",text:"Compute new decay rates for all LEO assets",points:20},
     {id:"O3",text:"Re-plan 72hr CARTOSAT-3 and RISAT-2B ground track",points:20},
     {id:"O4",text:"Issue national critical infrastructure warning",points:20},
     {id:"O5",text:"Maintain NavIC operational for defence users",points:20},
   ],
   threats:[{t:0,type:"SOLAR_FLARE",asset:"ALL",severity:"CRITICAL",msg:"X9.3 FLARE — CARRINGTON CLASS. All spacecraft at extreme risk."}],
   spaceWeatherEvent:{Kp:9,F107:300,magnitude:9.3}},

  {id:14,name:"Combined Arms Space Attack — Full Spectrum Denial",type:"COMBINED_ARMS",difficulty:"CLASSIFIED",duration:1800,
   doctrine:["NSCS Space Contingency Response Framework","DSA Electronic Warfare Standing Orders (EWSO) §4.2"],
   description:"CLASSIFIED. Simultaneous DA-ASAT, jamming, cyber, laser, co-orbital RPOD. All DSA assets under threat.",
   objectives:[
     {id:"O1",text:"Maintain at least 2 operational NavIC SVs",points:20},
     {id:"O2",text:"Protect CARTOSAT-3 from dual threat (ASAT + RPOD)",points:25},
     {id:"O3",text:"Restore all comms within 30 sim-min of HEMP",points:20},
     {id:"O4",text:"Execute full NSCS contingency protocol",points:20},
     {id:"O5",text:"Zero asset losses — all countermeasures deployed",points:15},
   ],
   threats:[
     {t:0,  type:"JAMMING",    asset:"ALL",      severity:"CRITICAL",msg:"ALL-BAND JAMMING INITIATED"},
     {t:30, type:"ASAT_LAUNCH",asset:"IRNSS_1A", severity:"CRITICAL",msg:"DA-ASAT INBOUND — IRNSS-1A"},
     {t:60, type:"CYBER",      asset:"CARTOSAT3",severity:"CRITICAL",msg:"CYBER INTRUSION — Hassan MCF"},
     {t:90, type:"LASER",      asset:"CARTOSAT3",severity:"HIGH",    msg:"LASER DAZZLE — CARTOSAT-3"},
     {t:120,type:"COORBITAL",  asset:"IRNSS_1C", severity:"CRITICAL",msg:"CO-ORBITAL ATTACK — IRNSS-1C KOZ breach"},
     {t:300,type:"EMP",        asset:"ALL",       severity:"CRITICAL",msg:"HEMP DETONATION — ground segment at risk"},
   ]},

  {id:15,name:"LEO Mega-Constellation Conjunction Crisis",type:"DEBRIS",difficulty:"HIGH",duration:1080,
   doctrine:["IADC Space Debris Mitigation Guidelines 2002","ISRO SSA Conjunction Management Protocol Rev-3"],
   description:">3000 foreign LEO constellation at 550km. Multiple conjunctions per orbit with CARTOSAT-3 and RISAT-2B.",
   objectives:[
     {id:"O1",text:"Process 15+ conjunction warnings within scenario",points:20},
     {id:"O2",text:"Execute manoeuvres for Pc > 1e-4 only — conserve DV",points:30},
     {id:"O3",text:"File ITU interference complaints for affected slots",points:20},
     {id:"O4",text:"Maintain 72hr DV budget below 50m/s",points:30},
   ],
   threats:Array.from({length:12},(_,i)=>({t:i*75+30,type:"CONJUNCTION",asset:i%2?"CARTOSAT3":"RISAT2B",severity:Math.random()>0.7?"HIGH":"MED",msg:`MEGA-CONST CONJ #${i+1} — Pc=${(Math.random()*5e-4).toExponential(2)} TCA ${Math.round(Math.random()*30+5)}min`}))},

  {id:16,name:"GPS Spoofing — Maritime & Aviation Safety Crisis",type:"JAMMING",difficulty:"HIGH",duration:540,
   doctrine:["DSA Electronic Warfare Standing Orders (EWSO) §4.2"],
   description:"GPS spoofing in Arabian Sea and Mumbai FIR. Ships and aircraft reporting false positions.",
   objectives:[
     {id:"O1",text:"Characterise spoofing source location",points:20},
     {id:"O2",text:"Activate GPS Correction Push via NavIC",points:30},
     {id:"O3",text:"Issue NOTAM for Arabian Sea + Mumbai FIR",points:20},
     {id:"O4",text:"Enable Anti-Jam CRPA on NavIC receivers",points:15},
     {id:"O5",text:"Coordinate with DGCA and MMD for advisories",points:15},
   ],
   threats:[
     {t:0,  type:"SPOOFING",asset:"IRNSS_1A",severity:"HIGH",    msg:"GPS SPOOFING ACTIVE — Arabian Sea, Δpos +18km"},
     {t:180,type:"SPOOFING",asset:"ALL",      severity:"CRITICAL",msg:"SPOOFING EXPANDING — Mumbai FIR, 3 aircraft 7 vessels anomalous"},
   ]},

  {id:17,name:"End-of-Life Disposal — IRNSS-1D Propellant Depletion",type:"DEBRIS",difficulty:"LOW",duration:600,
   doctrine:["IADC Space Debris Mitigation Guidelines 2002"],
   description:"IRNSS-1D propellant critically low (2.1kg). Must execute controlled GEO graveyard disposal.",
   objectives:[
     {id:"O1",text:"Compute minimal DV graveyard orbit injection",points:25},
     {id:"O2",text:"Execute passivation burn — vent residual propellant",points:30},
     {id:"O3",text:"Achieve GEO+300km graveyard orbit",points:30},
     {id:"O4",text:"File IADC post-mission disposal report",points:15},
   ],
   threats:[{t:0,type:"PROPELLANT",asset:"IRNSS_1A",severity:"MED",msg:"IRNSS-1D PROPELLANT CRITICAL — 2.1kg, last disposal window"}]},

  {id:18,name:"PSLV-C60 Launch Support — Range Safety Anomaly",type:"COMBINED_ARMS",difficulty:"MED",duration:480,
   doctrine:["NDMA Satellite Reentry Emergency Protocol"],
   description:"PSLV-C60 from SDSC-SHAR. Range safety radar anomaly T+87s. Trajectory deviation 0.3° from nominal.",
   objectives:[
     {id:"O1",text:"Track vehicle trajectory and assess safe corridor",points:20},
     {id:"O2",text:"Clear all tracked assets from launch trajectory",points:25},
     {id:"O3",text:"Coordinate with SDSC-SHAR RSO for FTS decision",points:25},
     {id:"O4",text:"Monitor upper stage for debris generation",points:30},
   ],
   threats:[{t:87,type:"LAUNCH_ANOMALY",asset:"ALL",severity:"HIGH",msg:"PSLV-C60 DEVIATION — T+87s, 0.3° off-nominal, RSO monitoring"}]},

  {id:19,name:"Deep Space Anomaly — Trans-Lunar Injection Failure",type:"REENTRY",difficulty:"EXPERT",duration:900,
   doctrine:["NDMA Satellite Reentry Emergency Protocol","NSCS Space Contingency Response Framework"],
   description:"Chandrayaan-class TLI underperformed 340m/s. Perigee 185km. Reentry within 3 orbits.",
   objectives:[
     {id:"O1",text:"Compute reentry trajectory from 185×384000km orbit",points:20},
     {id:"O2",text:"Assess deep space rescue burn DV feasibility",points:25},
     {id:"O3",text:"Predict reentry corridor ±500km",points:25},
     {id:"O4",text:"Issue reentry warning to affected regions",points:15},
     {id:"O5",text:"Execute rescue burn if DV budget allows",points:15},
   ],
   threats:[{t:0,type:"ANOMALY",asset:"ISS",severity:"CRITICAL",msg:"TLI BURN FAILURE — 340m/s underperform, 185×384000km orbit, reentry T+3 orbits"}]},

  {id:20,name:"Active Debris Removal — Large Derelict Capture",type:"PROXIMITY",difficulty:"HIGH",duration:1200,
   doctrine:["IADC Space Debris Mitigation Guidelines 2002","ISRO RPOD Safety Standard ISRO-SAF-3401"],
   description:"ADR mission: PSLV upper stage (9000kg) in decaying 540km orbit. Servicer performing rendezvous.",
   objectives:[
     {id:"O1",text:"Match servicer orbit to derelict within 1km",points:15},
     {id:"O2",text:"Characterise derelict tumble rate via RPOD approach",points:20},
     {id:"O3",text:"Execute de-tumble within ±2°/s tolerance",points:25},
     {id:"O4",text:"Capture and secure derelict structure",points:25},
     {id:"O5",text:"Execute controlled de-orbit burn, ocean target",points:15},
   ],
   threats:[
     {t:0,  type:"TUMBLE",   asset:"SL16",severity:"MED", msg:"DERELICT TUMBLE — PSLV stage 3.2°/s spin, approach window opening"},
     {t:400,type:"PROXIMITY",asset:"SL16",severity:"HIGH",msg:"CLOSE APPROACH — 50m range, de-tumble required before capture"},
   ]},
];

const COUNTERMEASURES = {
  EVASIVE_BURN:   {id:"EVASIVE_BURN",  name:"Evasive Burn",         category:"MANOEUVRE",  desc:"Impulsive ΔV to increase miss distance.",          cooldown:300, dvCost:8,   successProb:0.92, effectOn:["CONJUNCTION","DEBRIS_FRAG","ASAT_LAUNCH","PROXIMITY"],    doctrine:"ISRO RPOD Safety Standard §3.4"},
  ORBIT_ADJUST:   {id:"ORBIT_ADJUST",  name:"Orbit Adjustment",      category:"MANOEUVRE",  desc:"Hohmann or phasing manoeuvre to change orbit.",    cooldown:600, dvCost:25,  successProb:0.95, effectOn:["CONJUNCTION","PROXIMITY","SIGINT","LASER"],               doctrine:"IADC Guidelines §5.2"},
  EMERGENCY_BOOST:{id:"EMERGENCY_BOOST",name:"Emergency Boost",      category:"MANOEUVRE",  desc:"Max thrust for immediate collision avoidance.",    cooldown:900, dvCost:50,  successProb:0.97, effectOn:["CONJUNCTION","ASAT_LAUNCH","PROXIMITY"],                  doctrine:"ISS CAM protocol / NSCS §7"},
  PASSIVATION_BURN:{id:"PASSIVATION_BURN",name:"Passivation Burn",   category:"MANOEUVRE",  desc:"Vent all residual propellant. IADC EOL compliance.",cooldown:0,  dvCost:0,   successProb:1.0,  effectOn:["PROPELLANT"],                                            doctrine:"IADC 2002 §5.3"},
  DEEP_SPACE_RESCUE:{id:"DEEP_SPACE_RESCUE",name:"Deep Space Rescue",category:"MANOEUVRE",  desc:"Emergency correction burn for failed injection.",  cooldown:600, dvCost:180, successProb:0.78, effectOn:["ANOMALY"],                                                doctrine:"ISRO Mission Rescue Protocol"},
  DETUMBLE_RPOD:  {id:"DETUMBLE_RPOD", name:"De-tumble / RPOD",      category:"MANOEUVRE",  desc:"Robotic de-tumbling and RPOD for ADR/servicing.", cooldown:300, dvCost:12,  successProb:0.82, effectOn:["TUMBLE","PROXIMITY"],                                     doctrine:"ISRO RPOD Safety Standard ISRO-SAF-3401"},
  FHSS:           {id:"FHSS",          name:"Frequency Hopping",      category:"ELECTRONIC", desc:"Spread-spectrum FHSS to defeat narrowband jamming.",cooldown:30,  dvCost:0,   successProb:0.87, effectOn:["JAMMING","SPOOFING"],                                     doctrine:"DSA EWSO §4.2"},
  ANTIJAM_CRPA:   {id:"ANTIJAM_CRPA",  name:"Anti-Jam CRPA",          category:"ELECTRONIC", desc:"Adaptive null steering toward jammer.",           cooldown:60,  dvCost:0,   successProb:0.84, effectOn:["JAMMING","SPOOFING"],                                     doctrine:"DSA EWSO §4.2"},
  NULL_STEER:     {id:"NULL_STEER",    name:"Null Steering",           category:"ELECTRONIC", desc:"Antenna pattern null at interference source.",    cooldown:45,  dvCost:0,   successProb:0.81, effectOn:["JAMMING","SIGINT"],                                       doctrine:"DSA EWSO §4.2"},
  GPS_CORRECTION: {id:"GPS_CORRECTION",name:"GPS Correction Push",    category:"ELECTRONIC", desc:"Broadcast GPS corrections via NavIC.",           cooldown:120, dvCost:0,   successProb:0.91, effectOn:["SPOOFING","JAMMING"],                                     doctrine:"NavIC SBAS augmentation"},
  BACKUP_LINK:    {id:"BACKUP_LINK",   name:"Backup Link",             category:"COMMS",      desc:"Switch to backup ground station or frequency.",  cooldown:60,  dvCost:0,   successProb:0.94, effectOn:["JAMMING","CYBER","EMP","SIGINT"],                         doctrine:"ISRO MCF Contingency Comms SOP"},
  AES256:         {id:"AES256",        name:"AES-256 Encryption",      category:"COMMS",      desc:"Military-grade AES-256-GCM on all channels.",    cooldown:30,  dvCost:0,   successProb:0.98, effectOn:["CYBER","SIGINT"],                                        doctrine:"NTRO MCS-2023 §6"},
  QKD_REKEY:      {id:"QKD_REKEY",    name:"QKD Re-keying",            category:"COMMS",      desc:"Quantum key distribution re-keying.",            cooldown:180, dvCost:0,   successProb:0.96, effectOn:["CYBER","SIGINT"],                                        doctrine:"NTRO MCS-2023 §8"},
  EMCON:          {id:"EMCON",         name:"EMCON Protocol",           category:"COMMS",      desc:"All RF transmissions halted — receive only.",    cooldown:120, dvCost:0,   successProb:0.99, effectOn:["SIGINT","PROXIMITY","ASAT_LAUNCH"],                       doctrine:"DSA EWSO §4.2"},
  SHIELD_MODE:    {id:"SHIELD_MODE",   name:"Shield Mode",              category:"HARDENING",  desc:"Power down payload, orient edge-on to radiation.",cooldown:60, dvCost:0,   successProb:0.88, effectOn:["SOLAR_FLARE","RADIATION","GEOMAGNETIC"],                 doctrine:"ISRO Space Environment SOP"},
  PAYLOAD_SLEW:   {id:"PAYLOAD_SLEW",  name:"Payload Slew",             category:"HARDENING",  desc:"Reorient to protect sensitive payloads.",        cooldown:45,  dvCost:2,   successProb:0.91, effectOn:["LASER","SOLAR_FLARE","RADIATION"],                       doctrine:"ISRO Payload Protection SOP"},
  EMP_HARDENING:  {id:"EMP_HARDENING", name:"EMP Hardening",            category:"HARDENING",  desc:"Rad-hard processors, Faraday shielding.",        cooldown:30,  dvCost:0,   successProb:0.85, effectOn:["EMP"],                                                   doctrine:"DRDO EMP-STD-07"},
  DEBRIS_TRACK:   {id:"DEBRIS_TRACK",  name:"Debris Tracking",          category:"PASSIVE",    desc:"Increase SSA sensor tasking on debris cloud.",   cooldown:60,  dvCost:0,   successProb:1.0,  effectOn:["DEBRIS_FRAG","CONJUNCTION"],                             doctrine:"ISRO SSA Protocol Rev-3 §2"},
  SAFE_MODE:      {id:"SAFE_MODE",     name:"Safe Mode",                 category:"PASSIVE",    desc:"Minimum power, stable attitude, await command.", cooldown:0,   dvCost:0,   successProb:0.97, effectOn:["EMP","SOLAR_FLARE","CYBER","ANOMALY"],                   doctrine:"ISRO FDIR SOP"},
  PASSIVE_MONITOR:{id:"PASSIVE_MONITOR",name:"Passive Monitor",         category:"PASSIVE",    desc:"RF silence, sensor data collection only.",       cooldown:30,  dvCost:0,   successProb:1.0,  effectOn:["SIGINT","PROXIMITY"],                                    doctrine:"NSCS Passive ISR Protocol"},
  REENTRY_PREDICT:{id:"REENTRY_PREDICT",name:"Reentry Prediction",      category:"PASSIVE",    desc:"DRAMA/ORSAT reentry corridor ±3σ analysis.",     cooldown:120, dvCost:0,   successProb:1.0,  effectOn:["REENTRY","PROPELLANT"],                                  doctrine:"NDMA Reentry Protocol §4"},
  NET_ISOLATE:    {id:"NET_ISOLATE",   name:"Network Isolation",         category:"CYBER",      desc:"Air-gap compromised MCF, isolate network.",      cooldown:30,  dvCost:0,   successProb:0.93, effectOn:["CYBER"],                                                 doctrine:"NTRO MCS-2023 §9"},
};

const MissionEngine = {
  _tick: null, _lastTick: 0,

  startScenario(id) {
    const sc=SCENARIOS.find(s=>s.id===id);
    if (!sc) { MissionLog.critical("SCENARIO",`Unknown scenario: ${id}`); return false; }
    Object.assign(MissionState,{
      activeScenario:sc, simTime:0, score:100,
      dvBudget:{used:0,total:500}, threats:[], activeCMs:[],
      cmCooldowns:{}, objectives:[...sc.objectives],
      objectiveStatus:Object.fromEntries(sc.objectives.map(o=>[o.id,"PENDING"])),
      timeline:[], running:true, paused:false, startWallTime:Date.now(),
    });
    sc.threats.forEach(t=>{ delete t._fired; });
    MissionLog.clear();
    MissionLog.info("SCENARIO",`LOADED: [${sc.id}] ${sc.name}`,{type:sc.type,difficulty:sc.difficulty});
    if (sc.spaceWeatherEvent) {
      const {Kp,F107}=sc.spaceWeatherEvent;
      window.DEFSPACE_PHYSICS.SpaceWeather.update(Kp,F107);
    }
    if (sc.fragEvent) {
      const frags=window.DEFSPACE_PHYSICS.NASABreakup.fragment(sc.fragEvent.mass_kg,sc.fragEvent.type);
      MissionLog.alert("SCENARIO",`NASA SBM: ${frags.length} fragments generated`);
    }
    this._startTick();
    window.dispatchEvent(new CustomEvent("ds:scenarioStart",{detail:sc}));
    return true;
  },

  _startTick() {
    if (this._tick) clearInterval(this._tick);
    this._lastTick=Date.now();
    this._tick=setInterval(()=>this._doTick(),100);
  },

  _doTick() {
    if (!MissionState.running||MissionState.paused) return;
    const now=Date.now(), wallDt=(now-this._lastTick)/1000;
    this._lastTick=now;
    const simDt=wallDt*MissionState.speed;
    MissionState.simTime+=simDt;

    for (const t of (MissionState.activeScenario?.threats||[])) {
      if (!t._fired&&MissionState.simTime>=t.t) { t._fired=true; this._inject(t); }
    }
    for (const [k,v] of Object.entries(MissionState.cmCooldowns)) {
      MissionState.cmCooldowns[k]=Math.max(0,v-simDt);
    }
    for (const t of MissionState.threats) {
      if (!t.countered&&t.severity==="CRITICAL") MissionState.score=Math.max(0,MissionState.score-simDt*0.05);
    }
    if (MissionState.activeScenario&&MissionState.simTime>=MissionState.activeScenario.duration) this._end();
    window.dispatchEvent(new CustomEvent("ds:tick",{detail:{simTime:MissionState.simTime,score:MissionState.score}}));
  },

  _inject(t) {
    const to={...t,id:`T${Date.now()}`,injectedAt:MissionState.simTime,countered:false};
    MissionState.threats.push(to);
    MissionState.timeline.push({type:"THREAT",simTime:MissionState.simTime,...t});
    MissionLog.alert("THREAT",t.msg,{type:t.type,asset:t.asset,severity:t.severity});
    window.dispatchEvent(new CustomEvent("ds:threat",{detail:to}));
  },

  deployCM(cmId, assetId) {
    const cm=COUNTERMEASURES[cmId];
    if (!cm) { MissionLog.warn("CM",`Unknown: ${cmId}`); return {ok:false,reason:"unknown_cm"}; }
    if ((MissionState.cmCooldowns[cmId]||0)>0) {
      const r=MissionState.cmCooldowns[cmId].toFixed(0);
      MissionLog.warn("CM",`${cm.name} cooldown ${r}s`);
      return {ok:false,reason:"cooldown",remaining:r};
    }
    const rem=MissionState.dvBudget.total-MissionState.dvBudget.used;
    if (cm.dvCost>rem) { MissionLog.warn("CM",`${cm.name} insufficient DV`); return {ok:false,reason:"insufficient_dv"}; }
    const success=Math.random()<cm.successProb;
    MissionState.cmCooldowns[cmId]=cm.cooldown;
    MissionState.dvBudget.used+=cm.dvCost;
    MissionState.activeCMs.push({cmId,assetId,appliedAt:MissionState.simTime,success});
    const countered=MissionState.threats.filter(t=>!t.countered&&cm.effectOn.includes(t.type)&&(t.asset===assetId||t.asset==="ALL"));
    for (const t of countered) { if(success){t.countered=true;t.counteredBy=cmId;MissionState.score=Math.min(100,MissionState.score+5);} }
    MissionState.timeline.push({type:"CM",simTime:MissionState.simTime,cmId,assetId,success});
    MissionLog.info("CM",`${cm.name} → ${success?"SUCCESS":"DEGRADED"} on ${assetId}`,{dvCost:cm.dvCost,countered:countered.length});
    window.dispatchEvent(new CustomEvent("ds:cm",{detail:{cm,assetId,success}}));
    return {ok:true,success,outcome:success?"SUCCESS":"DEGRADED",cm,countered:countered.length};
  },

  completeObjective(objId) {
    const obj=MissionState.objectives.find(o=>o.id===objId);
    if (!obj||MissionState.objectiveStatus[objId]!=="PENDING") return false;
    MissionState.objectiveStatus[objId]="COMPLETE";
    MissionState.score=Math.min(100,MissionState.score+obj.points*0.2);
    MissionState.timeline.push({type:"OBJECTIVE",simTime:MissionState.simTime,objId,points:obj.points});
    MissionLog.info("SCORE",`Obj ${objId}: ${obj.text} (+${obj.points}pts)`);
    window.dispatchEvent(new CustomEvent("ds:objective",{detail:{obj,status:"COMPLETE"}}));
    return true;
  },

  _end() {
    MissionState.running=false;
    if (this._tick) { clearInterval(this._tick); this._tick=null; }
    const complete=Object.values(MissionState.objectiveStatus).filter(v=>v==="COMPLETE").length;
    const objScore=(complete/MissionState.objectives.length)*100;
    const final=Math.round(MissionState.score*0.5+objScore*0.5);
    const grade=final>=90?"S":final>=75?"A":final>=60?"B":final>=40?"C":"F";
    const report={
      scenario:MissionState.activeScenario.name, finalScore:final, grade,
      objectivesCompleted:complete, objectivesTotal:MissionState.objectives.length,
      dvUsed:MissionState.dvBudget.used, threatsTotal:MissionState.threats.length,
      threatsCountered:MissionState.threats.filter(t=>t.countered).length,
      cmsDeployed:MissionState.activeCMs.length, timeline:MissionState.timeline,
    };
    MissionLog.info("SCORE",`COMPLETE — Score:${final} Grade:${grade}`,report);
    window.dispatchEvent(new CustomEvent("ds:scenarioEnd",{detail:report}));
    return report;
  },

  setSpeed(s)  { MissionState.speed=s; MissionLog.info("SIM",`Speed ${s}×`); },
  pause()      { MissionState.paused=true;  MissionLog.info("SIM","PAUSED"); window.dispatchEvent(new CustomEvent("ds:pause")); },
  resume()     { MissionState.paused=false; this._lastTick=Date.now(); MissionLog.info("SIM","RESUMED"); window.dispatchEvent(new CustomEvent("ds:resume")); },
  instructorInject(type,asset,severity,msg) {
    if (!MissionState.instructorMode) return false;
    this._inject({type,asset,severity,msg,t:MissionState.simTime});
    MissionLog.alert("INSTRUCTOR",`INJECT: ${type} on ${asset}`,{severity,msg});
    return true;
  },
  getState()    { return {...MissionState}; },
  getScenarios(){ return SCENARIOS; },
  getCMs()      { return COUNTERMEASURES; },
  exportDebriefJSON() {
    return JSON.stringify({
      meta:{version:"DefSpace v6",exported:new Date().toISOString()},
      state:MissionState, log:MissionLog.getAll(),
      physicsLog:window.DEFSPACE_PHYSICS?.PhysicsLog?.dump?.()??[],
    },null,2);
  },
};

window.DEFSPACE_MISSION = { SCENARIOS, COUNTERMEASURES, MissionEngine, MissionLog, MissionState };
console.info("[DEFSPACE MISSION] Loaded — scenarios:",SCENARIOS.length,"CMs:",Object.keys(COUNTERMEASURES).length);
