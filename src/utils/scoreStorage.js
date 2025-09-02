// utils/scoreStorage.js
export const STORAGE_KEY_SCORES = "nytMiniScoreboard:v1";
export const STORAGE_KEY_STATE  = "nytMiniStates:v1";

/** --------- SCOREBOARD (best times) ---------- **/
export function loadScores() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SCORES);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveScores(scores) {
  try {
    localStorage.setItem(STORAGE_KEY_SCORES, JSON.stringify(scores));
  } catch {}
}

export function recordScore({ date, seconds }) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const list = loadScores();
  const i = list.findIndex((x) => x.date === date);
  if (i >= 0) {
    if (typeof list[i].seconds !== "number" || seconds < list[i].seconds) {
      list[i] = { date, seconds };
      saveScores(list);
      return true;
    }
    return false;
  }
  list.push({ date, seconds });
  saveScores(list);
  return true;
}

export function clearScores() {
  try {
    localStorage.removeItem(STORAGE_KEY_SCORES);
  } catch {}
}

/** --------- PUZZLE STATE (per date) ---------- **/
// shape: { date: "YYYY-MM-DD", timer, started, paused, completed, grid: [{userInput, status}] }
export function loadPuzzleState(date) {
  if (!date) return null;
  try {
    const allRaw = localStorage.getItem(STORAGE_KEY_STATE);
    const all = allRaw ? JSON.parse(allRaw) : {};
    return all?.[date] || null;
  } catch {
    return null;
  }
}

export function savePuzzleState(date, state) {
  if (!date) return;
  try {
    const allRaw = localStorage.getItem(STORAGE_KEY_STATE);
    const all = allRaw ? JSON.parse(allRaw) : {};
    all[date] = state;
    localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(all));
  } catch {}
}

export function clearPuzzleState(date) {
  if (!date) return;
  try {
    const allRaw = localStorage.getItem(STORAGE_KEY_STATE);
    const all = allRaw ? JSON.parse(allRaw) : {};
    if (all[date]) {
      delete all[date];
      localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(all));
    }
  } catch {}
}
