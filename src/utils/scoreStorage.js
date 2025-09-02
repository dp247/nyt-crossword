// utils/scoreStorage.js
export const STORAGE_KEY = "nytMiniScoreboard:v1";

/** @returns {Array<{date:string, seconds:number}>} */
export function loadScores() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** @param {Array<{date:string, seconds:number}>} scores */
export function saveScores(scores) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
  } catch {
    /* ignore quota errors */
  }
}

/** Record a time; keep BEST (lowest seconds) per date. */
export function recordScore({ date, seconds }) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const scores = loadScores();
  const idx = scores.findIndex((s) => s.date === date);
  if (idx >= 0) {
    if (typeof scores[idx].seconds !== "number" || seconds < scores[idx].seconds) {
      scores[idx] = { date, seconds };
      saveScores(scores);
      return true;
    }
    return false; // existing is better/equal
  }
  scores.push({ date, seconds });
  saveScores(scores);
  return true;
}
