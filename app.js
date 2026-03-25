/**
 * DefSpace v6 — Main Application
 * Three.js 3D globe, satellite rendering, UI wiring, simulation loop
 * Canvas 2D fallback if WebGL unavailable
 * All operations fully logged for debugging
 */

"use strict";

// ─────────────────────────────────────────────────────────
// APP LOGGER
// ─────────────────────────────────────────────────────────
const AppLog = {
  log(level, msg, data) {
    const methods = { INFO: "log", WARN: "warn", ERROR: "error" };
    console[methods[level] || "log"](`[APP][${level}] ${msg}`, data || "");
    if (window.DEFSPACE_MISSION) {
      window.DEFSPACE_MISSION.MissionLog.record(
        level === "ERROR" ? "CRITICAL" : level === "WARN" ? "WARN" : "INFO",
        "APP", msg, data
      );
    }
  },
  info:  (m, d) => AppLog.log("INFO",  m, d),
  warn:  (m, d) => AppLog.log("WARN",  m, d),
  error: (m, d) => AppLog.log("ERROR", m, d),
};

// ─────────────────────────────────────────────────────────
// ASSET DEFINITIONS
// ─────────────────────────────────────────────────────────
const ASSET_DEFS = {
  ISS:       { name: "ISS (ZARYA)",  type: "STATION", color: 0x00ff88, dotColor: "#00ff88", typeLabel: "INTL SPACE STATION" },
  IRNSS_1A:  { name: "IRNSS-1A",    type: "NAVSAT",  color: 0x00d4ff, dotColor: "#00d4ff", typeLabel: "NavIC CONSTELLATION" },
  IRNSS_1B:  { name: "IRNSS-1B",    type: "NAVSAT",  color: 0x00d4ff, dotColor: "#00d4ff", typeLabel: "NavIC CONSTELLATION" },
  IRNSS_1C:  { name: "IRNSS-1C",    type: "NAVSAT",  color: 0x00d4ff, dotColor: "#00d4ff", typeLabel: "NavIC CONSTELLATION" },
  CARTOSAT3: { name: "CARTOSAT-3",  type: "RECCE",   color: 0xffbb00, dotColor: "#ffbb00", typeLabel: "OPTICAL RECCE SSO"  },
  RISAT2B:   { name: "RISAT-2B",    type: "SAR",     color: 0xff8844, dotColor: "#ff8844", typeLabel: "SAR SATELLITE"      },
  SL16:      { name: "SL-16 DEB",   type: "DEBRIS",  color: 0xff2244, dotColor: "#ff2244", typeLabel: "THREAT — DEBRIS"   },
  COSMOS:    { name: "COSMOS DEB",  type: "DEBRIS",  color: 0xff2244, dotColor: "#ff2244", typeLabel: "THREAT — DEBRIS"   },
};

const GROUND_STATIONS = [
  { id: "HASSAN",    name: "Hassan",     lat: 13.01, lon: 76.10, roles: ["IRNSS","RECCE","SAR"]           },
  { id: "BANGALORE", name: "Bangalore",  lat: 12.97, lon: 77.59, roles: ["ISS","IRNSS","RECCE","SAR"]     },
  { id: "LUCKNOW",   name: "Lucknow",    lat: 26.85, lon: 80.95, roles: ["IRNSS"]                         },
  { id: "PORTBLAIR", name: "Port Blair", lat: 11.62, lon: 92.73, roles: ["RECCE","SAR"]                   },
];

// ─────────────────────────────────────────────────────────
// GLOBE RENDERER
// ─────────────────────────────────────────────────────────
const GlobeRenderer = {
  scene:    null,
  camera:   null,
  renderer: null,
  earth:    null,
  satMeshes:   {},
  orbitLines:  {},
  gStationMeshes: [],
  _animFrame:  null,
  _lastFPS:    0,
  _fpsCount:   0,
  _fpsClock:   0,
  _useWebGL:   false,
  _canvas2D:   null,
  _ctx2D:      null,
  GLOBE_R:     1.0,

  init() {
    const canvas   = document.getElementById("globe-canvas");
    const canvas2D = document.getElementById("globe-canvas-2d");
    this._canvas2D = canvas2D;

    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.setSize(canvas.offsetWidth, canvas.offsetHeight);
      this._useWebGL = true;
      document.getElementById("ov-renderer").textContent = "WebGL2";
      AppLog.info("Globe: WebGL2 renderer OK");
    } catch (e) {
      AppLog.warn("Globe: WebGL failed — Canvas2D fallback", e.message);
      canvas.style.display   = "none";
      canvas2D.style.display = "block";
      this._ctx2D = canvas2D.getContext("2d");
      this._useWebGL = false;
      document.getElementById("ov-renderer").textContent = "Canvas2D (fallback)";
    }

    if (this._useWebGL) this._initThree();
    window.addEventListener("resize", () => this._onResize());
  },

  _initThree() {
    const wrap = document.getElementById("globe-wrap");
    const W = wrap.offsetWidth, H = wrap.offsetHeight;

    this.scene  = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, W / H, 0.001, 100);
    this.camera.position.set(0, 0, 2.8);

    // Stars
    const starVerts = [];
    for (let i = 0; i < 8000; i++) {
      const r = 50 + Math.random() * 50;
      const t = Math.random() * Math.PI * 2;
      const p = Math.acos(2 * Math.random() - 1);
      starVerts.push(r*Math.sin(p)*Math.cos(t), r*Math.cos(p), r*Math.sin(p)*Math.sin(t));
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starVerts, 3));
    this.scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color:0xaaaacc, size:0.15, transparent:true, opacity:0.8 })));

    // Earth
    const earthMat = new THREE.MeshPhongMaterial({ color:0x1a3a5c, emissive:0x071020, specular:0x003060, shininess:15 });
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(this.GLOBE_R, 64, 64), earthMat);
    this.scene.add(this.earth);

    // Wireframe overlay
    const wireMat = new THREE.MeshBasicMaterial({ color:0x1c4a6a, wireframe:true, transparent:true, opacity:0.12 });
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(this.GLOBE_R+0.001, 32, 32), wireMat));

    // Atmosphere
    const atmMat = new THREE.MeshBasicMaterial({ color:0x0040a0, transparent:true, opacity:0.08, side:THREE.BackSide });
    this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(this.GLOBE_R*1.08, 32, 32), atmMat));

    // Grid lines
    this._addLatLine(0,   0x1a5080, 0.4);
    [-60,-30,30,60].forEach(lat => this._addLatLine(lat, 0x102840, 0.2));
    for (let lon = 0; lon < 360; lon += 30) this._addLonLine(lon, 0x102840, 0.15);

    // Lighting
    this.scene.add(new THREE.AmbientLight(0x203040, 1.2));
    const sun = new THREE.DirectionalLight(0x8090a0, 1.5);
    sun.position.set(5, 2, 3);
    this.scene.add(sun);

    // Ground stations
    this._buildGroundStations();
    this._initMouseControls();

    AppLog.info("Globe: Three.js scene built");
  },

  _addLatLine(lat, color, opacity) {
    const pts = [];
    for (let lon = 0; lon <= 360; lon += 3) {
      const p = window.DEFSPACE_PHYSICS.CoordTransform.geoToSphere(lat, lon, this.GLOBE_R+0.001);
      pts.push(p.x, p.y, p.z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    this.scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent:true, opacity })));
  },

  _addLonLine(lon, color, opacity) {
    const pts = [];
    for (let lat = -90; lat <= 90; lat += 3) {
      const p = window.DEFSPACE_PHYSICS.CoordTransform.geoToSphere(lat, lon, this.GLOBE_R+0.001);
      pts.push(p.x, p.y, p.z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    this.scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent:true, opacity })));
  },

  _buildGroundStations() {
    for (const gs of GROUND_STATIONS) {
      const pos = window.DEFSPACE_PHYSICS.CoordTransform.geoToSphere(gs.lat, gs.lon, this.GLOBE_R+0.003);
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.006, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x00d4ff })
      );
      mesh.position.set(pos.x, pos.y, pos.z);
      mesh.userData = { gs };
      this.scene.add(mesh);
      this.gStationMeshes.push(mesh);

      // Ring
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.008, 0.011, 12),
        new THREE.MeshBasicMaterial({ color:0x00d4ff, transparent:true, opacity:0.4, side:THREE.DoubleSide })
      );
      ring.position.set(pos.x, pos.y, pos.z);
      ring.lookAt(0, 0, 0);
      this.scene.add(ring);
    }
    AppLog.info(`Globe: ${GROUND_STATIONS.length} ground stations placed`);
  },

  updateSatellite(assetId, posSphere, color, isSelected) {
    if (!this._useWebGL) return;
    const def = ASSET_DEFS[assetId];

    if (!this.satMeshes[assetId]) {
      let geo;
      if (def?.type === "DEBRIS")      geo = new THREE.OctahedronGeometry(0.012, 0);
      else if (def?.type === "NAVSAT") geo = new THREE.BoxGeometry(0.016, 0.005, 0.016);
      else                             geo = new THREE.ConeGeometry(0.009, 0.025, 6);

      const mat  = new THREE.MeshBasicMaterial({ color: color || 0x00ff88 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData = { assetId };
      this.scene.add(mesh);
      this.satMeshes[assetId] = mesh;

      // Glow sprite
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ color: color||0x00ff88, transparent:true, opacity:0.3, sizeAttenuation:true }));
      sprite.scale.set(0.08, 0.08, 1);
      this.scene.add(sprite);
      mesh.userData.glow = sprite;

      AppLog.info(`Globe: Satellite mesh created — ${assetId}`);
    }

    const mesh = this.satMeshes[assetId];
    mesh.position.set(posSphere.x, posSphere.y, posSphere.z);
    mesh.lookAt(0, 0, 0);
    mesh.rotateX(Math.PI / 2);
    mesh.material.color.setHex(isSelected ? 0xffffff : (color || 0x00ff88));

    const glow = mesh.userData.glow;
    if (glow) {
      glow.position.set(posSphere.x, posSphere.y, posSphere.z);
      glow.material.opacity = isSelected ? 0.6 : 0.25;
    }
  },

  updateOrbitTrail(assetId, positions, color) {
    if (!this._useWebGL) return;
    if (this.orbitLines[assetId]) this.scene.remove(this.orbitLines[assetId]);
    if (positions.length < 2) return;

    const pts = [];
    for (const p of positions) pts.push(p.x, p.y, p.z);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: color||0x00ff88, transparent:true, opacity:0.35 }));
    this.scene.add(line);
    this.orbitLines[assetId] = line;
  },

  setView(view) {
    const views = { LEO:{z:2.2,y:0,x:0}, POLAR:{z:0.3,y:2.5,x:0}, GEO:{z:6.5,y:0.5,x:0}, THREAT:{z:1.8,y:0.3,x:0} };
    const v = views[view] || views.LEO;
    if (this.camera) {
      this.camera.position.set(v.x, v.y, v.z);
      this.camera.lookAt(0, 0, 0);
      AppLog.info(`Globe: View → ${view}`);
    }
  },

  _initMouseControls() {
    const canvas = document.getElementById("globe-canvas");
    let isDragging = false, lastX = 0, lastY = 0;
    canvas.addEventListener("mousedown", e => { isDragging=true; lastX=e.clientX; lastY=e.clientY; });
    canvas.addEventListener("mouseup",   () => { isDragging=false; });
    canvas.addEventListener("mouseleave",() => { isDragging=false; });
    canvas.addEventListener("mousemove", e => {
      if (!isDragging || !this.earth) return;
      const dx=(e.clientX-lastX)*0.008, dy=(e.clientY-lastY)*0.008;
      lastX=e.clientX; lastY=e.clientY;
      this.earth.rotation.y += dx;
      this.camera.position.y = Math.max(-2.5, Math.min(2.5, this.camera.position.y+dy*0.3));
    });
    canvas.addEventListener("wheel", e => {
      const zoom = e.deltaY>0 ? 1.1 : 0.9;
      const d = this.camera.position.length() * zoom;
      if (d>1.2 && d<15) this.camera.position.normalize().multiplyScalar(d);
    });
  },

  render(dt) {
    if (!this._useWebGL) { this._render2D(); return; }
    if (this.earth) this.earth.rotation.y += 0.0002;
    this.renderer.render(this.scene, this.camera);

    this._fpsCount++;
    this._fpsClock += dt;
    if (this._fpsClock >= 1000) {
      this._lastFPS = this._fpsCount;
      this._fpsCount = 0;
      this._fpsClock = 0;
      document.getElementById("ov-fps").textContent = `FPS: ${this._lastFPS}`;
    }
  },

  _render2D() {
    const canvas = this._canvas2D;
    const ctx    = this._ctx2D;
    if (!ctx) return;

    const W = canvas.width = canvas.offsetWidth;
    const H = canvas.height = canvas.offsetHeight;
    const cx = W/2, cy = H/2, r = Math.min(W,H)*0.42;

    ctx.fillStyle = "#020408";
    ctx.fillRect(0, 0, W, H);

    const grad = ctx.createRadialGradient(cx,cy,r*0.1,cx,cy,r);
    grad.addColorStop(0,"#1a3a5c"); grad.addColorStop(1,"#050a14");
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
    ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle="#1c4a6a"; ctx.lineWidth=1; ctx.stroke();

    // Grid
    ctx.strokeStyle="#102840"; ctx.lineWidth=0.5; ctx.globalAlpha=0.5;
    for (let lat=-60;lat<=60;lat+=30) { const y=cy-(lat/90)*r; ctx.beginPath(); ctx.moveTo(cx-r,y); ctx.lineTo(cx+r,y); ctx.stroke(); }
    for (let lon=-180;lon<=180;lon+=30) { const x=cx+(lon/180)*r; ctx.beginPath(); ctx.moveTo(x,cy-r); ctx.lineTo(x,cy+r); ctx.stroke(); }
    ctx.globalAlpha=1;

    // Ground stations
    for (const gs of GROUND_STATIONS) {
      const x=cx+(gs.lon/180)*r, y=cy-(gs.lat/90)*r;
      ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2);
      ctx.fillStyle="#00d4ff44"; ctx.fill();
      ctx.strokeStyle="#00d4ff"; ctx.lineWidth=1; ctx.stroke();
    }

    // Satellites
    for (const [assetId, tle] of Object.entries(AppState.tles)) {
      const res = window.DEFSPACE_PHYSICS.SGP4.propagate(tle, AppState.simClock/60);
      if (!res) continue;
      const jd = Date.now()/86400000+2440587.5;
      const geo = window.DEFSPACE_PHYSICS.CoordTransform.eciToGeo(res.r, jd);
      const x=cx+(geo.lon/180)*r, y=cy-(geo.lat/90)*r;
      const def = ASSET_DEFS[assetId];
      const col = def?.dotColor || "#00ff88";
      const isSel = assetId===AppState.selectedAsset;

      ctx.beginPath(); ctx.arc(x,y,isSel?7:4,0,Math.PI*2);
      ctx.fillStyle=col; ctx.fill();
      if (isSel) { ctx.strokeStyle="#fff"; ctx.lineWidth=1.5; ctx.stroke(); }

      ctx.fillStyle=col; ctx.font="9px 'Courier New'";
      ctx.fillText((def?.name||assetId).substring(0,10), x+8, y+3);
    }
  },

  _onResize() {
    const wrap = document.getElementById("globe-wrap");
    if (!wrap) return;
    const W=wrap.offsetWidth, H=wrap.offsetHeight;
    if (this._useWebGL && this.renderer) {
      this.renderer.setSize(W, H);
      if (this.camera) { this.camera.aspect=W/H; this.camera.updateProjectionMatrix(); }
    }
    AppLog.info(`Globe: Resized ${W}×${H}`);
  },
};

// ─────────────────────────────────────────────────────────
// APP STATE
// ─────────────────────────────────────────────────────────
const AppState = {
  tles:               {},
  tleSource:          "loading",
  orbitCache:         {},
  positions:          {},
  simClock:           0,
  selectedAsset:      "ISS",
  selectedScenarioId: null,
  conjResults:        {},
  frameCount:         0,
  lastFrame:          0,
  lastOrbitUpdate:    0,
  lastConjUpdate:     0,
};

// ─────────────────────────────────────────────────────────
// UI
// ─────────────────────────────────────────────────────────
const UI = {

  buildAssetList() {
    const list = document.getElementById("asset-list");
    list.innerHTML = "";
    for (const [id, def] of Object.entries(ASSET_DEFS)) {
      const item = document.createElement("div");
      item.className = `asset-item ${id===AppState.selectedAsset?"active":""}`;
      item.dataset.assetId = id;
      item.innerHTML = `
        <div class="asset-dot" style="background:${def.dotColor}"></div>
        <div>
          <div class="asset-name">${def.name}</div>
          <div class="asset-type">${def.typeLabel}</div>
        </div>
        <div class="asset-status status-ok" id="asset-status-${id}">NOM</div>
      `;
      item.addEventListener("click", () => {
        AppState.selectedAsset = id;
        document.querySelectorAll(".asset-item").forEach(el=>el.classList.remove("active"));
        item.classList.add("active");
        UI.updateTelemetry();
        AppLog.info(`Asset selected: ${id}`);
      });
      list.appendChild(item);
    }
    document.getElementById("asset-count").textContent = `0/${Object.keys(ASSET_DEFS).length}`;
  },

  buildScenarioList() {
    const list = document.getElementById("scenario-list");
    list.innerHTML = "";
    for (const sc of window.DEFSPACE_MISSION.SCENARIOS) {
      const card = document.createElement("div");
      card.className = "scenario-card";
      card.dataset.scenarioId = sc.id;
      const typeClass = `tag-${sc.type.toLowerCase().replace(/_/g,"")}`;
      const diffClass = `tag-${sc.difficulty.toLowerCase()}`;
      card.innerHTML = `
        <div class="sc-header">
          <div class="sc-name">${sc.name}</div>
          <div class="sc-num">#${String(sc.id).padStart(2,"0")}</div>
        </div>
        <div class="sc-tags">
          <span class="sc-tag ${typeClass}">${sc.type}</span>
          <span class="sc-tag ${diffClass}">${sc.difficulty}</span>
          <span class="sc-tag" style="color:var(--text3)">${sc.duration}s</span>
        </div>
      `;
      card.addEventListener("click", () => {
        AppState.selectedScenarioId = sc.id;
        document.querySelectorAll(".scenario-card").forEach(el=>el.classList.remove("active"));
        card.classList.add("active");
        UI.showScenarioOverlay(sc);
        AppLog.info(`Scenario selected: [${sc.id}] ${sc.name}`);
      });
      list.appendChild(card);
    }
  },

  buildCMList() {
    const list = document.getElementById("cm-list");
    list.innerHTML = "";
    const CMs = window.DEFSPACE_MISSION.COUNTERMEASURES;
    const cats = ["MANOEUVRE","ELECTRONIC","COMMS","HARDENING","PASSIVE","CYBER"];
    const catCls = { MANOEUVRE:"cat-manoeuvre", ELECTRONIC:"cat-electronic", COMMS:"cat-comms", HARDENING:"cat-hardening", PASSIVE:"cat-passive", CYBER:"cat-cyber" };

    for (const cat of cats) {
      const hdr = document.createElement("div");
      hdr.className = "cm-category";
      hdr.innerHTML = `<div class="cm-cat-lbl">${cat}</div>`;
      list.appendChild(hdr);

      for (const cm of Object.values(CMs).filter(c=>c.category===cat)) {
        const btn = document.createElement("button");
        btn.className = "cm-btn";
        btn.id = `cm-btn-${cm.id}`;
        btn.title = `${cm.desc}\nCooldown: ${cm.cooldown}s | P(success): ${Math.round(cm.successProb*100)}%\nDoctrine: ${cm.doctrine}`;
        btn.innerHTML = `
          <div class="cm-row">
            <span class="cm-name">${cm.name}<span class="cm-cat-tag ${catCls[cat]}">${cat.substring(0,3)}</span></span>
            <span class="cm-meta">
              ${cm.dvCost>0?`<span class="cm-dv">ΔV${cm.dvCost}</span>`:""}
              <span class="cm-prob">${Math.round(cm.successProb*100)}%</span>
            </span>
          </div>
          <div style="position:absolute;bottom:0;left:0;right:0;height:2px">
            <div class="cm-cooldown-bar" id="cm-cd-${cm.id}" style="width:0%"></div>
          </div>
        `;
        btn.addEventListener("click", () => {
          const result = window.DEFSPACE_MISSION.MissionEngine.deployCM(cm.id, AppState.selectedAsset);
          if (result.ok) {
            btn.classList.add("deploying");
            setTimeout(() => btn.classList.remove("deploying"), 500);
            UI.flashLog(`CM: ${cm.name} → ${result.outcome} on ${AppState.selectedAsset}`, result.success?"log-info":"log-warn");
          } else {
            UI.flashLog(`CM BLOCKED: ${cm.name} — ${result.reason}`, "log-warn");
          }
        });
        list.appendChild(btn);
      }
    }
  },

  buildGroundStations() {
    const row = document.getElementById("gstation-row");
    row.innerHTML = "";
    for (const gs of GROUND_STATIONS) {
      const div = document.createElement("div");
      div.className = "gst-item";
      div.id = `gst-${gs.id}`;
      div.innerHTML = `<div class="gst-name">${gs.name}</div><div class="gst-stat" id="gst-stat-${gs.id}">—</div>`;
      row.appendChild(div);
    }
  },

  showScenarioOverlay(sc) {
    const ov = document.getElementById("scenario-overlay");
    ov.classList.remove("hidden");

    document.getElementById("sc-ov-title").textContent = sc.name;
    document.getElementById("sc-ov-type").textContent  = `TYPE: ${sc.type}  |  DIFFICULTY: ${sc.difficulty}`;
    document.getElementById("sc-ov-desc").textContent  = sc.description;

    const objEl = document.getElementById("sc-ov-objectives");
    objEl.innerHTML = `<div class="sc-overlay-obj-title">OBJECTIVES (${sc.objectives.length})</div>`;
    for (const obj of sc.objectives) {
      objEl.innerHTML += `
        <div class="sc-overlay-obj-item">
          <span>${obj.text}</span><span>${obj.points} pts</span>
        </div>`;
    }

    document.getElementById("sc-ov-doctrine").textContent = "DOCTRINE REF: " + sc.doctrine.join(" · ");
    document.getElementById("btn-start-scenario").style.display  = "block";
    document.getElementById("btn-cancel-scenario").style.display = "block";
  },

  hideScenarioOverlay() {
    document.getElementById("scenario-overlay").classList.add("hidden");
  },

  // ── Telemetry ──────────────────────────────────────────
  updateTelemetry() {
    const id  = AppState.selectedAsset;
    const tle = AppState.tles[id];
    if (!tle) return;

    const { SGP4, CoordTransform, PHYSICS } = window.DEFSPACE_PHYSICS;
    const res = SGP4.propagate(tle, AppState.simClock/60);
    if (!res) return;

    const jd  = Date.now()/86400000+2440587.5;
    const geo = CoordTransform.eciToGeo(res.r, jd);
    const vmag = Math.sqrt(res.v.reduce((s,v)=>s+v*v,0));
    const mu    = PHYSICS.MU/1e9;
    const rmag  = Math.sqrt(res.r.reduce((s,v)=>s+v*v,0));
    const period = PHYSICS.TWOPI * Math.sqrt(rmag**3/mu) / 60;

    document.getElementById("telem-asset-name").textContent = tle.name || id;

    const vals = document.querySelectorAll("#telemetry-display .telem-val");
    if (vals.length >= 8) {
      vals[0].innerHTML = `${res.alt.toFixed(1)}<span class="telem-unit">km</span>`;
      vals[1].innerHTML = `${(tle.inc * PHYSICS.RAD2DEG).toFixed(2)}<span class="telem-unit">°</span>`;
      vals[2].innerHTML = `${vmag.toFixed(4)}<span class="telem-unit">km/s</span>`;
      vals[3].innerHTML = `${period.toFixed(2)}<span class="telem-unit">min</span>`;
      vals[4].innerHTML = `${geo.lat.toFixed(3)}<span class="telem-unit">°</span>`;
      vals[5].innerHTML = `${geo.lon.toFixed(3)}<span class="telem-unit">°</span>`;
      vals[6].innerHTML = `${tle.ecc.toFixed(6)}`;
      vals[7].innerHTML = `${(tle.raan * PHYSICS.RAD2DEG).toFixed(2)}<span class="telem-unit">°</span>`;
    }
  },

  // ── Threats ────────────────────────────────────────────
  updateThreats() {
    const { MissionState } = window.DEFSPACE_MISSION;
    const list = document.getElementById("threat-list");
    list.innerHTML = "";
    let critCount = 0;

    for (const t of [...MissionState.threats].reverse().slice(0, 20)) {
      const el  = document.createElement("div");
      el.className = `threat-item${t.countered?" threat-countered":""}`;
      const sevCls = t.severity==="CRITICAL"?"sev-critical":t.severity==="HIGH"?"sev-high":"sev-med";
      el.innerHTML = `
        <div class="threat-header">
          <span class="${sevCls}">${t.severity}</span>
          <span class="threat-time">T+${Math.round(t.injectedAt||0)}s</span>
        </div>
        <div class="threat-msg">[${t.type}] ${t.asset} — ${t.msg}</div>
        ${t.countered?`<div style="font-size:8px;color:var(--green2)">▶ COUNTERED: ${t.counteredBy}</div>`:""}
      `;
      list.appendChild(el);
      if (t.severity==="CRITICAL" && !t.countered) critCount++;
    }

    const active = MissionState.threats.filter(t=>!t.countered).length;
    document.getElementById("threat-count").textContent = active;
    document.getElementById("ov-threats").textContent   =
      `THREATS: ${active} ACTIVE${critCount>0?" | "+critCount+" CRITICAL":""}`;
    document.getElementById("ov-threats").className =
      "ov-line" + (critCount>0?" ov-crit":active>0?" ov-warn":"");
  },

  // ── Objectives ─────────────────────────────────────────
  updateObjectives() {
    const { MissionState } = window.DEFSPACE_MISSION;
    const list    = document.getElementById("objectives-list");
    list.innerHTML = "";
    const total    = MissionState.objectives.length;
    const complete = Object.values(MissionState.objectiveStatus).filter(s=>s==="COMPLETE").length;
    document.getElementById("obj-progress").textContent = `${complete}/${total}`;

    for (const obj of MissionState.objectives) {
      const status = MissionState.objectiveStatus[obj.id] || "PENDING";
      const el = document.createElement("div");
      el.className = `obj-item obj-${status.toLowerCase()}`;
      el.innerHTML = `
        <div class="obj-check ${status==="COMPLETE"?"done":""}" data-id="${obj.id}"></div>
        <div class="obj-text">${obj.text}</div>
        <div class="obj-pts">+${obj.points}</div>
      `;
      el.querySelector(".obj-check").addEventListener("click", () => {
        if (status==="PENDING") {
          window.DEFSPACE_MISSION.MissionEngine.completeObjective(obj.id);
          UI.updateObjectives();
        }
      });
      list.appendChild(el);
    }
  },

  updateCMCooldowns() {
    const { MissionState, COUNTERMEASURES } = window.DEFSPACE_MISSION;
    for (const [cmId, cd] of Object.entries(MissionState.cmCooldowns)) {
      const cm  = COUNTERMEASURES[cmId];
      const bar = document.getElementById(`cm-cd-${cmId}`);
      const btn = document.getElementById(`cm-btn-${cmId}`);
      if (!bar || !btn || !cm) continue;
      bar.style.width = cd>0 ? (cd/cm.cooldown*100)+"%" : "0%";
      btn.classList.toggle("disabled", cd>0);
    }
  },

  updateSpaceWeather() {
    const sw = window.DEFSPACE_PHYSICS.SpaceWeather.current;
    const kp = sw.Kp.toFixed(1), f107 = sw.F107.toFixed(0);
    document.getElementById("hdr-kp").textContent   = kp;
    document.getElementById("hdr-f107").textContent = f107;
    document.getElementById("bot-kp").textContent   = kp;
    document.getElementById("bot-f107").textContent = f107;

    const lvlEl = document.getElementById("bot-storm-level");
    lvlEl.textContent = sw.stormLevel;
    lvlEl.className   = "spwx-level level-" + sw.stormLevel.split("-")[0].toLowerCase();

    document.getElementById("bot-drag").textContent = (1+0.04*sw.Kp).toFixed(2)+"×";
    document.getElementById("ov-spwx").textContent  = `SPWX: ${sw.stormLevel} Kp=${kp}`;
    document.getElementById("ov-spwx").className    = "ov-line"+(sw.Kp>=6?" ov-crit":sw.Kp>=4?" ov-warn":"");
  },

  updateDVBudget() {
    const { MissionState } = window.DEFSPACE_MISSION;
    const used  = MissionState.dvBudget.used;
    const total = MissionState.dvBudget.total;
    const pct   = (used/total)*100;
    document.getElementById("dv-used").textContent      = used.toFixed(1);
    document.getElementById("dv-total").textContent     = total;
    document.getElementById("dv-remaining").textContent = (total-used).toFixed(1);
    document.getElementById("cm-count").textContent     = MissionState.activeCMs.length;
    const bar = document.getElementById("dv-bar");
    bar.style.width      = pct+"%";
    bar.style.background = pct>80?"var(--red)":pct>50?"var(--amber)":"var(--green)";
  },

  updateScore() {
    const score = window.DEFSPACE_MISSION.MissionState.score;
    document.getElementById("score-val").textContent = Math.round(score);
    const bar = document.getElementById("score-bar");
    bar.style.width      = score+"%";
    bar.style.background = score>=70?"var(--green)":score>=40?"var(--amber)":"var(--red)";
  },

  updateGroundStations() {
    const { SGP4, CoordTransform } = window.DEFSPACE_PHYSICS;
    for (const gs of GROUND_STATIONS) {
      const el = document.getElementById(`gst-stat-${gs.id}`);
      if (!el) continue;
      let aos = false;
      for (const [id, tle] of Object.entries(AppState.tles)) {
        const res = SGP4.propagate(tle, AppState.simClock/60);
        if (!res) continue;
        const jd  = Date.now()/86400000+2440587.5;
        const geo = CoordTransform.eciToGeo(res.r, jd);
        const d   = Math.sqrt((geo.lat-gs.lat)**2+(geo.lon-gs.lon)**2);
        if (d<60) { aos=true; break; }
      }
      el.className   = "gst-stat " + (aos?"gst-aos":"gst-los");
      el.textContent = aos ? "AOS" : "LOS";
    }
  },

  appendLog(entry) {
    const entries = document.getElementById("log-entries");
    if (!entries) return;
    const div = document.createElement("div");
    const levelCls = { INFO:"log-info", WARN:"log-warn", ALERT:"log-alert", CRITICAL:"log-critical" }[entry.level]||"log-info";
    div.className = `log-entry ${levelCls}`;
    const t = Math.round(entry.simTime||0);
    div.innerHTML = `<span class="log-time">T+${t}s</span><span class="log-cat">[${entry.category}]</span>${entry.msg}`;
    entries.appendChild(div);
    entries.scrollTop = entries.scrollHeight;
    document.getElementById("log-count").textContent = entries.children.length;
  },

  flashLog(msg, cls="log-info") {
    const entries = document.getElementById("log-entries");
    if (!entries) return;
    const div = document.createElement("div");
    div.className = `log-entry ${cls}`;
    div.textContent = msg;
    entries.appendChild(div);
    entries.scrollTop = entries.scrollHeight;
  },

  showDebrief(report) {
    const modal = document.getElementById("debrief-modal");
    modal.classList.add("open");
    const gradeEl = document.getElementById("debrief-grade");
    gradeEl.textContent = report.grade;
    gradeEl.className   = `debrief-grade grade-${report.grade}`;
    document.getElementById("debrief-score-val").textContent = `FINAL SCORE: ${report.finalScore} / 100`;
    document.getElementById("debrief-stats").innerHTML = `
      <div class="db-stat"><div class="db-stat-lbl">OBJECTIVES</div><div class="db-stat-val">${report.objectivesCompleted}/${report.objectivesTotal}</div></div>
      <div class="db-stat"><div class="db-stat-lbl">THREATS COUNTERED</div><div class="db-stat-val">${report.threatsCountered}/${report.threatsTotal}</div></div>
      <div class="db-stat"><div class="db-stat-lbl">ΔV USED</div><div class="db-stat-val">${report.dvUsed.toFixed(1)} m/s</div></div>
      <div class="db-stat"><div class="db-stat-lbl">CMs DEPLOYED</div><div class="db-stat-val">${report.cmsDeployed}</div></div>
    `;
  },
};

// ─────────────────────────────────────────────────────────
// CONJUNCTION ANALYSIS
// ─────────────────────────────────────────────────────────
function runConjunctionAnalysis() {
  const { ConjunctionAnalysis, SGP4 } = window.DEFSPACE_PHYSICS;
  const ids = Object.keys(AppState.tles);
  const pos = {};

  for (const id of ids) {
    const res = SGP4.propagate(AppState.tles[id], AppState.simClock/60);
    if (res) pos[id] = { r:res.r, v:res.v };
  }

  let maxPc=0, minMiss=Infinity, pairs=0;

  for (let i=0; i<ids.length; i++) {
    for (let j=i+1; j<ids.length; j++) {
      const p1=pos[ids[i]], p2=pos[ids[j]];
      if (!p1||!p2) continue;
      const res = ConjunctionAnalysis.compute(p1, p2, 0.1, 10, 500);
      pairs++;
      if (res.Pc>maxPc)       maxPc   = res.Pc;
      if (res.miss_km<minMiss) minMiss = res.miss_km;

      if (res.Pc>1e-4) {
        [ids[i],ids[j]].forEach(id => {
          const el = document.getElementById(`asset-status-${id}`);
          if (el) { el.textContent="CONJ"; el.className="asset-status status-crit"; }
        });
        AppLog.warn(`Conjunction: ${ids[i]}↔${ids[j]} Pc=${res.Pc.toExponential(2)} miss=${res.miss_km.toFixed(1)}km`);
      }
    }
  }

  AppState.conjResults = { pairs, maxPc, minMiss };
  document.getElementById("hdr-conj").textContent = maxPc>1e-4?"⚠ "+maxPc.toExponential(2):pairs;
  document.getElementById("hdr-conj").className   = "val "+(maxPc>1e-4?"red":"green");
  document.getElementById("bot-pairs").textContent = pairs;
  document.getElementById("bot-maxpc").textContent = maxPc>0?maxPc.toExponential(2):"CLEAR";
  document.getElementById("bot-miss").textContent  = minMiss<Infinity?minMiss.toFixed(1)+" km":"—";

  const ovConj = document.getElementById("ov-conj");
  ovConj.textContent = maxPc>1e-4?`CONJ WARNING: Pc=${maxPc.toExponential(2)}`:"CONJUNCTION: CLEAR";
  ovConj.className   = "ov-line"+(maxPc>1e-4?" ov-crit":"");
}

// ─────────────────────────────────────────────────────────
// ORBIT TRAILS
// ─────────────────────────────────────────────────────────
function buildOrbitTrails() {
  const { SGP4, CoordTransform } = window.DEFSPACE_PHYSICS;
  const jd0 = Date.now()/86400000+2440587.5;
  for (const [id, tle] of Object.entries(AppState.tles)) {
    const trail = [];
    for (let i=0; i<120; i++) {
      const dt  = i*0.75;
      const res = SGP4.propagate(tle, AppState.simClock/60+dt);
      if (!res) continue;
      const jd = jd0+dt/1440;
      const alt_offset = ASSET_DEFS[id]?.type==="NAVSAT" ? 0.15 : 0.01;
      trail.push(CoordTransform.eciToSphere(res.r, jd, GlobeRenderer.GLOBE_R+alt_offset));
    }
    const def   = ASSET_DEFS[id];
    const color = def ? parseInt(def.dotColor.replace("#",""),16) : 0x00ff88;
    GlobeRenderer.updateOrbitTrail(id, trail, color);
    AppState.orbitCache[id] = trail;
  }
}

// ─────────────────────────────────────────────────────────
// MAIN LOOP
// ─────────────────────────────────────────────────────────
function mainLoop(timestamp) {
  const dt = timestamp-(AppState.lastFrame||timestamp);
  AppState.lastFrame = timestamp;
  AppState.frameCount++;

  AppState.simClock = window.DEFSPACE_MISSION.MissionState.simTime;

  const { SGP4, CoordTransform } = window.DEFSPACE_PHYSICS;
  const jd = Date.now()/86400000+2440587.5;
  let loaded = 0;

  for (const [id, tle] of Object.entries(AppState.tles)) {
    const res = SGP4.propagate(tle, AppState.simClock/60);
    if (!res) continue;
    const altBoost = ASSET_DEFS[id]?.type==="NAVSAT" ? 0.15 : 0.02;
    const sp  = CoordTransform.eciToSphere(res.r, jd, GlobeRenderer.GLOBE_R+altBoost);
    const def = ASSET_DEFS[id];
    const col = def ? parseInt(def.dotColor.replace("#",""),16) : 0x00ff88;
    GlobeRenderer.updateSatellite(id, sp, col, id===AppState.selectedAsset);
    const geo = CoordTransform.eciToGeo(res.r, jd);
    AppState.positions[id] = { ...geo, alt:res.alt, v:res.v };
    loaded++;
  }

  document.getElementById("asset-count").textContent = `${loaded}/${Object.keys(ASSET_DEFS).length}`;

  if (timestamp-AppState.lastOrbitUpdate>5000)  { buildOrbitTrails();        AppState.lastOrbitUpdate=timestamp; }
  if (timestamp-AppState.lastConjUpdate>10000)  { runConjunctionAnalysis();  UI.updateGroundStations(); AppState.lastConjUpdate=timestamp; }

  if (AppState.frameCount%6===0) {
    UI.updateTelemetry();
    UI.updateCMCooldowns();
    UI.updateDVBudget();
    UI.updateScore();
    UI.updateSpaceWeather();
    UI.updateThreats();
  }

  // Clock
  const now = new Date();
  document.getElementById("clock").textContent = now.toUTCString().split(" ")[4]+" UTC";
  const s=AppState.simClock;
  document.getElementById("sim-time-display").textContent =
    `T+${String(Math.floor(s/3600)).padStart(2,"0")}:${String(Math.floor(s%3600/60)).padStart(2,"0")}:${String(Math.floor(s%60)).padStart(2,"0")}`;

  GlobeRenderer.render(dt);
  requestAnimationFrame(mainLoop);
}

// ─────────────────────────────────────────────────────────
// EVENT BINDINGS
// ─────────────────────────────────────────────────────────
function bindEvents() {

  // Speed
  document.querySelectorAll(".speed-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const speed = parseInt(btn.dataset.speed);
      window.DEFSPACE_MISSION.MissionEngine.setSpeed(speed);
      document.querySelectorAll(".speed-btn").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      AppLog.info(`Speed: ${speed}×`);
    });
  });

  // Pause
  document.getElementById("pause-btn").addEventListener("click", () => {
    const { MissionState, MissionEngine } = window.DEFSPACE_MISSION;
    if (MissionState.paused) { MissionEngine.resume(); document.getElementById("pause-btn").textContent="⏸"; }
    else                     { MissionEngine.pause();  document.getElementById("pause-btn").textContent="▶"; }
  });

  // Views
  document.querySelectorAll(".view-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".view-btn").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      GlobeRenderer.setView(btn.dataset.view);
    });
  });

  // Scenario start
  document.getElementById("btn-start-scenario").addEventListener("click", () => {
    if (!AppState.selectedScenarioId) return;
    window.DEFSPACE_MISSION.MissionEngine.startScenario(AppState.selectedScenarioId);
    UI.hideScenarioOverlay();
    UI.updateObjectives();
    document.getElementById("hdr-mission").textContent = `SC-${String(AppState.selectedScenarioId).padStart(2,"0")}`;
    AppLog.info(`Scenario started: ${AppState.selectedScenarioId}`);
  });

  // Scenario cancel
  document.getElementById("btn-cancel-scenario").addEventListener("click", () => {
    UI.hideScenarioOverlay();
    AppState.selectedScenarioId = null;
    document.querySelectorAll(".scenario-card").forEach(el=>el.classList.remove("active"));
  });

  // Mission log
  document.getElementById("btn-log").addEventListener("click", () => {
    const p = document.getElementById("log-panel");
    p.classList.toggle("open");
    document.getElementById("btn-log").classList.toggle("active", p.classList.contains("open"));
  });
  document.getElementById("log-close").addEventListener("click", () => {
    document.getElementById("log-panel").classList.remove("open");
    document.getElementById("btn-log").classList.remove("active");
  });

  // Instructor
  document.getElementById("btn-instr").addEventListener("click", () => {
    const p = document.getElementById("instructor-panel");
    const open = p.classList.toggle("open");
    window.DEFSPACE_MISSION.MissionState.instructorMode = open;
    document.getElementById("btn-instr").classList.toggle("active", open);
    if (open) AppLog.info("Instructor mode activated");
  });

  document.getElementById("btn-instr-inject").addEventListener("click", () => {
    window.DEFSPACE_MISSION.MissionState.instructorMode = true;
    window.DEFSPACE_MISSION.MissionEngine.instructorInject(
      document.getElementById("instr-type").value,
      document.getElementById("instr-asset").value,
      document.getElementById("instr-sev").value,
      document.getElementById("instr-msg").value,
    );
    UI.updateThreats();
  });

  document.getElementById("btn-kp-override").addEventListener("click", () => {
    const kp = parseFloat(document.getElementById("instr-kp").value);
    const sw  = window.DEFSPACE_PHYSICS.SpaceWeather.current;
    window.DEFSPACE_PHYSICS.SpaceWeather.update(kp, sw.F107);
    UI.updateSpaceWeather();
    AppLog.info(`Instructor Kp override → ${kp}`);
  });

  // Help
  document.getElementById("btn-help").addEventListener("click", () => document.getElementById("help-modal").classList.add("open"));
  document.getElementById("help-close").addEventListener("click", () => document.getElementById("help-modal").classList.remove("open"));

  // Debrief
  document.getElementById("btn-close-debrief").addEventListener("click", () => document.getElementById("debrief-modal").classList.remove("open"));
  document.getElementById("btn-export-log").addEventListener("click", () => {
    const json = window.DEFSPACE_MISSION.MissionEngine.exportDebriefJSON();
    const blob = new Blob([json], { type:"application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement("a"), { href:url, download:`defspace-sc${AppState.selectedScenarioId||0}-${Date.now()}.json` });
    a.click();
    URL.revokeObjectURL(url);
    AppLog.info("Debrief JSON exported");
  });

  // Mission events
  window.addEventListener("ds:log",         e => UI.appendLog(e.detail));
  window.addEventListener("ds:threat",      () => UI.updateThreats());
  window.addEventListener("ds:objective",   () => UI.updateObjectives());
  window.addEventListener("ds:scenarioEnd", e => UI.showDebrief(e.detail));
  window.addEventListener("ds:scenarioStart", e => {
    document.getElementById("ov-scenario").textContent = `SC-${e.detail.id}: ${e.detail.name.substring(0,42).toUpperCase()}`;
    UI.updateObjectives();
    UI.updateThreats();
  });
  window.addEventListener("ds:threat", e => {
    if (e.detail.severity==="CRITICAL") {
      const h = document.getElementById("header");
      h.style.borderBottomColor="var(--red)";
      setTimeout(() => { h.style.borderBottomColor="var(--border)"; }, 2000);
    }
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", e => {
    if (e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA") return;
    switch(e.key) {
      case " ": e.preventDefault(); document.getElementById("pause-btn").click(); break;
      case "1": document.querySelector(".speed-btn[data-speed='1']").click();  break;
      case "2": document.querySelector(".speed-btn[data-speed='10']").click(); break;
      case "3": document.querySelector(".speed-btn[data-speed='60']").click(); break;
      case "l": case "L": document.querySelector(".view-btn[data-view='LEO']").click();    break;
      case "p": case "P": document.querySelector(".view-btn[data-view='POLAR']").click();  break;
      case "g": case "G": document.querySelector(".view-btn[data-view='GEO']").click();    break;
      case "t": case "T": document.querySelector(".view-btn[data-view='THREAT']").click(); break;
      case "f": case "F":
        if (!document.fullscreenElement) document.documentElement.requestFullscreen();
        else document.exitFullscreen();
        break;
      case "i": case "I": document.getElementById("btn-instr").click(); break;
      case "m": case "M": document.getElementById("btn-log").click();   break;
      case "?":           document.getElementById("btn-help").click();  break;
      case "Escape":
        document.getElementById("help-modal").classList.remove("open");
        document.getElementById("debrief-modal").classList.remove("open");
        break;
    }
  });

  AppLog.info("All event listeners bound");
}

// ─────────────────────────────────────────────────────────
// TLE FETCH
// ─────────────────────────────────────────────────────────
async function loadTLEs() {
  const statusEl = document.getElementById("tle-status");
  const ovEl     = document.getElementById("ov-tle-source");
  statusEl.textContent = "TLE: FETCHING..."; statusEl.className = "";

  AppLog.info("TLE fetch — chain: vercel → allorigins → corsproxy → frozen");
  try {
    const result = await window.DEFSPACE_TLE.fetchAll();
    AppState.tles      = result.tles;
    AppState.tleSource = result.source;
    const count  = Object.keys(result.tles).length;
    const isLive = result.source !== "frozen" && result.source !== "frozen_error";
    statusEl.textContent = `TLE: ${isLive?"LIVE":"FROZEN"} (${count}) [${result.source}]`;
    statusEl.className   = isLive ? "live" : "frozen";
    ovEl.textContent     = `TLE: ${isLive?"LIVE":"FROZEN"} · ${result.source}`;

    const ages   = window.DEFSPACE_TLE.epochAgeReport();
    const maxAge = Math.max(0, ...Object.values(ages).map(a=>parseFloat(a.age_hr)));
    document.getElementById("hdr-epoch").textContent = `${maxAge.toFixed(1)}hr`;
    document.getElementById("hdr-epoch").className   = "val "+(maxAge>72?"red":maxAge>24?"amber":"green");

    AppLog.info(`TLEs loaded: ${count} assets from ${result.source}`, {
      assets: Object.keys(result.tles), epochAge_hr: maxAge.toFixed(1), warning: result.warning
    });
    if (result.warning) AppLog.warn(`TLE warning: ${result.warning}`);
  } catch (e) {
    AppLog.error("TLE load failed", e.message);
    statusEl.textContent = "TLE: ERR — FROZEN"; statusEl.className = "frozen";
    AppState.tles = window.DEFSPACE_TLE._parseFrozenTLEs();
  }

  setTimeout(loadTLEs, 300000); // refresh every 5min
}

// ─────────────────────────────────────────────────────────
// RADIATION MONITOR
// ─────────────────────────────────────────────────────────
function updateRadBelt() {
  const { RadBelt, SGP4 } = window.DEFSPACE_PHYSICS;
  const tle = AppState.tles[AppState.selectedAsset];
  if (!tle) return;
  const res = SGP4.propagate(tle, AppState.simClock/60);
  if (!res) return;
  const L   = RadBelt.lShell(res.alt, 0);
  const rad = RadBelt.assess(L, res.alt);
  const el  = document.getElementById("bot-rad");
  el.textContent = rad.belt;
  el.style.color = rad.belt==="INNER"||rad.belt==="OUTER"?"var(--red)":rad.belt==="SLOT"?"var(--amber)":"var(--green2)";
}

// ─────────────────────────────────────────────────────────
// BOOT
// ─────────────────────────────────────────────────────────
async function boot() {
  console.log("%c DEFSPACE v6 ", "background:#00ff88;color:#000;font-size:14px;font-weight:bold;padding:4px 8px;");
  console.log("%c DSA Space Contingency Training Simulator | iDEX PRIME X #9 ", "color:#00d4ff;font-size:11px;");
  console.log("%c Physics: SGP4 · NRLMSISE-00 · IGRF-13 · AP-8/AE-8 · NASA SBM · Monte Carlo Pc ", "color:#888;font-size:10px;");
  console.log("%c All operations logged — window.DEFSPACE_PHYSICS.PhysicsLog.dump() for physics log ", "color:#888;font-size:10px;");
  console.log("%c window.DEFSPACE_MISSION.MissionEngine.exportDebriefJSON() for full mission log ", "color:#888;font-size:10px;");

  AppLog.info("DefSpace v6 boot sequence — START");

  AppLog.info("Step 1/7: Globe renderer init...");
  GlobeRenderer.init();

  AppLog.info("Step 2/7: UI panels build...");
  UI.buildAssetList();
  UI.buildScenarioList();
  UI.buildCMList();
  UI.buildGroundStations();

  AppLog.info("Step 3/7: Event listeners...");
  bindEvents();

  AppLog.info("Step 4/7: TLE fetch...");
  await loadTLEs();

  AppLog.info("Step 5/7: Space weather init...");
  UI.updateSpaceWeather();

  AppLog.info("Step 6/7: Radiation belt monitor...");
  setInterval(updateRadBelt, 5000);

  AppLog.info("Step 7/7: Render loop start...");
  requestAnimationFrame(mainLoop);

  // Show clean scenario picker on start
  document.getElementById("scenario-overlay").classList.remove("hidden");
  document.getElementById("btn-start-scenario").style.display  = "none";
  document.getElementById("btn-cancel-scenario").style.display = "none";

  AppLog.info("DefSpace v6 READY", {
    physics:   Object.keys(window.DEFSPACE_PHYSICS),
    scenarios: window.DEFSPACE_MISSION.SCENARIOS.length,
    cms:       Object.keys(window.DEFSPACE_MISSION.COUNTERMEASURES).length,
    assets:    Object.keys(ASSET_DEFS).length,
    tleSource: AppState.tleSource,
  });

  UI.flashLog("DEFSPACE v6 OPERATIONAL — Select scenario to begin training", "log-info");
  UI.flashLog("DEBUG: window.DEFSPACE_PHYSICS | window.DEFSPACE_MISSION | window.DEFSPACE_TLE", "log-info");
}

boot();
