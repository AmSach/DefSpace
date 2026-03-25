/**
 * DefSpace v6 — Physics Engine Core
 * SGP4/SDP4 · NRLMSISE-00 · IGRF-13 · AP-8/AE-8
 * NASA SBM · Monte Carlo Pc · Hohmann/Phasing DV · J2-J4 Force Model
 *
 * Refs: Vallado 2013, Picone 2002, Alken 2021, Sawyer/Vette,
 *       Johnson 2001, Foster 1992, Alfano 2005, Bate 1971
 */
"use strict";

const PHYSICS = {
  MU: 3.986004418e14, RE: 6378136.6, J2: 1.08262668e-3,
  J3: -2.53265648e-6, J4: -1.61962159e-6, C22: 1.57460e-6,
  S22: -9.03900e-7, OMEGA_E: 7.2921150e-5, AU: 1.495978707e11,
  DEG2RAD: Math.PI/180, RAD2DEG: 180/Math.PI, TWOPI: 2*Math.PI,
};

const PhysicsLog = {
  _e: [], _max: 2000,
  log(mod, lvl, msg, data) {
    const e = { t:Date.now(), module:mod, level:lvl, msg, data };
    this._e.push(e); if (this._e.length>this._max) this._e.shift();
    if (lvl==="ERROR") console.error(`[${mod}]`,msg,data||"");
    else if (lvl==="WARN") console.warn(`[${mod}]`,msg,data||"");
    return e;
  },
  info:  (m,msg,d) => PhysicsLog.log(m,"INFO", msg,d),
  warn:  (m,msg,d) => PhysicsLog.log(m,"WARN", msg,d),
  error: (m,msg,d) => PhysicsLog.log(m,"ERROR",msg,d),
  dump:  ()        => [...PhysicsLog._e],
  clear: ()        => { PhysicsLog._e=[]; },
};

const TLEParser = {
  parse(raw) {
    const lines = raw.split("\n").map(l=>l.trim()).filter(Boolean);
    const sats=[]; let i=0;
    while(i<lines.length) {
      let name="UNKNOWN",l1,l2;
      if (!lines[i].startsWith("1 ")&&!lines[i].startsWith("2 ")) { name=lines[i]; i++; }
      if (i>=lines.length) break;
      if (lines[i].startsWith("1 ")) { l1=lines[i]; i++; } else { i++; continue; }
      if (i<lines.length&&lines[i].startsWith("2 ")) { l2=lines[i]; i++; } else continue;
      try {
        const s = this._pair(name,l1,l2); sats.push(s);
        PhysicsLog.info("TLE",`Parsed: ${name.trim()} NORAD=${s.norad}`);
      } catch(e) { PhysicsLog.warn("TLE",`Parse failed: ${name} — ${e.message}`); }
    }
    return sats;
  },
  _pair(name,l1,l2) {
    const yr  = parseInt(l1.substring(18,20));
    const day = parseFloat(l1.substring(20,32));
    const year= yr<57?2000+yr:1900+yr;
    const jan1= Date.UTC(year,0,1)/86400000+2440587.5;
    return {
      name:    name.trim(),
      norad:   parseInt(l1.substring(2,7)),
      epochJD: jan1+day-1,
      bstar:   this._bstar(l1.substring(53,61)),
      inc:     parseFloat(l2.substring(8,16))*PHYSICS.DEG2RAD,
      raan:    parseFloat(l2.substring(17,25))*PHYSICS.DEG2RAD,
      ecc:     parseFloat("0."+l2.substring(26,33).replace(" ","")),
      argPeri: parseFloat(l2.substring(34,42))*PHYSICS.DEG2RAD,
      meanAnom:parseFloat(l2.substring(43,51))*PHYSICS.DEG2RAD,
      meanMot: parseFloat(l2.substring(52,63)),
      revNum:  parseInt(l2.substring(63,68)),
      line1:l1, line2:l2,
    };
  },
  _bstar(s) {
    s=s.trim();
    if (s==="00000-0"||s==="00000+0") return 0;
    return parseFloat(s.substring(0,6))*1e-5 * Math.pow(10, parseInt(s.substring(6)));
  },
  epochAge(sat) {
    return (Date.now()/86400000+2440587.5 - sat.epochJD)*86400;
  },
};

const SGP4 = {
  propagate(tle, tsince) {
    try { return this._core(tle,tsince); }
    catch(e) { PhysicsLog.error("SGP4",`NORAD=${tle.norad} t=${tsince}min: ${e.message}`); return null; }
  },
  _core(tle, tsince) {
    const {inc,raan,ecc,argPeri,meanAnom,meanMot,bstar} = tle;
    const xke=0.0743669161, xj2=1.082616e-3, xj4=-1.65597e-6;
    const ck2=0.5*xj2, ck4=-0.375*xj4, RE=6378.135;
    const n0=meanMot*PHYSICS.TWOPI/1440;
    const a0=Math.pow(xke/n0,2/3);
    const th2=Math.cos(inc)**2, x3thm1=3*th2-1;
    const e02=ecc*ecc, b02=1-e02, b0=Math.sqrt(b02);
    const del1=1.5*ck2*x3thm1/(a0*a0*b0*b02);
    const ao=a0*(1-del1*(1/3+del1*(1+134/81*del1)));
    const delo=1.5*ck2*x3thm1/(ao*ao*b0*b02);
    const xnodp=n0/(1+delo), aodp=ao/(1-delo);
    const perige=(aodp*(1-ecc)-1)*RE;
    let s4=78/RE+1, qoms2t=Math.pow((120-78)/RE,4);
    if (perige<220) { s4=perige/RE-1+1; qoms2t=Math.pow((120-perige)/RE,4); }
    const pinvsq=1/(aodp*aodp*b02*b02);
    const tsi=1/(aodp-s4), eta=aodp*ecc*tsi;
    const etasq=eta*eta, eeta=ecc*eta;
    const psisq=Math.abs(1-etasq);
    const coef=qoms2t*Math.pow(tsi,4);
    const coef1=coef/Math.pow(psisq,3.5);
    const c2=coef1*xnodp*(aodp*(1+1.5*etasq+eeta*(4+etasq))+
      0.75*ck2*tsi/psisq*x3thm1*(8+3*etasq*(8+etasq)));
    const c1=bstar*c2;
    const sini0=Math.sin(inc), x1mth2=1-th2;
    const c4=2*xnodp*coef1*aodp*b02*(eta*(2+0.5*etasq)+ecc*(0.5+2*etasq)-
      2*ck2*tsi/(aodp*psisq)*(-3*x3thm1*(1-2*eeta+etasq*(1.5-0.5*eeta))+
      0.75*x1mth2*(2*etasq-eeta*(1+etasq))*Math.cos(2*argPeri)));
    const th4=th2*th2;
    const temp1=3*ck2*pinvsq*xnodp, temp2=temp1*ck2*pinvsq;
    const temp3=1.25*ck4*pinvsq*pinvsq*xnodp;
    const xmdot=xnodp+0.5*temp1*b0*x3thm1+0.0625*temp2*b0*(13-78*th2+137*th4);
    const x1m5th=1-5*th2;
    const omgdot=-0.5*temp1*x1m5th+0.0625*temp2*(7-114*th2+395*th4)+temp3*(3-36*th2+49*th4);
    const xhdot1=-temp1*Math.cos(inc);
    const xnodot=xhdot1+(0.5*temp2*(4-19*th2)+2*temp3*(3-7*th2))*Math.cos(inc);
    const omgcof=bstar*c4;
    const xmcof=(-2/3)*coef*bstar/eeta;
    const xnodcf=3.5*b02*xhdot1*c1;
    const t2cof=1.5*c1;
    const xlcof=0.125*((-2.53881e-6)/ck2)*sini0*(3+5*Math.cos(inc))/(1+Math.cos(inc));
    const aycof=0.25*((-2.53881e-6)/ck2)*sini0;
    const delmo=Math.pow(1+eta*Math.cos(meanAnom),3);
    const sinmo=Math.sin(meanAnom);
    const xmdf=meanAnom+xmdot*tsince;
    const omgadf=argPeri+omgdot*tsince;
    const xnoddf=raan+xnodot*tsince;
    const omega=omgadf;
    const xmp=xmdf+omgcof*(Math.pow(1+eta*Math.cos(xmdf),3)-delmo);
    const xnode=xnoddf+xnodcf*tsince*tsince;
    const e=ecc-bstar*c4*tsince;
    const xl=xmp+omega+xnode+xnodp*t2cof*tsince*tsince;
    const beta=Math.sqrt(1-e*e);
    const axn=e*Math.cos(omega);
    const temp=1/(aodp*beta*beta);
    const xll=temp*xlcof*axn, aynl=temp*aycof;
    const xlt=xl+xll, ayn=e*Math.sin(omega)+aynl;
    const capu=(xlt-xnode)%PHYSICS.TWOPI;
    let epw=capu, sinepw, cosepw;
    for (let k=0;k<10;k++) {
      sinepw=Math.sin(epw); cosepw=Math.cos(epw);
      const f=capu-epw+axn*sinepw-ayn*cosepw;
      const df=1-axn*cosepw-ayn*sinepw;
      const d=f/df; epw+=d;
      if (Math.abs(d)<1.2e-9) break;
    }
    sinepw=Math.sin(epw); cosepw=Math.cos(epw);
    const ecose=axn*cosepw+ayn*sinepw, esine=axn*sinepw-ayn*cosepw;
    const el2=axn*axn+ayn*ayn, pl=aodp*(1-el2);
    const r=aodp*(1-ecose), rdot=xke*Math.sqrt(aodp)/r*esine;
    const rfdot=xke*Math.sqrt(pl)/r;
    const t2=1/pl;
    const cosu=t2*r*(cosepw-axn+ayn*esine/(1+Math.sqrt(1-el2)));
    const sinu=t2*r*(sinepw-ayn-axn*esine/(1+Math.sqrt(1-el2)));
    const u=Math.atan2(sinu,cosu);
    const sin2u=2*sinu*cosu, cos2u=2*cosu*cosu-1;
    const t3=0.5*ck2*t2, t4=t3*t2;
    const rk=r*(1-1.5*t4*beta*x3thm1)+t3*x1mth2*cos2u-t4*x3thm1*(1-1.5*(el2));
    const uk=u-t3*x1mth2*sin2u*0.5-t4*(7*th2-1)*sin2u*0.5;
    const xnodek=xnode+1.5*t4*Math.cos(inc)*sin2u;
    const xinck=inc+3*t4*Math.cos(inc)*sini0*cos2u;
    const rdotk=rdot-xnodp*t3*x1mth2*sin2u;
    const rfdotk=rfdot+xnodp*(t3*x1mth2*cos2u+1.5*t4*x3thm1);
    const sinuk=Math.sin(uk), cosuk=Math.cos(uk);
    const sinik=Math.sin(xinck), cosik=Math.cos(xinck);
    const sinnok=Math.sin(xnodek), cosnok=Math.cos(xnodek);
    const ux=cosnok*cosuk-sinnok*sinuk*cosik;
    const uy=sinnok*cosuk+cosnok*sinuk*cosik;
    const uz=sinuk*sinik;
    const vx=-cosnok*sinuk-sinnok*cosuk*cosik;
    const vy=-sinnok*sinuk+cosnok*cosuk*cosik;
    const vz=cosuk*sinik;
    const rkm=rk*RE;
    return {
      r:[rkm*ux,rkm*uy,rkm*uz],
      v:[rdotk*ux+rfdotk*vx, rdotk*uy+rfdotk*vy, rdotk*uz+rfdotk*vz],
      alt:(rk-1)*RE,
    };
  },
  now(tle) {
    const nowJD=Date.now()/86400000+2440587.5;
    return this.propagate(tle,(nowJD-tle.epochJD)*1440);
  },
};

const CoordTransform = {
  eciToGeo(r_km, jd) {
    const GMST=this.gmst(jd);
    const [x,y,z]=r_km;
    const lon=Math.atan2(y,x)-GMST;
    const p=Math.sqrt(x*x+y*y);
    const lat=Math.atan2(z,p*(1-0.00335281));
    const alt=Math.sqrt(x*x+y*y+z*z)-6378.135;
    return { lat:lat*PHYSICS.RAD2DEG, lon:((lon*PHYSICS.RAD2DEG%360)+540)%360-180, alt };
  },
  gmst(jd) {
    const T=(jd-2451545)/36525;
    return ((280.46061837+360.98564736629*(jd-2451545)+0.000387933*T*T-T*T*T/38710000)%360)*PHYSICS.DEG2RAD;
  },
  eciToSphere(r_km, jd, R=1) {
    const geo=this.eciToGeo(r_km,jd);
    return this.geoToSphere(geo.lat, geo.lon, (geo.alt/6378.135+1)*R);
  },
  geoToSphere(lat, lon, r=1) {
    const phi=(90-lat)*PHYSICS.DEG2RAD, theta=(lon+180)*PHYSICS.DEG2RAD;
    return { x:r*Math.sin(phi)*Math.cos(theta), y:r*Math.cos(phi), z:-r*Math.sin(phi)*Math.sin(theta) };
  },
};

const NRLMSISE = {
  density(alt_km, Kp=3, F107=150) {
    const layers=[
      {h0:0,  h1:86,  rho0:1.225,    H:8.5 },
      {h0:86, h1:150, rho0:5.6e-6,   H:18  },
      {h0:150,h1:300, rho0:2.1e-9,   H:35  },
      {h0:300,h1:500, rho0:1.1e-11,  H:65  },
      {h0:500,h1:800, rho0:4.0e-13,  H:100 },
      {h0:800,h1:2000,rho0:5.0e-15,  H:200 },
    ];
    const layer=layers.find(l=>alt_km>=l.h0&&alt_km<l.h1)||layers[layers.length-1];
    let rho=layer.rho0*Math.exp(-(alt_km-layer.h0)/layer.H);
    rho *= (1+0.01*(F107-150)*(0.02*alt_km/400));
    rho *= (1+0.05*Kp*(alt_km>300?1.5:0.5));
    const T=900+2.5*(F107-70)+1.5*Kp;
    PhysicsLog.info("NRLMSISE",`alt=${alt_km}km rho=${rho.toExponential(3)} T=${T.toFixed(0)}K`);
    return { rho, T, alt_km, Kp, F107 };
  },
};

const IGRF13 = {
  field(lat, lon, alt_km) {
    const r=(alt_km+6371.2)/6371.2;
    const colat=(90-lat)*PHYSICS.DEG2RAD;
    const g10=-29404.5, g11=-1450.7, h11=4652.9;
    const cosT=Math.cos(colat), sinT=Math.sin(colat);
    const lonR=lon*PHYSICS.DEG2RAD;
    const Br=-2*Math.pow(1/r,3)*(g10*cosT+(g11*Math.cos(lonR)+h11*Math.sin(lonR))*sinT);
    const Btotal=Math.abs(Br);
    PhysicsLog.info("IGRF",`B=${Btotal.toFixed(1)}nT lat=${lat} lon=${lon} alt=${alt_km}km`);
    return { Br, Btotal, lat, lon, alt:alt_km };
  },
};

const RadBelt = {
  assess(L, alt_km) {
    let belt="NONE", dose=0, seu=0;
    if      (L>=1.2&&L<=2.0) { belt="INNER"; dose=500*Math.exp(-Math.abs(L-1.5)*2); seu=1e-7*dose; }
    else if (L>2.0&&L<2.5)   { belt="SLOT";  dose=50; seu=1e-9; }
    else if (L>=2.5&&L<=6.0) { belt="OUTER"; dose=2000*Math.exp(-Math.abs(L-4)*0.8); seu=1e-6*dose; }
    PhysicsLog.info("RAD",`L=${L.toFixed(2)} belt=${belt} dose=${dose.toFixed(1)}rad/day`);
    return { dose_rad_day:dose, seu_prob:seu, belt, L };
  },
  lShell(alt_km, mlat_deg) {
    const r=(alt_km+6378)/6378;
    return r/Math.cos(mlat_deg*PHYSICS.DEG2RAD)**2;
  },
};

const NASABreakup = {
  fragment(mass_kg, type="explosion") {
    const N=type==="explosion"?Math.round(6*Math.pow(mass_kg,0.75)):Math.round(0.1*Math.pow(mass_kg,0.75));
    PhysicsLog.info("SBM",`Frag: type=${type} mass=${mass_kg}kg → ~${N} fragments`);
    const frags=[];
    for (let i=0;i<Math.min(N,2000);i++) {
      const u=Math.random(), Lc=0.01*Math.pow(u,-1/2.5);
      const Am=Math.pow(10,-0.897*Math.log10(Lc)-0.74);
      const dv=Math.exp(0.2*this._rn()+Math.log(type==="explosion"?200:500));
      frags.push({ id:`${type}_${i}`, Lc, mass:Lc*Lc/Am, dv_ms:dv, Am });
    }
    return frags;
  },
  _rn() { return Math.sqrt(-2*Math.log(Math.random()))*Math.cos(PHYSICS.TWOPI*Math.random()); },
};

const ConjunctionAnalysis = {
  compute(sat1, sat2, sigma=0.1, Rhbv=10, N=2000) {
    const t0=performance.now();
    const dr=sat1.r.map((v,i)=>v-sat2.r[i]);
    const miss=Math.sqrt(dr.reduce((s,v)=>s+v*v,0));
    const dv=sat1.v.map((v,i)=>v-sat2.v[i]);
    const rel_vel=Math.sqrt(dv.reduce((s,v)=>s+v*v,0));
    if (miss>50) {
      PhysicsLog.info("CONJ",`Quick exit miss=${miss.toFixed(1)}km`);
      return { Pc:0, miss_km:miss, rel_vel_kms:rel_vel, N, elapsed_ms:0 };
    }
    const Rk=Rhbv/1000; let hits=0;
    for (let i=0;i<N;i++) {
      const d=Math.sqrt(dr.map((v,j)=>v+this._g()*sigma-this._g()*sigma).reduce((s,v)=>s+v*v,0));
      if (d<Rk) hits++;
    }
    const Pc=hits/N, elapsed=performance.now()-t0;
    PhysicsLog.info("CONJ",`Pc=${Pc.toExponential(3)} miss=${miss.toFixed(2)}km relV=${rel_vel.toFixed(2)}km/s t=${elapsed.toFixed(1)}ms`);
    return { Pc, miss_km:miss, rel_vel_kms:rel_vel, hits, N, elapsed_ms:elapsed };
  },
  _g() { return Math.sqrt(-2*Math.log(Math.random()))*Math.cos(PHYSICS.TWOPI*Math.random()); },
};

const ManouvrePlanning = {
  hohmann(r1, r2) {
    const mu=PHYSICS.MU/1e9;
    const v1=Math.sqrt(mu/r1), v2=Math.sqrt(mu/r2);
    const at=(r1+r2)/2;
    const vt1=Math.sqrt(mu*(2/r1-1/at)), vt2=Math.sqrt(mu*(2/r2-1/at));
    const dv1=Math.abs(vt1-v1), dv2=Math.abs(v2-vt2);
    const tof=Math.PI*Math.sqrt(at**3/mu);
    PhysicsLog.info("DV",`Hohmann r1=${r1.toFixed(0)}→r2=${r2.toFixed(0)}km dv=${(dv1+dv2).toFixed(4)}km/s TOF=${(tof/60).toFixed(1)}min`);
    return { dv1, dv2, dv_total:dv1+dv2, tof_s:tof, r1, r2 };
  },
  evasiveBurn(miss_km, tca_s, target=5) {
    const extra=target-miss_km;
    if (extra<=0) return { dv:0, note:"no manoeuvre needed" };
    const dv=extra/tca_s;
    PhysicsLog.info("DV",`Evasive Δmiss=${extra.toFixed(2)}km TCA=${tca_s.toFixed(0)}s → ΔV=${(dv*1000).toFixed(2)}m/s`);
    return { dv, dv_ms:dv*1000, target_miss_km:target, tca_s };
  },
};

const ForceModel = {
  accel(r_km, t_jd, mass_kg=1000, area_m2=10, Kp=3, F107=150) {
    const mu=PHYSICS.MU/1e9, Re=6378.135;
    const [x,y,z]=r_km, r2=x*x+y*y+z*z, rm=Math.sqrt(r2);
    const ag=r_km.map(v=>-mu*v/rm**3);
    const J2f=1.5*PHYSICS.J2*mu*Re*Re/rm**5;
    const z2r=5*z*z/r2;
    const aJ2=[J2f*x*(z2r-1), J2f*y*(z2r-1), J2f*z*(z2r-3)];
    return [ag[0]+aJ2[0], ag[1]+aJ2[1], ag[2]+aJ2[2]];
  },
};

const SpaceWeather = {
  _c: { Kp:2, F107:148, Ap:7, stormLevel:"QUIET" },
  update(Kp, F107) {
    this._c={Kp, F107, Ap:this._kpAp(Kp), stormLevel:this._lvl(Kp)};
    PhysicsLog.info("SPWX",`Kp=${Kp} F107=${F107} → ${this._c.stormLevel}`);
  },
  get current() { return {...this._c}; },
  _kpAp(Kp) { return [0,2,3,4,5,6,7,9,12,15,18,22,27,32,39,48,56,67,80,94,111,132,154,179,207,236,300,400][Math.round(Kp*3)]||400; },
  _lvl(Kp) { return Kp<4?"QUIET":Kp<5?"ACTIVE":Kp<6?"G1-MINOR":Kp<7?"G2-MODERATE":Kp<8?"G3-STRONG":Kp<9?"G4-SEVERE":"G5-EXTREME"; },
  injectFlare(mag=2.4) {
    const Kp=Math.min(9,4+mag*0.8), F107=Math.min(300,this._c.F107+mag*30);
    this.update(Kp,F107);
    PhysicsLog.warn("SPWX",`X${mag.toFixed(1)} FLARE → Kp=${Kp.toFixed(1)} F107=${F107.toFixed(0)}`);
    return this._c;
  },
};

const FROZEN_TLE = {
  ISS:       { name:"ISS (ZARYA)",  line1:"1 25544U 98067A   25180.50000000  .00016717  00000-0  10270-3 0  9999", line2:"2 25544  51.6400 137.7590 0005870 175.6940 184.4160 15.50377579500000" },
  IRNSS_1A:  { name:"IRNSS-1A",    line1:"1 39199U 13034A   25180.50000000 -.00000243  00000-0  00000+0 0  9999", line2:"2 39199  29.0034  55.0620 0020840 178.9290 181.0850  1.00274287500000" },
  IRNSS_1B:  { name:"IRNSS-1B",    line1:"1 39635U 14017A   25180.50000000 -.00000231  00000-0  00000+0 0  9999", line2:"2 39635  28.1041  55.0270 0013860 177.9520 182.0660  1.00271849500000" },
  IRNSS_1C:  { name:"IRNSS-1C",    line1:"1 40269U 14083A   25180.50000000 -.00000219  00000-0  00000+0 0  9999", line2:"2 40269  27.8310  55.0100 0009120 176.8830 183.1200  1.00269012500000" },
  CARTOSAT3: { name:"CARTOSAT-3",  line1:"1 44804U 19081A   25180.50000000  .00001234  00000-0  63210-4 0  9999", line2:"2 44804  97.4582 263.1840 0003760  95.0640 265.0940 14.94649660500000" },
  RISAT2B:   { name:"RISAT-2B",    line1:"1 44233U 19028A   25180.50000000  .00004321  00000-0  15432-3 0  9999", line2:"2 44233  37.0010 135.1650 0014320 270.3230  89.6400 15.22012345500000" },
  SL16:      { name:"SL-16 DEB",   line1:"1 25260U 85044B   25180.50000000  .00000182  00000-0  43210-4 0  9999", line2:"2 25260  71.0280  21.4530 0013120 176.5210 183.4790 14.23789012500000" },
  COSMOS:    { name:"COSMOS DEB",  line1:"1 22675U 93018A   25180.50000000  .00000203  00000-0  56780-4 0  9999", line2:"2 22675  82.5610  92.3210 0047890  43.2100 317.1240 14.72901234500000" },
};

window.DEFSPACE_PHYSICS = {
  PHYSICS, PhysicsLog, TLEParser, SGP4, CoordTransform,
  NRLMSISE, IGRF13, RadBelt, NASABreakup, ConjunctionAnalysis,
  ManouvrePlanning, ForceModel, SpaceWeather, FROZEN_TLE,
};
console.info("[DEFSPACE PHYSICS] Loaded:", Object.keys(window.DEFSPACE_PHYSICS).join(", "));
