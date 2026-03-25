/**
 * DefSpace v6 — Main Application (DOM-matched to defspace-v6.html)
 * All IDs mapped to actual HTML elements.
 */
"use strict";

// ─── safe getter ───────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const set = (id, val) => { const el=$(id); if(el) el.textContent=val; };
const setHTML = (id, val) => { const el=$(id); if(el) el.innerHTML=val; };

// ─── App logger ────────────────────────────────────────────────────────────
const AppLog = {
  log(lvl,msg,data){
    const m={INFO:"log",WARN:"warn",ERROR:"error"}[lvl]||"log";
    console[m](`[APP][${lvl}]`,msg,data||"");
    if(window.DEFSPACE_MISSION) window.DEFSPACE_MISSION.MissionLog.record(lvl==="ERROR"?"CRITICAL":lvl,"APP",msg,data);
  },
  info:(m,d)=>AppLog.log("INFO",m,d),
  warn:(m,d)=>AppLog.log("WARN",m,d),
  error:(m,d)=>AppLog.log("ERROR",m,d),
};

// ─── Asset definitions ─────────────────────────────────────────────────────
const ASSET_DEFS = {
  ISS:       {name:"ISS (ZARYA)",  type:"STATION", color:0x00ff88, dot:"#00ff88", label:"INTL SPACE STATION"},
  IRNSS_1A:  {name:"IRNSS-1A",    type:"NAVSAT",  color:0x00d4ff, dot:"#00d4ff", label:"NavIC"},
  IRNSS_1B:  {name:"IRNSS-1B",    type:"NAVSAT",  color:0x00d4ff, dot:"#00d4ff", label:"NavIC"},
  IRNSS_1C:  {name:"IRNSS-1C",    type:"NAVSAT",  color:0x00d4ff, dot:"#00d4ff", label:"NavIC"},
  CARTOSAT3: {name:"CARTOSAT-3",  type:"RECCE",   color:0xffbb00, dot:"#ffbb00", label:"RECCE SSO"},
  RISAT2B:   {name:"RISAT-2B",    type:"SAR",     color:0xff8844, dot:"#ff8844", label:"SAR"},
  SL16:      {name:"SL-16 DEB",   type:"DEBRIS",  color:0xff2244, dot:"#ff2244", label:"DEBRIS"},
  COSMOS:    {name:"COSMOS DEB",  type:"DEBRIS",  color:0xff2244, dot:"#ff2244", label:"DEBRIS"},
};

const GROUND_STATIONS = [
  {id:"HASSAN",    name:"Hassan",     lat:13.01, lon:76.10},
  {id:"BANGALORE", name:"Bangalore",  lat:12.97, lon:77.59},
  {id:"LUCKNOW",   name:"Lucknow",    lat:26.85, lon:80.95},
  {id:"PORTBLAIR", name:"Port Blair", lat:11.62, lon:92.73},
];

// ─── App State ─────────────────────────────────────────────────────────────
const AppState = {
  tles:{}, tleSource:"loading",
  selectedAsset:"ISS", selectedScenarioId:null,
  simClock:0, frameCount:0, lastFrame:0,
  lastOrbitUpdate:0, lastConjUpdate:0,
  conjResults:{},
};

// ─── Globe Renderer ─────────────────────────────────────────────────────────
const Globe = {
  scene:null, camera:null, renderer:null, earth:null,
  satMeshes:{}, orbitLines:{}, R:1.0, _fps:0, _fpsN:0, _fpsClock:0,

  init(){
    const canvas = $("globe-canvas");
    if(!canvas){ AppLog.error("globe-canvas not found"); return; }

    // Inject canvas2d sibling if missing
    if(!$("globe-canvas-2d")){
      const c2=document.createElement("canvas");
      c2.id="globe-canvas-2d";
      c2.style.cssText="position:absolute;inset:0;width:100%;height:100%;display:none";
      canvas.parentNode.insertBefore(c2, canvas.nextSibling);
    }

    // Inject overlay divs if missing
    const wrap=$("globe-wrap");
    if(wrap && !$("ov-renderer")){
      const ov=document.createElement("div");
      ov.style.cssText="position:absolute;bottom:8px;left:8px;pointer-events:none;font-family:monospace;font-size:9px;color:rgba(0,255,136,.6);display:flex;flex-direction:column;gap:2px;";
      ov.innerHTML=`<div id="ov-renderer">WebGL</div><div id="ov-fps">FPS: —</div>`;
      wrap.appendChild(ov);
      const ov2=document.createElement("div");
      ov2.style.cssText="position:absolute;top:8px;right:8px;pointer-events:none;font-family:monospace;font-size:9px;color:rgba(0,255,136,.6);display:flex;flex-direction:column;gap:2px;align-items:flex-end;";
      ov2.innerHTML=`<div id="ov-tle-source">TLE: LOADING</div><div id="ov-conj">CONJ: CLEAR</div><div id="ov-spwx">SPWX: QUIET</div>`;
      wrap.appendChild(ov2);
    }

    try{
      this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true});
      this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
      this.renderer.setSize(canvas.offsetWidth||800, canvas.offsetHeight||600);
      this._useWebGL=true;
      set("ov-renderer","WebGL2");
      AppLog.info("Globe: WebGL2 OK");
    } catch(e){
      AppLog.warn("Globe: WebGL failed — Canvas2D fallback",e.message);
      canvas.style.display="none";
      const c2=$("globe-canvas-2d"); if(c2) c2.style.display="block";
      this._useWebGL=false;
      set("ov-renderer","Canvas2D");
    }

    if(this._useWebGL) this._buildScene();
    this._initMouse();
    window.addEventListener("resize",()=>this._resize());
  },

  _buildScene(){
    const wrap=$("globe-wrap");
    const W=wrap?.offsetWidth||800, H=wrap?.offsetHeight||600;
    this.scene=new THREE.Scene();
    this.camera=new THREE.PerspectiveCamera(45,W/H,0.001,100);
    this.camera.position.set(0,0,2.8);

    // Stars
    const sv=[];
    for(let i=0;i<7000;i++){
      const r=50+Math.random()*50,t=Math.random()*Math.PI*2,p=Math.acos(2*Math.random()-1);
      sv.push(r*Math.sin(p)*Math.cos(t),r*Math.cos(p),r*Math.sin(p)*Math.sin(t));
    }
    const sg=new THREE.BufferGeometry();
    sg.setAttribute("position",new THREE.Float32BufferAttribute(sv,3));
    this.scene.add(new THREE.Points(sg,new THREE.PointsMaterial({color:0xaaaacc,size:0.15,transparent:true,opacity:0.8})));

    // Earth
    this.earth=new THREE.Mesh(
      new THREE.SphereGeometry(this.R,64,64),
      new THREE.MeshPhongMaterial({color:0x1a3a5c,emissive:0x071020,specular:0x003060,shininess:15})
    );
    this.scene.add(this.earth);

    // Wireframe
    this.scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(this.R+0.001,32,32),
      new THREE.MeshBasicMaterial({color:0x1c4a6a,wireframe:true,transparent:true,opacity:0.1})
    ));

    // Atmosphere
    this.scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(this.R*1.08,32,32),
      new THREE.MeshBasicMaterial({color:0x0040a0,transparent:true,opacity:0.07,side:THREE.BackSide})
    ));

    // Grid
    const gl=(lat,col,op)=>{const p=[];for(let lon=0;lon<=360;lon+=3){const s=window.DEFSPACE_PHYSICS.CoordTransform.geoToSphere(lat,lon,this.R+0.001);p.push(s.x,s.y,s.z);}const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(p,3));this.scene.add(new THREE.Line(g,new THREE.LineBasicMaterial({color:col,transparent:true,opacity:op})));};
    gl(0,0x1a5080,0.4);[-60,-30,30,60].forEach(l=>gl(l,0x102840,0.18));
    for(let lon=0;lon<360;lon+=30){const p=[];for(let lat=-90;lat<=90;lat+=3){const s=window.DEFSPACE_PHYSICS.CoordTransform.geoToSphere(lat,lon,this.R+0.001);p.push(s.x,s.y,s.z);}const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(p,3));this.scene.add(new THREE.Line(g,new THREE.LineBasicMaterial({color:0x102840,transparent:true,opacity:0.13})));}

    // Lighting
    this.scene.add(new THREE.AmbientLight(0x203040,1.2));
    const sun=new THREE.DirectionalLight(0x8090a0,1.5); sun.position.set(5,2,3); this.scene.add(sun);

    // Ground stations
    for(const gs of GROUND_STATIONS){
      const p=window.DEFSPACE_PHYSICS.CoordTransform.geoToSphere(gs.lat,gs.lon,this.R+0.003);
      const m=new THREE.Mesh(new THREE.SphereGeometry(0.006,8,8),new THREE.MeshBasicMaterial({color:0x00d4ff}));
      m.position.set(p.x,p.y,p.z); this.scene.add(m);
      const ring=new THREE.Mesh(new THREE.RingGeometry(0.008,0.011,12),new THREE.MeshBasicMaterial({color:0x00d4ff,transparent:true,opacity:0.35,side:THREE.DoubleSide}));
      ring.position.set(p.x,p.y,p.z); ring.lookAt(0,0,0); this.scene.add(ring);
    }
    AppLog.info("Globe: Three.js scene built");
  },

  updateSat(id, sp, color, selected){
    if(!this._useWebGL) return;
    if(!this.satMeshes[id]){
      const def=ASSET_DEFS[id];
      const geo=def?.type==="DEBRIS"?new THREE.OctahedronGeometry(0.012,0):def?.type==="NAVSAT"?new THREE.BoxGeometry(0.016,0.005,0.016):new THREE.ConeGeometry(0.009,0.025,6);
      const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:color||0x00ff88}));
      this.scene.add(mesh);
      const spr=new THREE.Sprite(new THREE.SpriteMaterial({color:color||0x00ff88,transparent:true,opacity:0.25,sizeAttenuation:true}));
      spr.scale.set(0.07,0.07,1); this.scene.add(spr);
      mesh.userData.glow=spr;
      this.satMeshes[id]=mesh;
    }
    const m=this.satMeshes[id];
    m.position.set(sp.x,sp.y,sp.z); m.lookAt(0,0,0); m.rotateX(Math.PI/2);
    m.material.color.setHex(selected?0xffffff:(color||0x00ff88));
    const g=m.userData.glow;
    if(g){g.position.set(sp.x,sp.y,sp.z);g.material.opacity=selected?0.55:0.22;}
  },

  updateTrail(id,pts,color){
    if(!this._useWebGL) return;
    if(this.orbitLines[id]) this.scene.remove(this.orbitLines[id]);
    if(pts.length<2) return;
    const arr=[]; for(const p of pts) arr.push(p.x,p.y,p.z);
    const g=new THREE.BufferGeometry(); g.setAttribute("position",new THREE.Float32BufferAttribute(arr,3));
    const line=new THREE.Line(g,new THREE.LineBasicMaterial({color:color||0x00ff88,transparent:true,opacity:0.3}));
    this.scene.add(line); this.orbitLines[id]=line;
  },

  setView(v){
    const views={LEO:{x:0,y:0,z:2.2},POLAR:{x:0,y:2.5,z:0.3},GEO:{x:0,y:0.5,z:6.5},THREAT:{x:0,y:0.3,z:1.8}};
    const pos=views[v]||views.LEO;
    if(this.camera){this.camera.position.set(pos.x,pos.y,pos.z);this.camera.lookAt(0,0,0);}
  },

  _initMouse(){
    const canvas=$("globe-canvas"); if(!canvas) return;
    let drag=false,lx=0,ly=0;
    canvas.addEventListener("mousedown",e=>{drag=true;lx=e.clientX;ly=e.clientY;});
    canvas.addEventListener("mouseup",()=>drag=false);
    canvas.addEventListener("mouseleave",()=>drag=false);
    canvas.addEventListener("mousemove",e=>{
      if(!drag||!this.earth) return;
      this.earth.rotation.y+=(e.clientX-lx)*0.008;
      this.camera.position.y=Math.max(-2.5,Math.min(2.5,this.camera.position.y+(e.clientY-ly)*0.003));
      lx=e.clientX;ly=e.clientY;
    });
    canvas.addEventListener("wheel",e=>{
      if(!this.camera) return;
      const d=this.camera.position.length()*(e.deltaY>0?1.1:0.9);
      if(d>1.2&&d<15) this.camera.position.normalize().multiplyScalar(d);
    });
  },

  render2D(){
    const canvas=$("globe-canvas-2d"); if(!canvas) return;
    const ctx=canvas.getContext("2d");
    const W=canvas.width=canvas.offsetWidth||800, H=canvas.height=canvas.offsetHeight||600;
    const cx=W/2,cy=H/2,r=Math.min(W,H)*0.42;
    ctx.fillStyle="#020408"; ctx.fillRect(0,0,W,H);
    const g=ctx.createRadialGradient(cx,cy,r*.1,cx,cy,r);
    g.addColorStop(0,"#1a3a5c");g.addColorStop(1,"#050a14");
    ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fillStyle=g;ctx.fill();
    ctx.strokeStyle="#1c4a6a";ctx.lineWidth=1;ctx.stroke();
    ctx.strokeStyle="#102840";ctx.lineWidth=.5;ctx.globalAlpha=.4;
    for(let lat=-60;lat<=60;lat+=30){const y=cy-(lat/90)*r;ctx.beginPath();ctx.moveTo(cx-r,y);ctx.lineTo(cx+r,y);ctx.stroke();}
    for(let lon=-180;lon<=180;lon+=30){const x=cx+(lon/180)*r;ctx.beginPath();ctx.moveTo(x,cy-r);ctx.lineTo(x,cy+r);ctx.stroke();}
    ctx.globalAlpha=1;
    for(const gs of GROUND_STATIONS){
      const x=cx+(gs.lon/180)*r,y=cy-(gs.lat/90)*r;
      ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);
      ctx.fillStyle="#00d4ff22";ctx.fill();ctx.strokeStyle="#00d4ff";ctx.lineWidth=1;ctx.stroke();
    }
    for(const [id,tle] of Object.entries(AppState.tles)){
      const res=window.DEFSPACE_PHYSICS.SGP4.propagate(tle,AppState.simClock/60);
      if(!res) continue;
      const jd=Date.now()/86400000+2440587.5;
      const geo=window.DEFSPACE_PHYSICS.CoordTransform.eciToGeo(res.r,jd);
      const x=cx+(geo.lon/180)*r,y=cy-(geo.lat/90)*r;
      const def=ASSET_DEFS[id];const sel=id===AppState.selectedAsset;
      ctx.beginPath();ctx.arc(x,y,sel?7:4,0,Math.PI*2);
      ctx.fillStyle=def?.dot||"#00ff88";ctx.fill();
      if(sel){ctx.strokeStyle="#fff";ctx.lineWidth=1.5;ctx.stroke();}
      ctx.fillStyle=def?.dot||"#00ff88";ctx.font="9px monospace";
      ctx.fillText((def?.name||id).substring(0,10),x+8,y+3);
    }
  },

  render(dt){
    if(!this._useWebGL){this.render2D();return;}
    if(this.earth) this.earth.rotation.y+=0.0002;
    this.renderer.render(this.scene,this.camera);
    this._fpsN++; this._fpsClock+=dt;
    if(this._fpsClock>=1000){
      set("ov-fps",`FPS: ${this._fpsN}`);
      this._fpsN=0;this._fpsClock=0;
    }
  },

  _resize(){
    const wrap=$("globe-wrap"); if(!wrap) return;
    const W=wrap.offsetWidth,H=wrap.offsetHeight;
    if(this._useWebGL&&this.renderer){
      this.renderer.setSize(W,H);
      if(this.camera){this.camera.aspect=W/H;this.camera.updateProjectionMatrix();}
    }
  },
};

// ─── UI helpers ────────────────────────────────────────────────────────────
const UI = {

  buildAssets(){
    const list=$("asset-list"); if(!list) return;
    list.innerHTML="";
    for(const [id,def] of Object.entries(ASSET_DEFS)){
      const el=document.createElement("div");
      el.className="asset-item"+(id===AppState.selectedAsset?" active":"");
      el.dataset.id=id;
      el.innerHTML=`<span class="asset-dot" style="background:${def.dot}"></span><span class="asset-name">${def.name}</span><span class="asset-type">${def.label}</span><span class="asset-status" id="ast-${id}">NOM</span>`;
      el.addEventListener("click",()=>{
        AppState.selectedAsset=id;
        document.querySelectorAll(".asset-item").forEach(e=>e.classList.remove("active"));
        el.classList.add("active");
        set("telem-asset",def.name);
        AppLog.info(`Asset: ${id}`);
      });
      list.appendChild(el);
    }
  },

  buildScenarios(){
    const list=$("scenario-list"); if(!list) return;
    list.innerHTML="";
    for(const sc of window.DEFSPACE_MISSION.SCENARIOS){
      const el=document.createElement("div");
      el.className="scenario-item";
      el.style.cssText="padding:6px 10px;cursor:pointer;border-bottom:1px solid var(--border,#1c2a38);font-size:9px;";
      el.innerHTML=`<div style="color:#e8f4ff;font-size:10px">#${sc.id} ${sc.name}</div><div style="color:#4a6070;margin-top:2px">${sc.type} · ${sc.difficulty} · ${sc.duration}s</div>`;
      el.addEventListener("click",()=>{
        AppState.selectedScenarioId=sc.id;
        document.querySelectorAll(".scenario-item").forEach(e=>e.style.background="");
        el.style.background="rgba(0,212,255,0.08)";
        UI.showBriefing(sc);
      });
      list.appendChild(el);
    }
  },

  showBriefing(sc){
    const modal=$("modal-briefing"); if(!modal) return;
    set("m-sc-title",`SC-${sc.id}: ${sc.name}`);
    const body=$("m-sc-body"); if(!body) return;
    body.innerHTML=`
      <div style="font-size:9px;color:#4a6070;letter-spacing:.1em;margin-bottom:8px">${sc.type} · ${sc.difficulty}</div>
      <div style="font-size:10px;color:#b0c8d8;line-height:1.6;margin-bottom:12px">${sc.description}</div>
      <div style="font-size:9px;color:#4a6070;letter-spacing:.12em;margin-bottom:6px">OBJECTIVES</div>
      ${sc.objectives.map(o=>`<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #1c2a38;font-size:9px;color:#b0c8d8"><span>${o.text}</span><span style="color:#00cc66">+${o.points}</span></div>`).join("")}
      <div style="margin-top:10px;font-size:8px;color:#4a6070">${sc.doctrine.join(" · ")}</div>`;
    modal.classList.remove("hidden");
  },

  buildCMs(){
    const list=$("cm-list"); if(!list) return;
    list.innerHTML="";
    const cats=["MANOEUVRE","ELECTRONIC","COMMS","HARDENING","PASSIVE","CYBER"];
    const catColor={MANOEUVRE:"#00d4ff",ELECTRONIC:"#ffbb00",COMMS:"#00ff88",HARDENING:"#ff88ff",PASSIVE:"#8ab0d0",CYBER:"#bb88ff"};
    for(const cat of cats){
      const hdr=document.createElement("div");
      hdr.style.cssText=`padding:4px 10px;font-size:8px;letter-spacing:.15em;color:${catColor[cat]||"#4a6070"};background:#0a1018;border-bottom:1px solid #1c2a38`;
      hdr.textContent=cat; list.appendChild(hdr);
      for(const cm of Object.values(window.DEFSPACE_MISSION.COUNTERMEASURES).filter(c=>c.category===cat)){
        const btn=document.createElement("button");
        btn.id=`cm-btn-${cm.id}`;
        btn.style.cssText="width:100%;padding:6px 10px;background:transparent;border:none;border-bottom:1px solid #1c2a38;color:#b0c8d8;text-align:left;cursor:pointer;font-family:monospace;position:relative;overflow:hidden;transition:background .1s";
        btn.title=`${cm.desc}\nCooldown: ${cm.cooldown}s | P(success): ${Math.round(cm.successProb*100)}%\nDoctrine: ${cm.doctrine}`;
        btn.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:10px">${cm.name}</span><span style="font-size:8px;color:#4a6070">${cm.dvCost>0?`ΔV${cm.dvCost} `:""}${Math.round(cm.successProb*100)}%</span></div><div id="cd-${cm.id}" style="position:absolute;bottom:0;left:0;height:2px;width:0%;background:#00ff88;transition:width .1s"></div>`;
        btn.addEventListener("mouseover",()=>{if(!btn.classList.contains("disabled"))btn.style.background="rgba(0,255,136,.05)";});
        btn.addEventListener("mouseout",()=>btn.style.background="transparent");
        btn.addEventListener("click",()=>{
          const res=window.DEFSPACE_MISSION.MissionEngine.deployCM(cm.id,AppState.selectedAsset);
          if(res.ok){
            btn.style.background="rgba(0,255,136,.15)";
            setTimeout(()=>btn.style.background="transparent",400);
            UI.addThreatFeed(`CM: ${cm.name} → ${res.outcome}`,"#00ff88");
          } else {
            UI.addThreatFeed(`BLOCKED: ${cm.name} — ${res.reason}`,"#ffbb00");
          }
        });
        list.appendChild(btn);
      }
    }
  },

  buildGS(){
    const list=$("gs-list"); if(!list) return;
    list.innerHTML="";
    for(const gs of GROUND_STATIONS){
      const el=document.createElement("div");
      el.style.cssText="display:flex;justify-content:space-between;padding:3px 0;font-size:9px;border-bottom:1px solid #1c2a38";
      el.innerHTML=`<span style="color:#b0c8d8">${gs.name}</span><span id="gs-${gs.id}" style="color:#4a6070">—</span>`;
      list.appendChild(el);
    }
  },

  addThreatFeed(msg, color="#ff2244"){
    const feed=$("threat-feed"); if(!feed) return;
    const el=document.createElement("div");
    el.style.cssText=`color:${color};font-size:9px;padding:2px 4px;animation:fadeIn .3s`;
    el.textContent=msg;
    feed.insertBefore(el,feed.firstChild);
    while(feed.children.length>8) feed.removeChild(feed.lastChild);
  },

  updateTelemetry(){
    const tle=AppState.tles[AppState.selectedAsset]; if(!tle) return;
    const {SGP4,CoordTransform,PHYSICS}=window.DEFSPACE_PHYSICS;
    const res=SGP4.propagate(tle,AppState.simClock/60); if(!res) return;
    const jd=Date.now()/86400000+2440587.5;
    const geo=CoordTransform.eciToGeo(res.r,jd);
    const vmag=Math.sqrt(res.v.reduce((s,v)=>s+v*v,0));
    const rmag=Math.sqrt(res.r.reduce((s,v)=>s+v*v,0));
    const period=PHYSICS.TWOPI*Math.sqrt(rmag**3/(PHYSICS.MU/1e9))/60;
    set("t-alt",res.alt.toFixed(1)+" km");
    set("t-inc",(tle.inc*PHYSICS.RAD2DEG).toFixed(2)+"°");
    set("t-vel",vmag.toFixed(4)+" km/s");
    set("t-ecc",tle.ecc.toFixed(6));
    set("t-lat",geo.lat.toFixed(3)+"°");
    set("t-lon",geo.lon.toFixed(3)+"°");
    set("t-per",period.toFixed(2)+" min");
    set("coord-display",`LAT ${geo.lat.toFixed(2)}  LON ${geo.lon.toFixed(2)}  ALT ${res.alt.toFixed(0)}km`);
  },

  updateSpaceWeather(){
    const sw=window.DEFSPACE_PHYSICS.SpaceWeather.current;
    set("kp-val",sw.Kp.toFixed(1)); set("h-kp",sw.Kp.toFixed(1));
    set("f107-val",sw.F107.toFixed(0)); set("h-f107",sw.F107.toFixed(0));
    set("storm-val",sw.stormLevel);
    const kpFill=$("kp-fill"); if(kpFill) kpFill.style.width=(sw.Kp/9*100)+"%";
    const f107Fill=$("f107-fill"); if(f107Fill) f107Fill.style.width=((sw.F107-60)/340*100)+"%";
    const {NRLMSISE}=window.DEFSPACE_PHYSICS;
    const rho=NRLMSISE.density(400,sw.Kp,sw.F107).rho;
    set("density-val",rho.toExponential(2)+" kg/m³");
    set("ov-spwx",`SPWX: ${sw.stormLevel} Kp=${sw.Kp.toFixed(1)}`);
  },

  updateDV(){
    const {MissionState}=window.DEFSPACE_MISSION;
    const used=MissionState.dvBudget.used, total=MissionState.dvBudget.total;
    const list=$("dv-list"); if(!list) return;
    const pct=(used/total*100).toFixed(0);
    list.innerHTML=`
      <div style="display:flex;justify-content:space-between;font-size:9px;margin-bottom:4px">
        <span style="color:#ffbb00">Used: ${used.toFixed(1)} m/s</span>
        <span style="color:#4a6070">Remaining: ${(total-used).toFixed(1)} m/s</span>
      </div>
      <div style="height:6px;background:#0a1018;border:1px solid #1c2a38">
        <div style="height:100%;width:${pct}%;background:${pct>80?"#ff2244":pct>50?"#ffbb00":"#00ff88"};transition:width .3s"></div>
      </div>
      <div style="font-size:8px;color:#4a6070;margin-top:3px">CMs deployed: ${MissionState.activeCMs.length}</div>`;
  },

  updateScore(){
    const score=window.DEFSPACE_MISSION.MissionState.score;
    set("score-display",Math.round(score));
  },

  updateObjectives(){
    const {MissionState}=window.DEFSPACE_MISSION;
    const list=$("obj-list"); if(!list) return;
    const total=MissionState.objectives.length;
    const done=Object.values(MissionState.objectiveStatus).filter(s=>s==="COMPLETE").length;
    list.innerHTML=`<div style="padding:6px 12px;font-size:8px;color:#4a6070;letter-spacing:2px">OBJECTIVES ${done}/${total}</div>`;
    for(const obj of MissionState.objectives){
      const status=MissionState.objectiveStatus[obj.id]||"PENDING";
      const el=document.createElement("div");
      el.style.cssText=`display:flex;align-items:flex-start;gap:6px;padding:5px 10px;border-bottom:1px solid #1c2a38;cursor:pointer;${status==="COMPLETE"?"opacity:.45":""}`;
      el.innerHTML=`<div style="width:10px;height:10px;border:1px solid ${status==="COMPLETE"?"#00ff88":"#1c2a38"};background:${status==="COMPLETE"?"#00ff88":"transparent"};flex-shrink:0;margin-top:1px"></div><span style="font-size:9px;color:#b0c8d8;flex:1;${status==="COMPLETE"?"text-decoration:line-through":""}">${obj.text}</span><span style="font-size:9px;color:#00cc66">+${obj.points}</span>`;
      if(status==="PENDING") el.addEventListener("click",()=>{window.DEFSPACE_MISSION.MissionEngine.completeObjective(obj.id);UI.updateObjectives();});
      list.appendChild(el);
    }
  },

  updateCMCooldowns(){
    const {MissionState,COUNTERMEASURES}=window.DEFSPACE_MISSION;
    for(const [id,cd] of Object.entries(MissionState.cmCooldowns)){
      const cm=COUNTERMEASURES[id]; if(!cm) continue;
      const bar=$(`cd-${id}`); const btn=$(`cm-btn-${id}`);
      if(bar) bar.style.width=(cd>0?cd/cm.cooldown*100:0)+"%";
      if(btn){ btn.style.opacity=cd>0?"0.4":"1"; btn.style.cursor=cd>0?"not-allowed":"pointer"; }
    }
  },

  updateGS(){
    const {SGP4,CoordTransform}=window.DEFSPACE_PHYSICS;
    for(const gs of GROUND_STATIONS){
      const el=$(`gs-${gs.id}`); if(!el) continue;
      let aos=false;
      for(const [id,tle] of Object.entries(AppState.tles)){
        const res=SGP4.propagate(tle,AppState.simClock/60); if(!res) continue;
        const jd=Date.now()/86400000+2440587.5;
        const geo=CoordTransform.eciToGeo(res.r,jd);
        if(Math.sqrt((geo.lat-gs.lat)**2+(geo.lon-gs.lon)**2)<60){aos=true;break;}
      }
      el.textContent=aos?"AOS":"LOS";
      el.style.color=aos?"#00ff88":"#ff2244";
    }
  },

  updateHeader(){
    const {MissionState}=window.DEFSPACE_MISSION;
    if(MissionState.activeScenario) set("h-mission",`SC-${MissionState.activeScenario.id}`);
    const conj=AppState.conjResults;
    const conjEl=$("h-conj");
    if(conjEl){
      conjEl.textContent=conj.maxPc>1e-4?"⚠ "+conj.maxPc?.toExponential(2):(conj.pairs||0);
      conjEl.style.color=conj.maxPc>1e-4?"#ff2244":"#00ff88";
    }
  },

  updateThreatFeed(){
    const {MissionState}=window.DEFSPACE_MISSION;
    const feed=$("threat-feed"); if(!feed) return;
    feed.innerHTML="";
    for(const t of [...MissionState.threats].reverse().slice(0,6)){
      const el=document.createElement("div");
      const col=t.severity==="CRITICAL"?"#ff2244":t.severity==="HIGH"?"#ff8844":"#ffbb00";
      el.style.cssText=`color:${col};font-size:9px;padding:2px 4px;${t.countered?"opacity:.4;text-decoration:line-through":""}`;
      el.textContent=`[${t.severity}] ${t.type} · ${t.msg.substring(0,50)}`;
      feed.appendChild(el);
    }
  },

  showDebrief(report){
    const modal=$("modal-debrief"); if(!modal) return;
    const body=$("m-debrief-body"); if(!body) return;
    const gradeColor={S:"#00d4ff",A:"#00ff88",B:"#ffbb00",C:"#ff8844",F:"#ff2244"}[report.grade]||"#fff";
    body.innerHTML=`
      <div style="text-align:center;font-size:64px;font-weight:bold;color:${gradeColor};margin:12px 0;text-shadow:0 0 20px ${gradeColor}">${report.grade}</div>
      <div style="text-align:center;color:#b0c8d8;font-size:13px;margin-bottom:16px">FINAL SCORE: ${report.finalScore} / 100</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:16px 0">
        ${[["OBJECTIVES",`${report.objectivesCompleted}/${report.objectivesTotal}`],["THREATS COUNTERED",`${report.threatsCountered}/${report.threatsTotal}`],["ΔV USED",`${report.dvUsed.toFixed(1)} m/s`],["CMs DEPLOYED",report.cmsDeployed]].map(([k,v])=>`<div style="padding:8px;background:#0a1018;border:1px solid #1c2a38"><div style="font-size:8px;color:#4a6070;letter-spacing:.1em">${k}</div><div style="font-size:14px;color:#e8f4ff;font-weight:bold;margin-top:2px">${v}</div></div>`).join("")}
      </div>
      <button onclick="const j=window.DEFSPACE_MISSION.MissionEngine.exportDebriefJSON();const b=new Blob([j],{type:'application/json'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download='defspace-debrief-${Date.now()}.json';a.click();" style="width:100%;padding:8px;background:rgba(0,255,136,.1);border:1px solid #00ff88;color:#00ff88;font-family:monospace;cursor:pointer;margin-top:8px">EXPORT JSON LOG</button>`;
    modal.classList.remove("hidden");
  },
};

// ─── Conjunction Analysis ──────────────────────────────────────────────────
function runConj(){
  const {ConjunctionAnalysis,SGP4}=window.DEFSPACE_PHYSICS;
  const ids=Object.keys(AppState.tles), pos={};
  for(const id of ids){const res=SGP4.propagate(AppState.tles[id],AppState.simClock/60);if(res)pos[id]={r:res.r,v:res.v};}
  let maxPc=0,minMiss=Infinity,pairs=0;
  for(let i=0;i<ids.length;i++) for(let j=i+1;j<ids.length;j++){
    const p1=pos[ids[i]],p2=pos[ids[j]]; if(!p1||!p2) continue;
    const r=ConjunctionAnalysis.compute(p1,p2,0.1,10,500); pairs++;
    if(r.Pc>maxPc) maxPc=r.Pc;
    if(r.miss_km<minMiss) minMiss=r.miss_km;
    if(r.Pc>1e-4){
      [ids[i],ids[j]].forEach(id=>{const e=$(`ast-${id}`);if(e){e.textContent="CONJ";e.style.color="#ff2244";}});
      AppLog.warn(`Conj: ${ids[i]}↔${ids[j]} Pc=${r.Pc.toExponential(2)} miss=${r.miss_km.toFixed(1)}km`);
    }
  }
  AppState.conjResults={pairs,maxPc,minMiss};
  set("ov-conj",maxPc>1e-4?`CONJ: Pc=${maxPc.toExponential(2)}`:"CONJ: CLEAR");
}

// ─── Orbit trails ──────────────────────────────────────────────────────────
function buildTrails(){
  const {SGP4,CoordTransform}=window.DEFSPACE_PHYSICS;
  const jd0=Date.now()/86400000+2440587.5;
  for(const [id,tle] of Object.entries(AppState.tles)){
    const trail=[];
    for(let i=0;i<120;i++){
      const dt=i*0.75, res=SGP4.propagate(tle,AppState.simClock/60+dt); if(!res) continue;
      const alt=ASSET_DEFS[id]?.type==="NAVSAT"?0.15:0.01;
      trail.push(CoordTransform.eciToSphere(res.r,jd0+dt/1440,Globe.R+alt));
    }
    const col=parseInt((ASSET_DEFS[id]?.dot||"#00ff88").replace("#",""),16);
    Globe.updateTrail(id,trail,col);
  }
}

// ─── Main loop ─────────────────────────────────────────────────────────────
function mainLoop(ts){
  const dt=ts-(AppState.lastFrame||ts); AppState.lastFrame=ts; AppState.frameCount++;
  AppState.simClock=window.DEFSPACE_MISSION.MissionState.simTime;

  const {SGP4,CoordTransform}=window.DEFSPACE_PHYSICS;
  const jd=Date.now()/86400000+2440587.5;
  let loaded=0;

  for(const [id,tle] of Object.entries(AppState.tles)){
    const res=SGP4.propagate(tle,AppState.simClock/60); if(!res) continue;
    const alt=ASSET_DEFS[id]?.type==="NAVSAT"?0.15:0.02;
    const sp=CoordTransform.eciToSphere(res.r,jd,Globe.R+alt);
    const col=parseInt((ASSET_DEFS[id]?.dot||"#00ff88").replace("#",""),16);
    Globe.updateSat(id,sp,col,id===AppState.selectedAsset);
    loaded++;
  }

  if(ts-AppState.lastOrbitUpdate>5000){buildTrails();AppState.lastOrbitUpdate=ts;}
  if(ts-AppState.lastConjUpdate>10000){runConj();UI.updateGS();AppState.lastConjUpdate=ts;}

  if(AppState.frameCount%6===0){
    UI.updateTelemetry();
    UI.updateCMCooldowns();
    UI.updateDV();
    UI.updateScore();
    UI.updateSpaceWeather();
    UI.updateHeader();
    UI.updateThreatFeed();
  }

  // Timers
  const now=new Date();
  const hUTC=$("h-utc"); if(hUTC) hUTC.textContent=now.toUTCString().split(" ")[4]+" UTC";
  const s=AppState.simClock;
  const timer=$("sc-timer");
  if(timer) timer.textContent=`${String(Math.floor(s/3600)).padStart(2,"0")}:${String(Math.floor(s%3600/60)).padStart(2,"0")}:${String(Math.floor(s%60)).padStart(2,"0")}`;

  Globe.render(dt);
  requestAnimationFrame(mainLoop);
}

// ─── Events ────────────────────────────────────────────────────────────────
function bindEvents(){
  // Speed buttons (HTML uses onclick=DS.setSpeed already, but also bind here for safety)
  ["1","10","60"].forEach(s=>{
    const b=$(`sp-${s}`); if(!b) return;
    b.addEventListener("click",()=>{
      window.DEFSPACE_MISSION.MissionEngine.setSpeed(parseInt(s));
      document.querySelectorAll(".speed-btn").forEach(el=>el.classList.remove("active"));
      b.classList.add("active");
    });
  });

  // View buttons
  [["vb-leo","LEO"],["vb-pol","POLAR"],["vb-thr","THREAT"],["vb-geo","GEO"]].forEach(([id,v])=>{
    const b=$(id); if(!b) return;
    b.addEventListener("click",()=>{
      document.querySelectorAll(".view-btn").forEach(el=>el.classList.remove("active"));
      b.classList.add("active");
      Globe.setView(v);
    });
  });

  // Mission events
  window.addEventListener("ds:scenarioStart",e=>{
    set("sc-type-badge",e.detail.type);
    set("sc-name-text",e.detail.name.toUpperCase());
    set("h-mission",`SC-${e.detail.id}`);
    UI.updateObjectives();
    AppLog.info(`Scenario started: ${e.detail.name}`);
  });
  window.addEventListener("ds:threat",()=>UI.updateThreatFeed());
  window.addEventListener("ds:objective",()=>UI.updateObjectives());
  window.addEventListener("ds:scenarioEnd",e=>UI.showDebrief(e.detail));
  window.addEventListener("ds:cm",()=>{UI.updateDV();UI.updateCMCooldowns();});

  // Keyboard
  document.addEventListener("keydown",e=>{
    if(e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA") return;
    switch(e.key){
      case " ": e.preventDefault(); DS.togglePause(); break;
      case "1": $("sp-1")?.click(); break;
      case "2": $("sp-10")?.click(); break;
      case "3": $("sp-60")?.click(); break;
      case "l": case "L": $("vb-leo")?.click(); break;
      case "p": case "P": $("vb-pol")?.click(); break;
      case "t": case "T": $("vb-thr")?.click(); break;
      case "g": case "G": $("vb-geo")?.click(); break;
      case "f": case "F": document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen(); break;
    }
  });

  AppLog.info("Events bound");
}

// ─── TLE loader ────────────────────────────────────────────────────────────
async function loadTLEs(){
  AppLog.info("TLE fetch starting...");
  try{
    const result=await window.DEFSPACE_TLE.fetchAll();
    AppState.tles=result.tles;
    AppState.tleSource=result.source;
    const live=result.source!=="frozen"&&result.source!=="frozen_error";
    const ages=window.DEFSPACE_TLE.epochAgeReport();
    const maxAge=Math.max(0,...Object.values(ages).map(a=>parseFloat(a.age_hr)));
    set("h-tle-age",maxAge.toFixed(1)+"hr");
    set("ov-tle-source",`TLE: ${live?"LIVE":"FROZEN"} [${result.source}]`);
    AppLog.info(`TLEs: ${Object.keys(result.tles).length} assets from ${result.source}`);
    if(result.warning) AppLog.warn(result.warning);
  } catch(e){
    AppLog.error("TLE load failed",e.message);
    AppState.tles=window.DEFSPACE_TLE._parseFrozenTLEs();
  }
  setTimeout(loadTLEs,300000);
}

// ─── DS global (HTML onclick handlers call DS.*) ───────────────────────────
window.DS = {
  setSpeed(s){
    window.DEFSPACE_MISSION.MissionEngine.setSpeed(parseInt(s));
    document.querySelectorAll(".speed-btn").forEach(el=>el.classList.remove("active"));
    $(`sp-${s}`)?.classList.add("active");
  },
  togglePause(){
    const {MissionState,MissionEngine}=window.DEFSPACE_MISSION;
    if(MissionState.paused){MissionEngine.resume();set("btn-pause","PAUSE");}
    else{MissionEngine.pause();set("btn-pause","RESUME");}
  },
  toggleInstructor(){
    const m=$("modal-instructor"); if(m) m.classList.toggle("hidden");
  },
  setView(v){
    Globe.setView(v);
    document.querySelectorAll(".view-btn").forEach(el=>el.classList.remove("active"));
  },
  setKp(v){
    set("kp-slider-val",parseFloat(v).toFixed(1));
    const sw=window.DEFSPACE_PHYSICS.SpaceWeather.current;
    window.DEFSPACE_PHYSICS.SpaceWeather.update(parseFloat(v),sw.F107);
    UI.updateSpaceWeather();
  },
  setF107(v){
    set("f107-slider-val",parseInt(v));
    const sw=window.DEFSPACE_PHYSICS.SpaceWeather.current;
    window.DEFSPACE_PHYSICS.SpaceWeather.update(sw.Kp,parseInt(v));
    UI.updateSpaceWeather();
  },
  injectThreat(type){
    window.DEFSPACE_MISSION.MissionState.instructorMode=true;
    window.DEFSPACE_MISSION.MissionEngine.instructorInject(type,"ALL","HIGH",`Instructor: ${type} injected`);
    UI.updateThreatFeed();
    UI.addThreatFeed(`INJECTED: ${type}`,"#ffbb00");
  },
  openEditor(){ AppLog.info("Scenario Editor — coming in v6.1"); },
  exportPDF(){ AppLog.info("PDF export — coming in v6.1"); },
  showHelp(){ alert("DEFSPACE v6\nSPACE: pause | 1/2/3: speed | L/P/T/G: view | F: fullscreen\nwindow.DEFSPACE_PHYSICS.PhysicsLog.dump() — physics log\nwindow.DEFSPACE_MISSION.MissionEngine.exportDebriefJSON() — full log"); },
  closeBriefing(){ $("modal-briefing")?.classList.add("hidden"); },
  launchScenario(){
    if(!AppState.selectedScenarioId) return;
    $("modal-briefing")?.classList.add("hidden");
    window.DEFSPACE_MISSION.MissionEngine.startScenario(AppState.selectedScenarioId);
    UI.updateObjectives();
  },
};

// ─── Boot ──────────────────────────────────────────────────────────────────
async function boot(){
  console.log("%c DEFSPACE v6 ","background:#00ff88;color:#000;font-size:14px;font-weight:bold;padding:4px 8px");
  console.log("%c DSA Space Contingency | iDEX PRIME X #9 ","color:#00d4ff;font-size:11px");
  console.log("%c Debug: window.DEFSPACE_PHYSICS.PhysicsLog.dump() | window.DEFSPACE_MISSION.MissionEngine.exportDebriefJSON() ","color:#888;font-size:10px");

  AppLog.info("Boot START");
  AppLog.info("1/6 Globe init...");   Globe.init();
  AppLog.info("2/6 Build UI...");     UI.buildAssets(); UI.buildScenarios(); UI.buildCMs(); UI.buildGS();
  AppLog.info("3/6 Bind events...");  bindEvents();
  AppLog.info("4/6 Load TLEs...");    await loadTLEs();
  AppLog.info("5/6 SpWx init...");    UI.updateSpaceWeather();
  AppLog.info("6/6 Render loop..."); requestAnimationFrame(mainLoop);

  // Hide loading screen
  const ls=$("loading-screen"); if(ls) ls.style.display="none";

  AppLog.info("DefSpace v6 READY",{physics:Object.keys(window.DEFSPACE_PHYSICS),scenarios:window.DEFSPACE_MISSION.SCENARIOS.length,cms:Object.keys(window.DEFSPACE_MISSION.COUNTERMEASURES).length});
}

boot();
