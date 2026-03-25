/**
 * DefSpace v6 — TLE Fetcher
 * Fallback chain: Vercel /api/tle → allorigins → corsproxy.io → direct → frozen
 */
"use strict";

const TLEFetcher = {
  _cache: {}, _cacheTime: 300000, _lastFetch: 0,

  async fetchAll() {
    const now=Date.now();
    if (now-this._lastFetch<this._cacheTime && Object.keys(this._cache).length>0) {
      console.log("[TLE] Cache hit, age:", Math.round((now-this._lastFetch)/1000)+"s");
      return { source:"cache", tles:this._cache };
    }
    console.log("[TLE] Fetching TLEs — starting fallback chain...");

    // Chain 1: Vercel API proxy
    try {
      const r = await fetch("/api/tle", { signal:AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      if (!data.ok || !data.tles) throw new Error("bad proxy response");
      const parsed={};
      for (const [name,raw] of Object.entries(data.tles)) {
        const recs = window.DEFSPACE_PHYSICS.TLEParser.parse(raw);
        if (recs.length>0) parsed[name]=recs[0];
      }
      if (Object.keys(parsed).length>0) {
        this._cache=parsed; this._lastFetch=Date.now();
        console.log("[TLE] ✓ Vercel proxy:", Object.keys(parsed).length, "assets");
        return { source:"vercel_proxy", tles:parsed, fetchedAt:data.fetchedAt };
      }
    } catch(e) { console.warn("[TLE] Vercel proxy failed:", e.message); }

    // Chain 2: allorigins
    try {
      const r2 = await this._corsProxy("https://api.allorigins.win/raw?url=");
      if (r2&&Object.keys(r2).length>=3) {
        this._cache=r2; this._lastFetch=Date.now();
        console.log("[TLE] ✓ allorigins:", Object.keys(r2).length, "assets");
        return { source:"allorigins", tles:r2 };
      }
    } catch(e) { console.warn("[TLE] allorigins failed:", e.message); }

    // Chain 3: corsproxy.io
    try {
      const r3 = await this._corsProxy("https://corsproxy.io/?");
      if (r3&&Object.keys(r3).length>=3) {
        this._cache=r3; this._lastFetch=Date.now();
        console.log("[TLE] ✓ corsproxy.io:", Object.keys(r3).length, "assets");
        return { source:"corsproxy_io", tles:r3 };
      }
    } catch(e) { console.warn("[TLE] corsproxy.io failed:", e.message); }

    // Chain 4: direct
    try {
      const r4 = await this._direct();
      if (r4&&Object.keys(r4).length>=2) {
        this._cache=r4; this._lastFetch=Date.now();
        console.log("[TLE] ✓ Direct:", Object.keys(r4).length, "assets");
        return { source:"direct", tles:r4 };
      }
    } catch(e) { console.warn("[TLE] Direct failed:", e.message); }

    // Fallback: frozen
    console.warn("[TLE] All live sources failed — using frozen TLEs");
    const frozen = this._parseFrozenTLEs();
    this._cache = frozen;
    return { source:"frozen", tles:frozen, warning:"live_fetch_failed" };
  },

  async _corsProxy(base) {
    const NORADS = { ISS:25544,IRNSS_1A:39199,IRNSS_1B:39635,IRNSS_1C:40269,CARTOSAT3:44804,RISAT2B:44233,SL16:25260,COSMOS:22675 };
    const results={};
    await Promise.allSettled(Object.entries(NORADS).map(async ([name,norad])=>{
      const url=base+encodeURIComponent(`https://celestrak.org/satcat/tle.php?CATNR=${norad}`);
      try {
        const r=await fetch(url,{signal:AbortSignal.timeout(6000)});
        if(!r.ok) throw new Error(`HTTP ${r.status}`);
        const text=await r.text();
        const recs=window.DEFSPACE_PHYSICS.TLEParser.parse(text);
        if(recs.length>0) { results[name]=recs[0]; console.log(`[TLE] ${name} OK`); }
      } catch(e) { console.warn(`[TLE] ${name} err:`,e.message); }
    }));
    return results;
  },

  async _direct() {
    const NORADS = { ISS:25544,IRNSS_1A:39199,CARTOSAT3:44804 };
    const results={};
    await Promise.allSettled(Object.entries(NORADS).map(async ([name,norad])=>{
      try {
        const r=await fetch(`https://celestrak.org/satcat/tle.php?CATNR=${norad}`,{signal:AbortSignal.timeout(5000),mode:"cors"});
        const text=await r.text();
        const recs=window.DEFSPACE_PHYSICS.TLEParser.parse(text);
        if(recs.length>0) results[name]=recs[0];
      } catch(e) {}
    }));
    return results;
  },

  _parseFrozenTLEs() {
    const parsed={};
    for (const [key,data] of Object.entries(window.DEFSPACE_PHYSICS.FROZEN_TLE)) {
      const recs=window.DEFSPACE_PHYSICS.TLEParser.parse(`${data.name}\n${data.line1}\n${data.line2}`);
      if(recs.length>0) { parsed[key]=recs[0]; console.log(`[TLE] Frozen: ${data.name}`); }
    }
    return parsed;
  },

  epochAgeReport() {
    const report={};
    for (const [name,tle] of Object.entries(this._cache)) {
      const age_s=window.DEFSPACE_PHYSICS.TLEParser.epochAge(tle);
      report[name]={ age_hr:(age_s/3600).toFixed(1), stale:age_s>86400*3, epochJD:tle.epochJD };
    }
    return report;
  },
};

window.DEFSPACE_TLE = TLEFetcher;
console.info("[DEFSPACE TLE] Fetcher loaded — chain: vercel → allorigins → corsproxy → frozen");
