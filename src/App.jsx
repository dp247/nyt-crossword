import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import CrosswordGrid from "./components/CrosswordGrid";
import ClueList from "./components/ClueList";
import Header from "./components/Header";
import Footer from "./components/Footer";
import { recordScore, loadPuzzleState, savePuzzleState, clearPuzzleState } from "./utils/scoreStorage";

// ----- helpers
function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function isPlayableCell(c) { return c && (c.type === 1 || typeof c.answer === "string"); }
function isAllCorrect(grid) {
  return grid.length > 0 && grid.every((c) => !c || (String(c.userInput || "").toUpperCase() === String(c.answer || "").toUpperCase()));
}

export default function App() {
  const params = useParams();
  const navigate = useNavigate();

  const dateParam = params.date;
  const effectiveDate = useMemo(() => {
    if (dateParam === "random") return null;
    return /^\d{4}-\d{2}-\d{2}$/.test(dateParam || "") ? dateParam : todayISO();
  }, [dateParam]);

  // data + ui state
  const [puzzle, setPuzzle] = useState(null); // [{ label, direction, clue, cells: [indices...] }]
  const [grid, setGrid] = useState([]);       // array of playable cells or nulls for black
  const [cols, setCols] = useState(5);
  const [rows, setRows] = useState(5);
  const [error, setError] = useState("");

  // timer state
  const [timer, setTimer] = useState(0);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [intervalId, setIntervalId] = useState(null);

  // keyboard nav / focus state
  const [activeIndex, setActiveIndex] = useState(null);
  const [direction, setDirection] = useState("Across"); // "Across" | "Down"
  const inputRefs = useRef([]); // refs to input fields, one per cell index
  const [completed, setCompleted] = useState(false);    // auto-finish flag

  // timer tick
  useEffect(() => {
    if (!started || paused || completed) return;
    const id = setInterval(() => setTimer((t) => t + 1), 1000);
    setIntervalId(id);
    return () => clearInterval(id);
  }, [started, paused, completed]);

  // fetch puzzle whenever route changes
  useEffect(() => {
    async function load() {
      setError("");
      setPuzzle(null);
      setGrid([]);
      setStarted(false);
      setPaused(false);
      setCompleted(false);
      setTimer(0);
      setActiveIndex(null);
      setDirection("Across");

      try {
        const url =
          dateParam === "random"
            ? `/api/puzzle/mini/random.json`
            : `/api/puzzle/mini/${effectiveDate}.json`;

        const res = await fetch(url, { redirect: "follow" });
        if (!res.ok) {
          const maybeJson = await res.json().catch(() => null);
          const msg = maybeJson?.error || `HTTP ${res.status}`;
          throw new Error(msg);
        }

        // random → header gives us the resolved date
        if (dateParam === "random") {
          const resolved = res.headers.get("X-Crossword-Date");
          if (resolved && /^\d{4}-\d{2}-\d{2}$/.test(resolved)) {
            navigate(`/${resolved}`, { replace: true });
          }
        }

        const meta = await res.json();
        const data = meta?.body?.[0];
        if (!data?.cells || !data?.clues) throw new Error("Malformed NYT payload");

        // dimensions
        const newCols = data?.dimensions?.cols ?? data?.size?.cols ?? (Math.sqrt(data.cells.length) | 0);
        const newRows = data?.dimensions?.rows ?? data?.size?.rows ?? Math.ceil(data.cells.length / newCols);

        // base grid
        const initialGrid = data.cells.map((cell, i) =>
          isPlayableCell(cell)
            ? {
              ...cell,
              id: i,
              userInput: "",
              status: "neutral",
              label: cell.label ?? null,
            }
            : null
        );
        // labels on clue starts
        data.clues.forEach((cl) => {
          const startIdx = cl.cells?.[0];
          if (startIdx != null && initialGrid[startIdx]) {
            initialGrid[startIdx].label = cl.label;
          }
        });

        // core puzzle structure
        const corePuzzle = data.clues.map((c) => ({
          label: c.label,
          direction: c.direction,
          clue: (c.text?.[0]?.plain ?? "").trim(),
          cells: c.cells || [],
        }));

        // Try restoring saved state for this date
        const thisDate = (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null) || effectiveDate || todayISO();
        const saved = loadPuzzleState(thisDate);

        let restoredGrid = initialGrid;
        let restoredTimer = 0, restoredStarted = false, restoredPaused = false, restoredCompleted = false;

        if (saved && Array.isArray(saved.grid) && saved.grid.length === initialGrid.length) {
          // merge saved userInput/status into the fresh grid (answers come from API)
          restoredGrid = initialGrid.map((cell, i) => {
            if (!cell) return null;
            const s = saved.grid[i] || {};
            return {
              ...cell,
              userInput: typeof s.userInput === "string" ? s.userInput : "",
              status: s.status || "neutral",
            };
          });
          restoredTimer = Number.isFinite(saved.timer) ? saved.timer : 0;
          restoredStarted = !!saved.started;
          restoredPaused = !!saved.paused;
          restoredCompleted = !!saved.completed;

          // if it was completed, keep statuses or recompute? We'll keep as-is.
        }

        setPuzzle(corePuzzle);
        setGrid(restoredGrid);
        setCols(newCols);
        setRows(newRows);
        setTimer(restoredTimer);
        setStarted(restoredStarted);
        setPaused(restoredPaused);
        setCompleted(restoredCompleted);

        // pick first playable cell as the starting focus
        const firstPlayable = restoredGrid.findIndex((c) => c && typeof c.answer === "string");
        setActiveIndex(firstPlayable >= 0 ? firstPlayable : null);
        setDirection("Across");
      } catch (e) {
        setError(String(e.message || e));
      }
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateParam, effectiveDate]);

  // keep the active input focused
  useEffect(() => {
    if (activeIndex == null) return;
    const el = inputRefs.current[activeIndex];
    if (el && typeof el.focus === "function") el.focus();
  }, [activeIndex, direction, grid]);

  // ---- word lookup maps
  const { indexToAcross, indexToDown } = useMemo(() => {
    const acrossMap = new Map();
    const downMap = new Map();
    (puzzle || []).forEach((cl) => {
      const cells = cl.cells || [];
      if (!cells.length) return;
      if (cl.direction === "Across") cells.forEach((i) => acrossMap.set(i, cells));
      if (cl.direction === "Down") cells.forEach((i) => downMap.set(i, cells));
    });
    return { indexToAcross: acrossMap, indexToDown: downMap };
  }, [puzzle]);

  // Map each index to its owning clue (by direction) — for clue highlight selection
  const { indexToAcrossClue, indexToDownClue } = useMemo(() => {
    const a = new Map();
    const d = new Map();
    (puzzle || []).forEach((clue) => {
      const cells = clue.cells || [];
      const key = `${clue.direction}:${clue.label}`;
      if (clue.direction === "Across") cells.forEach((i) => a.set(i, key));
      if (clue.direction === "Down") cells.forEach((i) => d.set(i, key));
    });
    return { indexToAcrossClue: a, indexToDownClue: d };
  }, [puzzle]);

  const activeClueKey = useMemo(() => {
    if (activeIndex == null) return null;
    return direction === "Across"
      ? indexToAcrossClue.get(activeIndex) || null
      : indexToDownClue.get(activeIndex) || null;
  }, [activeIndex, direction, indexToAcrossClue, indexToDownClue]);

  function getWordCells(i, dir) {
    if (i == null) return { cells: [], pos: -1 };
    const map = dir === "Across" ? indexToAcross : indexToDown;
    const cells = map.get(i) || [];
    const pos = cells.indexOf(i);
    return { cells, pos };
  }

  // active word highlighting set
  const activeWordSet = useMemo(() => {
    const { cells } = getWordCells(activeIndex, direction);
    return new Set(cells);
  }, [activeIndex, direction, indexToAcross, indexToDown]);

  // Current date helper (used for persistence)
  const currentDate = useMemo(() => {
    return (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null) || effectiveDate || todayISO();
  }, [dateParam, effectiveDate]);

  // ---- input / persistence / auto-finish
  const persistState = useCallback((nextGrid, nextTimer, nextStarted, nextPaused, nextCompleted) => {
    savePuzzleState(currentDate, {
      date: currentDate,
      timer: nextTimer,
      started: nextStarted,
      paused: nextPaused,
      completed: nextCompleted,
      grid: nextGrid.map((c) => (c ? { userInput: c.userInput || "", status: c.status || "neutral" } : null)),
    });
  }, [currentDate]);

  // Finish flow (shared by auto-finish and Check Answers)
  const finishPuzzle = useCallback((finalGrid) => {
    if (intervalId) clearInterval(intervalId);
    setCompleted(true);
    const secs = (t => t)(timer); // freeze current state
    // ensure grid shows correct everywhere
    const corrected = finalGrid.map((c) => (c ? { ...c, status: "correct" } : null));
    setGrid(corrected);
    recordScore({ date: currentDate, seconds: secs });
    persistState(corrected, secs, started, paused, true);
    alert(`🎉 Crossword complete in ${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}!`);
  }, [intervalId, timer, currentDate, persistState, started, paused]);

  function handleInput(index, value) {
    setGrid((prev) => {
      const next = prev.map((cell, i) =>
        i === index && cell
          ? { ...cell, userInput: (value || "").toUpperCase(), status: cell.status === "wrong" ? "neutral" : cell.status }
          : cell
      );

      // Auto-finish check: every playable cell matches answer
      const completedNow = isAllCorrect(next);
      if (completedNow && !completed) {
        // immediate finish
        finishPuzzle(next);
        return next;
      }

      // Persist in-progress state
      persistState(next, timer, started, paused, completed);
      return next;
    });
  }

  function formatTime(seconds) {
    const m = String(Math.floor(seconds / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  function toggleTimer() {
    if (!started) {
      setStarted(true);
      setPaused(false);
      persistState(grid, timer, true, false, completed);
      return;
    }
    setPaused((p) => {
      const next = !p;
      persistState(grid, timer, started, next, completed);
      return next;
    });
  }

  function checkAnswers() {
    if (!grid || grid.length === 0) return;

    const nextGrid = grid.map((cell) => {
      if (!cell) return null;
      const expected = (cell.answer || "").toUpperCase();
      const actual = (cell.userInput || "").toUpperCase();
      if (!actual) return { ...cell, status: "neutral" };
      return { ...cell, status: actual === expected ? "correct" : "wrong" };
    });

    // If everything is correct → finish; else persist marked statuses
    if (nextGrid.every((c) => !c || c.status === "correct")) {
      setGrid(nextGrid);
      finishPuzzle(nextGrid);
    } else {
      setGrid(nextGrid);
      persistState(nextGrid, timer, started, paused, completed);
    }
  }

  // ---- movement helpers (unchanged)
  function moveWithinWord(offset) {
    if (activeIndex == null) return;
    const { cells, pos } = getWordCells(activeIndex, direction);
    if (cells.length === 0) return;
    const nextPos = Math.min(Math.max(pos + offset, 0), cells.length - 1);
    setActiveIndex(cells[nextPos]);
  }
  function jumpToWordEdge(toEnd = false) {
    if (activeIndex == null) return;
    const { cells } = getWordCells(activeIndex, direction);
    if (cells.length === 0) return;
    setActiveIndex(toEnd ? cells[cells.length - 1] : cells[0]);
  }
  function toggleDirection() {
    setDirection((d) => (d === "Across" ? "Down" : "Across"));
  }
  function sameRow(a, b) { return Math.floor(a / cols) === Math.floor(b / cols); }
  function inBounds(idx) { return idx >= 0 && idx < grid.length; }

  function moveByArrow(key) {
    if (activeIndex == null) return;

    let step = null;
    let horizontal = false;
    if (key === "ArrowRight") { step = +1; horizontal = true; }
    if (key === "ArrowLeft") { step = -1; horizontal = true; }
    if (key === "ArrowDown") step = +cols;
    if (key === "ArrowUp") step = -cols;

    if (step == null) return;

    let next = activeIndex + step;

    while (inBounds(next) && (!grid[next] || (horizontal && !sameRow(activeIndex, next)))) {
      if (horizontal && !sameRow(activeIndex, next)) return;
      next += step;
    }

    if (inBounds(next) && grid[next]) {
      setActiveIndex(next);
      if (horizontal) setDirection("Across"); else setDirection("Down");
    }
  }

  function typeLetter(letter) {
    if (activeIndex == null) return;
    const L = letter.toUpperCase();

    setGrid((prev) => {
      const next = prev.map((cell, i) =>
        i === activeIndex && cell ? { ...cell, userInput: L, status: cell.status === "wrong" ? "neutral" : cell.status } : cell
      );

      // advance within current word
      const { cells, pos } = getWordCells(activeIndex, direction);
      const nextPos = pos + 1;
      if (cells.length && nextPos < cells.length) {
        setActiveIndex(cells[nextPos]);
      }

      // Auto-finish if all correct
      const completedNow = isAllCorrect(next);
      if (completedNow && !completed) {
        finishPuzzle(next);
      } else {
        persistState(next, timer, started, paused, completed);
      }

      return next;
    });
  }

  function handleBackspace() {
    if (activeIndex == null) return;
    const here = grid[activeIndex];
    if (!here) return;

    setGrid((prev) => {
      let next = prev;

      if (!here.userInput) {
        // go back one within the word and clear that cell
        const { cells, pos } = getWordCells(activeIndex, direction);
        const prevPos = Math.max(pos - 1, 0);
        const prevIdx = cells.length ? cells[prevPos] : activeIndex;

        next = prev.map((cell, i) =>
          i === prevIdx && cell ? { ...cell, userInput: "" } : cell
        );
        setActiveIndex(prevIdx);
      } else {
        // clear current cell but don't move
        next = prev.map((cell, i) =>
          i === activeIndex && cell ? { ...cell, userInput: "" } : cell
        );
      }

      persistState(next, timer, started, paused, completed);
      return next;
    });
  }

  // ---- clue click handler (stable)
  const handleSelectClue = useCallback((clue) => {
    setDirection(clue.direction);
    setActiveIndex((prev) => {
      const firstPlayable = (clue.cells || []).find((i) => grid[i]);
      return firstPlayable ?? prev;
    });
  }, [grid]);

  // ---- cell click toggles direction if re-clicked
  function handleCellClick(i) {
    if (i == null || !grid[i]) return;
    if (activeIndex === i) {
      setDirection((d) => (d === "Across" ? "Down" : "Across"));
    } else {
      setActiveIndex(i);
      const inAcross = (indexToAcross.get(i) || []).length > 0;
      const inDown = (indexToDown.get(i) || []).length > 0;
      if (inAcross && !inDown) setDirection("Across");
      else if (!inAcross && inDown) setDirection("Down");
    }
  }

  // ---- clear button behavior (bottom-left footer)
  function handleClear() {
    if (grid.length === 0) return;
    const isComplete = isAllCorrect(grid);

    if (isComplete || completed) {
      // Confirm full reset to replay
      if (confirm("Reset this completed crossword to replay from scratch?")) {
        const cleared = grid.map((c) => (c ? { ...c, userInput: "", status: "neutral" } : null));
        setGrid(cleared);
        setTimer(0);
        setStarted(false);
        setPaused(false);
        setCompleted(false);
        clearPuzzleState(currentDate); // or save empty state:
        savePuzzleState(currentDate, { date: currentDate, timer: 0, started: false, paused: false, completed: false, grid: cleared.map((c) => c ? { userInput: "", status: "neutral" } : null) });
      }
    } else {
      // Clear only unchecked/incorrect, keep correct
      const cleared = grid.map((c) => {
        if (!c) return null;
        const exp = String(c.answer || "").toUpperCase();
        const act = String(c.userInput || "").toUpperCase();
        const isCorrect = !!act && act === exp;
        if (isCorrect) return c; // leave as-is
        return { ...c, userInput: "", status: "neutral" };
      });
      setGrid(cleared);
      savePuzzleState(currentDate, { date: currentDate, timer, started, paused, completed: false, grid: cleared.map((c) => c ? { userInput: c.userInput || "", status: c.status || "neutral" } : null) });
    }
  }

  // Save current state if the tab is hidden/closed (so timer progress isn't lost)
  useEffect(() => {
    function persistNow() {
      // capture the latest state to storage
      persistState(grid, timer, started, paused, completed);
    }
    document.addEventListener("visibilitychange", persistNow);
    window.addEventListener("beforeunload", persistNow);
    return () => {
      document.removeEventListener("visibilitychange", persistNow);
      window.removeEventListener("beforeunload", persistNow);
    };
  }, [grid, timer, started, paused, completed, persistState]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div
        className="relative w-full max-w-5xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[90rem] min-h-[80vh] bg-white rounded-2xl shadow-lg overflow-hidden flex flex-col"
        onKeyDown={(e) => {
          if (!started || paused) return;
          const key = e.key || "";
          if (/^[a-zA-Z]$/.test(key)) { e.preventDefault(); typeLetter(key); return; }
          if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key)) { e.preventDefault(); moveByArrow(key); return; }
          if (key === "Backspace") { e.preventDefault(); handleBackspace(); return; }
          if (key === " " || key === "Tab" || key === "Enter") { e.preventDefault(); toggleDirection(); return; }
          if (key === "Home") { e.preventDefault(); jumpToWordEdge(false); return; }
          if (key === "End") { e.preventDefault(); jumpToWordEdge(true); return; }
        }}
        tabIndex={0}
        role="application"
        aria-label="Mini crossword"
      >
        {/* HEADER */}
        <div className="px-6 py-4 border-b">
          <Header />
        </div>

        {/* MAIN */}
        <div className="flex flex-1 overflow-hidden gap-6 xl:gap-10">
          {/* LEFT: grid area */}
          <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
            {error ? (
              <div className="text-center space-y-4">
                <p className="text-red-600">{error}</p>
                <div className="flex justify-center gap-3">
                  <button type="button" onClick={() => navigate("/2014-08-21")} className="border px-3 py-1 rounded hover:bg-gray-100">Go to first available</button>
                  <button type="button" onClick={() => navigate(`/${todayISO()}`)} className="border px-3 py-1 rounded hover:bg-gray-100">Go to today</button>
                  <button type="button" onClick={() => navigate("/random")} className="border px-3 py-1 rounded hover:bg-gray-100">Random</button>
                </div>
              </div>
            ) : (
              <CrosswordGrid
                grid={grid}
                cols={cols}
                rows={rows}
                onInput={handleInput}
                activeIndex={activeIndex}
                setActiveIndex={setActiveIndex}
                direction={direction}
                inputRefs={inputRefs}
                activeWordSet={activeWordSet}
                onCellClick={handleCellClick}
              />
            )}
          </div>

          {/* RIGHT: clues (only visible when running) */}
          <aside className="w-72 md:w-80 xl:w-96 2xl:w-[28rem] shrink-0 p-6 overflow-y-auto border-l">
            {started && !paused ? (
              <ClueList
                clues={puzzle || []}
                onSelectClue={handleSelectClue}
                activeDirection={direction}
                activeWordSet={activeWordSet}
                activeClueKey={activeClueKey}
              />
            ) : (
              <div className="text-gray-500 italic">Press start to reveal the clues…</div>
            )}
          </aside>
        </div>

        {/* FOOTER — left: Clear, center: Check Answers */}
        <div className="px-6 py-4 border-t flex items-center justify-between">
          <button
            type="button"
            onClick={handleClear}
            className="border px-3 py-1 rounded hover:bg-gray-100"
            title="Clear unchecked/incorrect cells (or reset completed puzzle)"
          >
            Clear
          </button>

          <Footer onCheck={checkAnswers} disabled={!started || paused || completed} />
          <div className="w-[80px]" aria-hidden /> {/* spacer to balance layout */}
        </div>

        {/* FLOATING CONTROLS ON RIGHT EDGE */}
        <div className="absolute top-4 right-6 flex items-center gap-4">
          <button
            type="button"
            onClick={toggleTimer}
            className="w-24 border px-4 py-1 rounded hover:bg-gray-100"
          >
            {!started ? "Start" : paused ? "Resume" : "Pause"}
          </button>
          <span className="text-lg font-mono tabular-nums">{formatTime(timer)}</span>
        </div>

        {/* SCOREBOARD BUTTON — bottom-right, near footer (kept from earlier) */}
        <div className="absolute bottom-4 right-6">
          <button
            type="button"
            onClick={() => navigate("/scoreboard")}
            className="border px-3 py-1 rounded hover:bg-gray-100"
            title="View scoreboard"
          >
            Scoreboard
          </button>
        </div>
      </div>
    </main>
  );
}
