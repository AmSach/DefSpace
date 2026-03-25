/**
 * DefSpace v6 — Vercel API Route: TLE Proxy
 * Server-side CelesTrak proxy — no CORS issues on client
 * Full logging of all requests and errors
 */

const CELESTRAK_GP = {
  ISS:       "https://celestrak.org/satcat/tle.php?CATNR=25544",
  IRNSS_1A:  "https://celestrak.org/satcat/tle.php?CATNR=39199",
  IRNSS_1B:  "https://celestrak.org/satcat/tle.php?CATNR=39635",
  IRNSS_1C:  "https://celestrak.org/satcat/tle.php?CATNR=40269",
  CARTOSAT3: "https://celestrak.org/satcat/tle.php?CATNR=44804",
  RISAT2B:   "https://celestrak.org/satcat/tle.php?CATNR=44233",
  SL16:      "https://celestrak.org/satcat/tle.php?CATNR=25260",
  COSMOS:    "https://celestrak.org/satcat/tle.php?CATNR=22675",
};

export default async function handler(req, res) {
  const startTime = Date.now();
  const { norad }  = req.query;
  const ip         = req.headers["x-forwarded-for"] || "local";

  console.log(`[TLE-PROXY] ${new Date().toISOString()} | norad=${norad||"all"} | ip=${ip}`);

  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

  if (req.method === "OPTIONS") return res.status(200).end();

  const targets = norad
    ? { [norad]: CELESTRAK_GP[norad] || `https://celestrak.org/satcat/tle.php?CATNR=${norad}` }
    : CELESTRAK_GP;

  const results = {};
  const errors  = {};

  await Promise.allSettled(
    Object.entries(targets).map(async ([name, url]) => {
      try {
        const r = await fetch(url, {
          headers: { "User-Agent": "DefSpace/6.0 DSA-Simulator iDEX-PRIME-X9" },
          signal: AbortSignal.timeout(6000),
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const text = await r.text();
        if (!text.trim()) throw new Error("empty response");
        results[name] = text.trim();
        console.log(`[TLE-PROXY] OK ${name} | ${text.length} chars`);
      } catch (e) {
        errors[name] = e.message;
        console.warn(`[TLE-PROXY] ERR ${name} | ${e.message}`);
      }
    })
  );

  const elapsed = Date.now() - startTime;
  console.log(`[TLE-PROXY] Done ${elapsed}ms | ok=${Object.keys(results).length} err=${Object.keys(errors).length}`);

  return res.status(200).json({
    ok:        Object.keys(results).length > 0,
    fetchedAt: new Date().toISOString(),
    source:    "celestrak",
    elapsed,
    tles:      results,
    errors:    Object.keys(errors).length ? errors : undefined,
  });
}
