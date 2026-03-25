# DefSpace v6 — DSA Space Contingency Training Simulator
### iDEX PRIME X #9 | Defence Space Agency | ₹10 Crore Grant Build

---

## QUICK START — Vercel Deploy

```bash
# 1. Clone / extract project
cd defspace/

# 2. Deploy to Vercel
npx vercel --prod

# 3. Visit your deployment URL
# https://defspace-XXXXX.vercel.app/defspace-v6.html
```

No npm install needed. No build step. Pure browser JS + Three.js from CDN.

---

## FILE STRUCTURE

```
defspace/
├── defspace-v6.html    ← Main UI (open this in browser)
├── physics.js          ← All physics engines (SGP4, NRLMSISE, IGRF, etc.)
├── mission.js          ← 20 scenarios, 22 countermeasures, mission state
├── tlefetch.js         ← TLE fetcher with fallback chain
├── app.js              ← Three.js globe, UI wiring, main loop
├── api/
│   └── tle.js          ← Vercel serverless proxy for CelesTrak
├── vercel.json         ← Vercel routing config
└── README.md           ← This file
```

---

## PHYSICS ENGINES

| Engine | Standard | File | What it does |
|--------|----------|------|--------------|
| SGP4/SDP4 | Vallado 2013 | `physics.js → SGP4` | Orbital propagation |
| NRLMSISE-00 | Picone 2002 | `physics.js → NRLMSISE` | Atmospheric density |
| IGRF-13 | Alken 2021 | `physics.js → IGRF13` | Earth magnetic field |
| AP-8/AE-8 | Sawyer/Vette | `physics.js → RadBelt` | Radiation belt dose |
| NASA SBM | Johnson 2001 | `physics.js → NASABreakup` | Debris fragmentation |
| J2–J4 + SRP | Montenbruck 2000 | `physics.js → ForceModel` | High-fidelity force model |
| Monte Carlo Pc | Foster 1992 / Alfano 2005 | `physics.js → ConjunctionAnalysis` | Collision probability |
| Hohmann + Phasing | Bate 1971 | `physics.js → ManouvrePlanning` | Delta-V planning |

---

## TLE DATA FALLBACK CHAIN

TLEs are fetched in this order. Each source is tried before falling back:

```
1. /api/tle            → Vercel serverless proxy (no CORS)
2. allorigins.win      → CORS proxy
3. corsproxy.io        → CORS proxy
4. Direct CelesTrak    → May fail in some browsers
5. FROZEN_TLE          → Hardcoded epoch-validated TLEs (always works)
```

Source shown in header: `TLE: LIVE (8) [vercel_proxy]`  
Green = live data. Amber = frozen fallback.

TLEs auto-refresh every **5 minutes**.

---

## DEBUGGING

### Browser Console

All operations log to console. Open DevTools → Console.

```javascript
// Physics log — all SGP4, NRLMSISE, IGRF calls
window.DEFSPACE_PHYSICS.PhysicsLog.dump()

// Mission log — all threats, CMs, objectives, score changes
window.DEFSPACE_MISSION.MissionLog.getAll()

// Get current mission state
window.DEFSPACE_MISSION.MissionEngine.getState()

// Export full debrief JSON (state + all logs)
window.DEFSPACE_MISSION.MissionEngine.exportDebriefJSON()

// TLE epoch age report
window.DEFSPACE_TLE.epochAgeReport()

// Force TLE refresh
window.DEFSPACE_TLE._lastFetch = 0
window.DEFSPACE_TLE.fetchAll()

// Current space weather
window.DEFSPACE_PHYSICS.SpaceWeather.current

// Manually inject a flare
window.DEFSPACE_PHYSICS.SpaceWeather.injectFlare(2.4)

// Run conjunction analysis manually
// (auto-runs every 10s in main loop)

// Propagate a satellite manually
const tle = window.DEFSPACE_TLE._cache["ISS"]
window.DEFSPACE_PHYSICS.SGP4.propagate(tle, 0) // t=0 min from epoch
```

### Log Panel (UI)

Click **LOG** in header (or press `M`) to open the mission log panel. Shows all events with sim-time stamps, categories, and severity levels.

### Exporting Logs

1. Run a scenario to completion (or end it naturally)
2. Debrief modal appears → click **EXPORT JSON LOG**
3. Downloads `defspace-sc{N}-{timestamp}.json`

JSON structure:
```json
{
  "meta": { "version": "DefSpace v6", "exported": "2026-..." },
  "state": { /* full MissionState */ },
  "log": [ /* MissionLog entries */ ],
  "physicsLog": [ /* PhysicsLog entries */ ]
}
```

---

## KNOWN ISSUES & DEBUGGING GUIDE

### TLEs Show "FROZEN"

**Cause:** All 4 live fetch methods failed (CORS, network, server).  
**Debug:**
```javascript
// Check what failed
window.DEFSPACE_TLE.fetchAll().then(r => console.log(r))
```
Check the Vercel Functions log in your Vercel dashboard → Functions tab → `/api/tle`.

**Fix:** Check `api/tle.js` is deployed. Check Vercel function logs. The frozen TLEs are epoch-validated and work offline.

### Globe Shows Black / No Satellites

**Cause:** WebGL not available (old browser, headless).  
**What happens:** Automatic fallback to Canvas 2D flat map. Bottom-left shows "Canvas2D (fallback)".

**Debug:**
```javascript
// Check renderer
document.getElementById("ov-renderer").textContent
```

### Satellites Not Moving

**Cause:** Simulation paused, or TLEs not loaded.  
**Debug:**
```javascript
window.DEFSPACE_MISSION.MissionState.running   // is scenario active?
window.DEFSPACE_MISSION.MissionState.paused    // paused?
Object.keys(window.DEFSPACE_TLE._cache)        // are TLEs loaded?
```

### High Conjunction Pc Not Triggering Alerts

The conjunction analysis runs every 10 seconds in the main loop. The threshold for alert is `Pc > 1e-4`. Check:
```javascript
window.DEFSPACE_PHYSICS.PhysicsLog.dump().filter(e => e.module === "CONJ")
```

### Scenario Score Dropping

Score decays at 0.05pts/sec for each uncountered CRITICAL threat. Deploy CMs to counter threats. Each countered threat stops the decay and adds +5 points.

### Countermeasure Greyed Out

Either on cooldown (see cooldown bar at bottom of CM button) or insufficient DV budget. Check:
```javascript
window.DEFSPACE_MISSION.MissionState.cmCooldowns
window.DEFSPACE_MISSION.MissionState.dvBudget
```

---

## DEPLOYMENT CHECKLIST (Vercel)

- [ ] `vercel.json` present in root
- [ ] `api/tle.js` present (ES module syntax for Vercel Edge/Node)
- [ ] All 5 JS files in same directory as HTML
- [ ] Vercel project created (`npx vercel`)
- [ ] Visit `https://your-deployment.vercel.app/defspace-v6.html`
- [ ] Check header: TLE source should show LIVE after ~5s
- [ ] Open DevTools → no red errors in console
- [ ] Select Scenario 1 → click INITIATE → threats appear at T+0s

---

## KEYBOARD SHORTCUTS

| Key | Action |
|-----|--------|
| `Space` | Pause / Resume |
| `1` | Speed 1× |
| `2` | Speed 10× |
| `3` | Speed 60× |
| `L` | LEO view |
| `P` | Polar view |
| `G` | GEO view |
| `T` | Threat camera |
| `F` | Fullscreen |
| `I` | Instructor dashboard |
| `M` | Mission log panel |
| `?` | Help screen |
| `Esc` | Close modals |

---

## BRINGING BACK FOR DEBUGGING

When returning to Claude with bugs, bring:

1. **The exported JSON log** from the debrief screen
2. **Browser console output** — copy all errors/warnings
3. **Scenario number** that triggered the issue
4. **TLE source** shown in header at time of issue

The JSON log contains everything: full physics log, mission state, all CM deployments, all threat events, objectives status, timeline. This is enough to diagnose any issue.

---

## ARCHITECTURE

```
defspace-v6.html
    │
    ├── physics.js          → window.DEFSPACE_PHYSICS
    │   ├── SGP4            → propagate(tle, tsince_min) → {r, v, alt}
    │   ├── CoordTransform  → eciToGeo, eciToSphere, geoToSphere
    │   ├── NRLMSISE        → density(alt_km, Kp, F107)
    │   ├── IGRF13          → field(lat, lon, alt)
    │   ├── RadBelt         → assess(L, alt_km)
    │   ├── NASABreakup     → fragment(mass_kg, type)
    │   ├── ConjunctionAnalysis → compute(sat1, sat2, sigma, Rhbv, N)
    │   ├── ManouvrePlanning → hohmann(r1, r2), evasiveBurn, phasing
    │   ├── ForceModel      → accel(r_km, t_jd, ...)
    │   ├── SpaceWeather    → update(Kp, F107), injectFlare(mag)
    │   ├── TLEParser       → parse(raw), epochAge(sat)
    │   ├── FROZEN_TLE      → fallback TLEs
    │   └── PhysicsLog      → dump(), clear()
    │
    ├── mission.js          → window.DEFSPACE_MISSION
    │   ├── SCENARIOS[20]   → all scenario definitions
    │   ├── COUNTERMEASURES → 22 CM definitions
    │   ├── MissionEngine   → startScenario, deployCM, completeObjective
    │   ├── MissionState    → simTime, score, threats, dvBudget, ...
    │   └── MissionLog      → getAll(), export()
    │
    ├── tlefetch.js         → window.DEFSPACE_TLE
    │   ├── fetchAll()      → fallback chain, returns {source, tles}
    │   ├── epochAgeReport()
    │   └── _cache          → parsed TLE objects by assetId
    │
    └── app.js              → main app
        ├── GlobeRenderer   → Three.js scene, satMeshes, orbitLines
        ├── UI              → buildAssetList, buildCMList, updateTelemetry, ...
        ├── mainLoop()      → requestAnimationFrame render loop
        ├── runConjunctionAnalysis()
        ├── buildOrbitTrails()
        └── boot()          → async init sequence
```

---

## DOCTRINE REFERENCES

All scenarios reference real standards:
- ISRO SSA Conjunction Management Protocol Rev-3
- IADC Space Debris Mitigation Guidelines 2002
- DSA Electronic Warfare Standing Orders (EWSO) §4.2
- NTRO MCF Cyber Hardening Standard MCS-2023
- DRDO EMP Hardening Standard EMP-STD-07
- NDMA Satellite Reentry Emergency Protocol
- NSCS Space Contingency Response Framework
- ISRO RPOD Safety Standard ISRO-SAF-3401

---

*DefSpace v6 | iDEX PRIME X #9 | Defence Space Agency | 2026*
