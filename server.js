// server.js
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

// --- In-memory cache { date: { timestamp, data } }
const cache = {};
const CACHE_TTL = 1000 * 60 * 60; // 1 hour
const FIRST_DATE = '2014-08-21';

function isValidDateStr(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}
function toDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function fmt(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function todayISO() {
  return fmt(new Date());
}
function daysBetween(a, b) {
  const ms = 24 * 60 * 60 * 1000;
  return Math.floor((toDate(b) - toDate(a)) / ms);
}
function randomDateBetween(aISO, bISO) {
  const span = daysBetween(aISO, bISO);
  const offset = Math.floor(Math.random() * (span + 1));
  const base = toDate(aISO);
  base.setDate(base.getDate() + offset);
  return fmt(base);
}

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
  return { status: r.status, body, type };
}

// 1) RANDOM FIRST so it doesn't get swallowed by :date
app.get('/puzzle/mini/random.json', async (req, res) => {
  const end = todayISO();

  for (let attempt = 0; attempt < 8; attempt++) {
    const date = randomDateBetween(FIRST_DATE, end);
    try {
      const { status, body, type } = await fetchMini(date);
      if (status === 200) {
        // cache it like the date route does
        cache[date] = { timestamp: Date.now(), data: body };
        // tell the client which date was chosen
        res.setHeader('X-Crossword-Date', date);
        console.log("Returning random crossword for", date);
        return res.status(200).type(type).send(body);
      }
    } catch (_) {
      // try another date
    }
  }
  // fallback to first available if we somehow strike out
  const { status, body, type } = await fetchMini(FIRST_DATE);
  res.setHeader('X-Crossword-Date', FIRST_DATE);
  return res.status(status).type(type).send(body);
});

// 2) Plain param route (no regex); validator enforces yyyy-mm-dd
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

// --- Cache admin
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`NYT Mini proxy listening on http://localhost:${PORT}`);
});
