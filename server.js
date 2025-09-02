const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

const cache = {};
const CACHE_TTL = 1000 * 60 * 60; // 1 hour
const FIRST_DATE = '2014-08-21';

app.use((req, _res, next) => {
  if (req.url.startsWith('/api/')) {
    req.url = req.url.slice(4); // remove leading '/api'
  }
  next();
});

function isValidDateStr(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// Parse a yyyy-mm-dd date string into a Date object
function toDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Format a Date object as yyyy-mm-dd
function fmt(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Return today's date as yyyy-mm-dd
function todayISO() {
  return fmt(new Date());
}

// Return number of days between two date strings (a, b)
// Both a and b must be valid date strings (yyyy-mm-dd)
function daysBetween(a, b) {
  const ms = 24 * 60 * 60 * 1000;
  return Math.floor((toDate(b) - toDate(a)) / ms);
}

// Return a random date string between aISO and bISO (inclusive)
// Both aISO and bISO must be valid date strings (yyyy-mm-dd)
function randomDateBetween(aISO, bISO) {
  const span = daysBetween(aISO, bISO);
  const offset = Math.floor(Math.random() * (span + 1));
  const base = toDate(aISO);
  base.setDate(base.getDate() + offset);
  return fmt(base);
}

// Middleware to validate :date param
// If invalid, respond with 400 and error message
function validateDateMiddleware(req, res, next) {
  const date = req.params.date;
  if (!isValidDateStr(date)) {
    return res.status(400).json({ ok: false, error: 'Bad date format, expected yyyy-mm-dd' });
  }
  // enforce first date and not after today
  if (toDate(date) < toDate(FIRST_DATE)) {
    return res.status(400).json({
      error: 'Date is before the first NYT Mini (2014-08-21).',
      firstAvailable: FIRST_DATE
    });
  }
  if (toDate(date) > toDate(todayISO())) {
    return res.status(400).json({
      error: 'Date is in the future.',
      lastAvailable: todayISO()
    });
  }
  next();
}

// Fetch the mini puzzle JSON for a given date
// Returns { status, body, type }
async function fetchMini(date) {
  const url = `https://www.nytimes.com/svc/crosswords/v6/puzzle/mini/${date}.json`;
  const r = await fetch(url, {
    headers: {
      'X-Games-Auth-Bypass': 'true',
      'Referer': `https://www.nytimes.com/crosswords/game/mini/${date}`,
      'User-Agent': 'Mozilla/5.0',
      'Accept': '*/*',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  const body = await r.text();
  const type = r.headers.get('content-type') || 'application/json';
  console.log("Returning crossword for", date)
  return { status: r.status, body, type };
}

// Random mini route: try up to 5 times to find a date that exists
// If all fail, return the first date as a fallback
// Response format: { resolvedDate, body: [nytJson] }
app.use(express.json());
app.get('/puzzle/mini/random.json', async (req, res) => {
  try {
    const end = todayISO();
    for (let attempt = 0; attempt < 5; attempt++) {
      const date = randomDateBetween(FIRST_DATE, end);
      const { status, body, type } = await fetchMini(date);
      if (status === 200) {
        const nyt = JSON.parse(body);
        cache[date] = { timestamp: Date.now(), data: body };
        return res.json({ resolvedDate: date, body: [nyt] });
      }
    }

    const fallback = FIRST_DATE;
    const { body } = await fetchMini(fallback);
    const nyt = JSON.parse(body);
    return res.json({ resolvedDate: fallback, body: [nyt] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
});


// Specific date route with caching
// Response format: [nytJson]
app.get('/puzzle/mini/:date.json', validateDateMiddleware, async (req, res) => {
  const date = req.params.date;
  const now = Date.now();

  if (cache[date] && now - cache[date].timestamp < CACHE_TTL) {
    return res.type('application/json').send(cache[date].data);
  }

  try {
    const { status, body, type } = await fetchMini(date);
    cache[date] = { timestamp: now, data: body };
    res.status(status).type(type).send(body);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Cache management routes
app.get('/cache/clear', (req, res) => {
  Object.keys(cache).forEach(k => delete cache[k]);
  res.json({ ok: true, message: 'Cache cleared' });
});
app.get('/cache/clear/:date', (req, res) => {
  const date = req.params.date;
  if (cache[date]) {
    delete cache[date];
    res.json({ ok: true, message: `Cache cleared for ${date}` });
  } else {
    res.json({ ok: false, message: `No cache entry for ${date}` });
  }
});

const path = require('path');
app.use(express.static(path.join(__dirname, 'dist')));

const SPA_ROUTES = /^(?!\/(puzzle|cache)\/).*/;
app.get(SPA_ROUTES, (_req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`NYT Mini proxy listening on http://localhost:${PORT}`);
});
