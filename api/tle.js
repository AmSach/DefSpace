// api/tle.js — Vercel Serverless Function
// Proxies Celestrak TLE requests to avoid CORS issues
// Cached for 5 minutes server-side

const https = require('https');

const CATALOGS = {
  stations:  'stations',
  weather:   'weather',
  iridium:   'iridium-NEXT',
  gps:       'gps-ops',
  starlink:  'starlink',
  military:  'tle-new',
  debris:    'cosmos-2251-debris',
};

// Hardcoded fallback TLE (always served if Celestrak is down)
const FALLBACK = {
  stations: `ISS (ZARYA)
1 25544U 98067A   24058.50000000  .00020137  00000-0  36156-3 0  9990
2 25544  51.6411  94.4776 0005106  43.9803  38.4673 15.49913438440938
CSS (TIANHE)
1 48274U 21035A   24058.50000000  .00032100  00000-0  41245-3 0  9992
2 48274  41.4737 137.4392 0006023 261.0342 213.5921 15.62232148163785`,
  gps: `GPS BIIR-2  (PRN 13)
1 28190U 04009A   24058.50000000 -.00000004  00000-0  00000-0 0  9997
2 28190  55.7729 110.0952 0096148 130.6499 230.0825  2.00567367146034
GPS BIIF-1  (PRN 25)
1 36585U 10022A   24058.50000000  .00000021  00000-0  00000-0 0  9993
2 36585  55.0102 345.2817 0058366 340.5082  18.9906  2.00567856  98765`,
};

function fetchTLE(catalog) {
  return new Promise((resolve, reject) => {
    const url = `https://celestrak.org/SOCRATES/query.php?catalog=${catalog}&FORMAT=TLE`;
    const celestrakUrl = `https://celestrak.org/SOCRATES/query.php?catalog=${catalog}&FORMAT=TLE`;
    // Use the standard Celestrak URL
    const finalUrl = `https://celestrak.org/SOCRATES/query.php?catalog=${catalog}&FORMAT=TLE`;
    
    // Try primary Celestrak endpoint
    const primaryUrl = `https://celestrak.org/SOCRATES/query.php?catalog=${catalog}&FORMAT=TLE`;
    https.get(`https://celestrak.org/SOCRATES/query.php?catalog=${encodeURIComponent(catalog)}&FORMAT=TLE`, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Celestrak returned ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

module.exports = async (req, res) => {
  const source = req.query.source || 'stations';
  const catalog = CATALOGS[source] || CATALOGS.stations;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  try {
    const tle = await Promise.race([
      fetchTLE(catalog),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
    ]);

    if (!tle || tle.trim().length < 50) {
      throw new Error('Empty response from Celestrak');
    }
    res.status(200).send(tle);
  } catch (err) {
    console.error('TLE fetch failed:', err.message);
    // Serve fallback - never 404
    const fallback = FALLBACK[source] || FALLBACK.stations;
    res.status(200).send(fallback);
  }
};
