import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import CrosswordGrid from "./components/CrosswordGrid";
import ClueList from "./components/ClueList";
import Header from "./components/Header";
import Footer from "./components/Footer";
import ConfirmClearModal from "./components/ConfirmClearModal";
import { recordScore, loadPuzzleState, savePuzzleState, clearPuzzleState } from "./utils/scoreStorage";
import ReactConfetti from "react-confetti";
import "./App.css";
import winSfx from "./assets/win.mp3";


// Return today's date as yyyy-mm-dd
function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// A cell is playable if it's not null and either type 1 (normal) or has an answer string
function isPlayableCell(c) { return c && (c.type === 1 || typeof c.answer === "string"); }

// Check if every playable cell is correctly filled
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

  const [puzzle, setPuzzle] = useState(null);
  const [grid, setGrid] = useState([]);
  const [cols, setCols] = useState(5);
  const [rows, setRows] = useState(5);
  const [error, setError] = useState("");

  const [timer, setTimer] = useState(0);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [intervalId, setIntervalId] = useState(null);

  const [activeIndex, setActiveIndex] = useState(null);
  const [direction, setDirection] = useState("Across");
  const inputRefs = useRef([]);
  const [showClearModal, setShowClearModal] = useState(false);
  const resumeAfterModalRef = useRef(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [finalTime, setFinalTime] = useState(null);

  const isPlaying = started && !paused && !completed;

  const winAudioRef = React.useRef(null);
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    const el = new Audio(winSfx);
    el.preload = "auto";
    el.volume = 0.6;
    winAudioRef.current = el;
  }, []);

  // Timer effect
  useEffect(() => {
    if (!started || paused || completed) return;
    const id = setInterval(() => setTimer((t) => t + 1), 1000);
    setIntervalId(id);
    return () => clearInterval(id);
  }, [started, paused, completed]);

  // Load puzzle effect (on dateParam change)
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
      setShowConfetti(false);
      setShowToast(false);
      setFinalTime(null);

      try {
        const url =
          dateParam === "random"
            ? `/api/puzzle/mini/random.json`
            : `/api/puzzle/mini/${effectiveDate}.json`;

        // Fetch from our backend proxy
        const res = await fetch(url);
        if (!res.ok) {
          const maybeJson = await res.json().catch(() => null);
          const msg = maybeJson?.error || `HTTP ${res.status}`;
          throw new Error(msg);
        }
        const meta = await res.json();

        // If we requested "random" and got a resolvedDate, redirect to that date
        if (dateParam === "random" && meta?.resolvedDate) {
          navigate(`/${meta.resolvedDate}`, { replace: true });
        }

        // Parse and validate payload
        const data = meta?.body?.[0];
        if (!data?.cells || !data?.clues) throw new Error("Malformed NYT payload");

        // Determine grid size
        // Prefer dimensions or size from API; else infer from cell count
        // (usually 5x5, but some early ones are 4x4 and some special ones are other sizes)
        // eslint-disable-next-line no-bitwise
        const newCols = data?.dimensions?.cols ?? data?.size?.cols ?? (Math.sqrt(data.cells.length) | 0);
        const newRows = data?.dimensions?.rows ?? data?.size?.rows ?? Math.ceil(data.cells.length / newCols);

        // Build initial grid state
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
        // Add clue labels to starting cells
        data.clues.forEach((cl) => {
          const startIdx = cl.cells?.[0];
          if (startIdx != null && initialGrid[startIdx]) {
            initialGrid[startIdx].label = cl.label;
          }
        });

        // Core puzzle clues
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

        // Validate saved state
        if (saved && Array.isArray(saved.grid) && saved.grid.length === initialGrid.length) {
          // Merge saved state into initial grid
          restoredGrid = initialGrid.map((cell, i) => {
            if (!cell) return null;
            const s = saved.grid[i] || {};
            return {
              ...cell,
              userInput: typeof s.userInput === "string" ? s.userInput : "",
              status: s.status || "neutral",
            };
          });

          // Validate saved statuses (only "neutral", "correct", "wrong" allowed)
          restoredTimer = Number.isFinite(saved.timer) ? saved.timer : 0;
          restoredStarted = !!saved.started;
          restoredPaused = !!saved.paused;
          restoredCompleted = !!saved.completed;
        }

        setPuzzle(corePuzzle);
        setGrid(restoredGrid);
        setCols(newCols);
        setRows(newRows);
        setTimer(restoredTimer);
        setStarted(restoredStarted);
        setPaused(restoredPaused);
        setCompleted(restoredCompleted);

        // Set first active cell (first playable cell in the grid)
        const firstPlayable = restoredGrid.findIndex((c) => c && typeof c.answer === "string");
        setActiveIndex(firstPlayable >= 0 ? firstPlayable : null);
        setDirection("Across");
      } catch (e) {
        setError(String(e.message || e));
      }
    }

    load();
  }, [dateParam, effectiveDate]);

  // Focus effect (on activeIndex/direction/grid change)
  useEffect(() => {
    if (activeIndex == null) return;
    const el = inputRefs.current[activeIndex];
    if (el && typeof el.focus === "function") el.focus();
  }, [activeIndex, direction, grid]);

  // Map each index to its full across/down word (for active word highlight)
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

  // Maps from cell index to clue key (e.g. "Across:3") for active clue tracking
  // (a cell may belong to multiple clues, but we just pick one arbitrarily here)
  // Used to highlight the active clue in the clue list
  // (if the active cell doesn't belong to any clue in the current direction, this will be null)
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

  // Current active clue key (e.g. "Across:3") or null if none
  const activeClueKey = useMemo(() => {
    if (activeIndex == null) return null;
    return direction === "Across"
      ? indexToAcrossClue.get(activeIndex) || null
      : indexToDownClue.get(activeIndex) || null;
  }, [activeIndex, direction, indexToAcrossClue, indexToDownClue]);

  // Given a cell index and direction, return the full word's cell indices and the position of the given index within that word
  // If the index is null or not part of any word in that direction, returns { cells: [], pos: -1 }
  // Used for active word highlighting and movement within the word
  function getWordCells(i, dir) {
    if (i == null) return { cells: [], pos: -1 };
    const map = dir === "Across" ? indexToAcross : indexToDown;
    const cells = map.get(i) || [];
    const pos = cells.indexOf(i);
    return { cells, pos };
  }

  // Set of cell indices in the current active word (for highlighting)
  // Recomputed only when activeIndex or direction changes
  const activeWordSet = useMemo(() => {
    const { cells } = getWordCells(activeIndex, direction);
    return new Set(cells);
  }, [activeIndex, direction, indexToAcross, indexToDown]);

  // Current effective date (validated dateParam or today)
  // Used for persistence key
  const currentDate = useMemo(() => {
    return (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null) || effectiveDate || todayISO();
  }, [dateParam, effectiveDate]);

  // Persist state helper (stable)
  // Saves to localStorage under the current date key
  // Strips out unneeded cell data before saving
  // Called whenever grid/timer/started/paused/completed changes
  // (but not on every keystroke, only when the grid state changes)
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

  // Finish puzzle helper (stable)
  // Stops timer, marks everything correct, shows alert, records score, persists state
  // Called when user completes the puzzle or when auto-complete is detected
  const finishPuzzle = useCallback(async (finalGrid) => {
    blurActive();

    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 10000);

    // Stop timer and mark completed
    if (intervalId) clearInterval(intervalId);
    setCompleted(true);

    // Freeze timer and show toast
    const secs = (t => t)(timer);
    setFinalTime(formatTime(secs));
    setShowToast(true);

    try {
      if (soundEnabled) await winAudioRef.current?.play();
    } catch (_) {
      // autoplay may be blocked until user interacts; ignore errors
    }

    // ensure grid shows correct everywhere
    const corrected = finalGrid.map((c) => (c ? { ...c, status: "correct" } : null));
    setGrid(corrected);
    recordScore({ date: currentDate, seconds: secs });
    persistState(corrected, secs, started, paused, true);
  }, [intervalId, timer, currentDate, persistState, started, paused]);

  // Handle input change in a cell
  function handleInput(index, value) {
    setGrid((prev) => {
      if (!prev[index] || prev[index].status === "correct") return prev;
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

  // Format time as mm:ss
  function formatTime(seconds) {
    const m = String(Math.floor(seconds / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  // Start/pause/resume button handler
  function toggleTimer() {
    if (!started) {
      setStarted(true);
      setPaused(false);
      persistState(grid, timer, true, false, completed);
      setTimeout(() => {
        const el = inputRefs.current[activeIndex];
        el?.focus?.();
      }, 0);
      return;
    }
    setPaused((p) => {
      const next = !p;
      persistState(grid, timer, started, next, completed);
      if (!next) {
        // we just resumed → focus the active cell
        setTimeout(() => {
          const el = inputRefs.current[activeIndex];
          el?.focus?.();
        }, 0);
      }
      return next;
    });
  }

  function firstEditableIndex(cells, grid) {
    if (!cells?.length) return null;
    for (const idx of cells) {
      const c = grid[idx];
      if (c && c.status !== "correct" && !c.userInput) return idx; // prefer empty
    }
    for (const idx of cells) {
      const c = grid[idx];
      if (c && c.status !== "correct") return idx; // any non-locked
    }
    return null;
  }

  function firstEditableAnywhere(grid) {
    for (let i = 0; i < grid.length; i++) {
      const c = grid[i];
      if (c && c.status !== "correct") return i;
    }
    return null;
  }

  function blurActive() {
    if (activeIndex != null) {
      const el = inputRefs.current[activeIndex];
      if (el && el.blur) el.blur();
    }
  }

  // Check answers button handler
  // Marks each cell as correct/wrong/neutral based on user input
  function checkAnswers() {
    if (!grid || grid.length === 0) return;

    const nextGrid = grid.map((cell) => {
      if (!cell) return null;
      const expected = (cell.answer || "").toUpperCase();
      const actual = (cell.userInput || "").toUpperCase();
      if (!actual) return { ...cell, status: "neutral" };
      return { ...cell, status: actual === expected ? "correct" : "wrong" };
    });

    // If all correct now, finish the puzzle
    if (nextGrid.every((c) => !c || c.status === "correct")) {
      setGrid(nextGrid);
      blurActive();
      finishPuzzle(nextGrid);
    } else {
      setGrid(nextGrid);
      // if focus landed on a locked cell, move to next editable in the current word
      if (activeIndex != null && nextGrid[activeIndex]?.status === "correct") {
        // Try same word in current direction
        const { cells } = getWordCells(activeIndex, direction);
        let target = firstEditableIndex(cells, nextGrid);
        // Else try anywhere
        if (target == null) target = firstEditableAnywhere(nextGrid);
        // Else clear selection and blur
        if (target != null) setActiveIndex(target);
        else {
          setActiveIndex(null);
          blurActive();
        }
      }
      persistState(nextGrid, timer, started, paused, completed);
    }
  }

  // Movement within the current word
  function moveWithinWord(offset) {
    if (activeIndex == null) return;
    const { cells, pos } = getWordCells(activeIndex, direction);
    if (cells.length === 0) return;
    const nextPos = Math.min(Math.max(pos + offset, 0), cells.length - 1);
    setActiveIndex(cells[nextPos]);
  }

  // Jump to start or end of current word
  function jumpToWordEdge(toEnd = false) {
    if (activeIndex == null) return;
    const { cells } = getWordCells(activeIndex, direction);
    if (cells.length === 0) return;
    setActiveIndex(toEnd ? cells[cells.length - 1] : cells[0]);
  }

  // Toggle direction between Across and Down
  function toggleDirection() {
    const nextDir = direction === "Across" ? "Down" : "Across";
    const { cells } = getWordCells(activeIndex, nextDir);
    const target = firstEditableIndex(cells, grid);
    if (target != null) setActiveIndex(target);
    setDirection(nextDir);
  }

  // Move by arrow keys, skipping non-playable cells and wrapping within rows for left/right
  function sameRow(a, b) { return Math.floor(a / cols) === Math.floor(b / cols); }

  // Check if index is within grid bounds
  function inBounds(idx) { return idx >= 0 && idx < grid.length; }

  // Move active cell by arrow key, skipping non-playable cells
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

  // Type a letter into the active cell and move forward within the word
  function typeLetter(letter) {
    if (activeIndex == null) return;
    const L = letter.toUpperCase();

    setGrid((prev) => {
      const next = prev.map((cell, i) =>
        i === activeIndex && cell ? { ...cell, userInput: L, status: cell.status === "wrong" ? "neutral" : cell.status } : cell
      );

      // 
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

  function firstUnfilledIndex(cells, grid) {
    if (!cells?.length) return null;
    for (const idx of cells) {
      const c = grid[idx];
      if (c && !c.userInput) return idx; // first truly empty
    }
    // fallback: everything filled → go to the first cell
    return cells[0];
  }

  function firstEditableIndex(cells, grid) {
    if (!cells?.length) return null;
    for (const idx of cells) {
      const c = grid[idx];
      if (c && c.status !== "correct" && !c.userInput) return idx; // prefer empty & editable
    }
    // if none empty, allow the first *non-locked* to edit/overwrite; else fallback to first
    for (const idx of cells) {
      const c = grid[idx];
      if (c && c.status !== "correct") return idx;
    }
    return null; // whole word locked
  }




  const handleSelectClue = useCallback((clue) => {
    setDirection(clue.direction);
    const target = firstEditableIndex(clue.cells, grid);
    if (target != null) setActiveIndex(target);
  }, [grid]);

  // ---- cell click toggles direction if re-clicked
  function handleCellClick(i) {
    if (i == null || !grid[i]) return;
    if (activeIndex === i) {
      const nextDir = direction === "Across" ? "Down" : "Across";
      const { cells } = getWordCells(i, nextDir);
      const target = firstEditableIndex(cells, grid);
      if (target != null) setActiveIndex(target);
      setDirection(nextDir);
    } else {
      setActiveIndex(i);
      const inAcross = (indexToAcross.get(i) || []).length > 0;
      const inDown = (indexToDown.get(i) || []).length > 0;
      if (inAcross && !inDown) setDirection("Across");
      else if (!inAcross && inDown) setDirection("Down");
      else {
        // If the cell belongs to both, prefer the word with an empty cell
        const aTarget = firstUnfilledIndex(indexToAcross.get(i), grid);
        const dTarget = firstUnfilledIndex(indexToDown.get(i), grid);
        if (aTarget != null && dTarget == null) setDirection("Across");
        else if (dTarget != null && aTarget == null) setDirection("Down");
      }
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

  function handlePlayAnother() {
    // close celebration UI so it doesn't linger during route change
    setShowToast(false);
    setShowConfetti(false);
    navigate("/random");
  }

  function openClearModal() {
    if (grid.length === 0) return;
    // remember if timer was running; pause while modal is open
    resumeAfterModalRef.current = started && !paused && !completed;
    if (resumeAfterModalRef.current) {
      setPaused(true);
      persistState(grid, timer, started, true, completed);
    }
    setShowClearModal(true);
  }

  function closeClearModal() {
    setShowClearModal(false);
    // resume only if we were running before opening
    if (resumeAfterModalRef.current && !completed) {
      setPaused(false);
      persistState(grid, timer, started, false, completed);
    }
    resumeAfterModalRef.current = false;
  }

  // Clear only unchecked/incorrect/blank cells; keep correct
  function clearErrors() {
    const cleared = grid.map((c) => {
      if (!c) return null;
      const exp = String(c.answer || "").toUpperCase();
      const act = String(c.userInput || "").toUpperCase();
      const correct = !!act && act === exp;
      return correct ? c : { ...c, userInput: "", status: "neutral" };
    });
    setGrid(cleared);
    // keep playing; puzzle is not completed after this
    savePuzzleState(currentDate, {
      date: currentDate,
      timer,
      started,
      paused: true, // still paused until modal closes
      completed: false,
      grid: cleared.map((c) => (c ? { userInput: c.userInput || "", status: c.status || "neutral" } : null)),
    });
    closeClearModal();
  }

  // Clear everything and fully reset this date’s puzzle
  function clearAll() {
    const cleared = grid.map((c) => (c ? { ...c, userInput: "", status: "neutral" } : null));
    setGrid(cleared);
    setTimer(0);
    setStarted(false);
    setPaused(false);
    setCompleted(false);
    clearPuzzleState(currentDate);
    savePuzzleState(currentDate, {
      date: currentDate,
      timer: 0,
      started: false,
      paused: false,
      completed: false,
      grid: cleared.map((c) => (c ? { userInput: "", status: "neutral" } : null)),
    });
    closeClearModal();
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
      {showConfetti && <ReactConfetti recycle={false} numberOfPieces={600} />}

      {/* TOAST */}
      {showToast && (
        <div
          className="fixed top-0 left-1/2 -translate-x-1/2 z-50
               transform transition-transform duration-500 ease-out
               translate-y-[-100%] animate-[slideDown_0.5s_ease-out_forwards]"
          role="status"
          aria-live="polite"
        >
          <div className="rounded-xl shadow-xl border bg-white/95 backdrop-blur px-5 py-3 flex items-center gap-3">
            <span className="text-2xl">🎉</span>
            <div className="text-left">
              <div className="font-semibold">Crossword completed!</div>
              <div className="text-sm text-gray-600">
                Final time:{" "}
                <span className="font-mono tabular-nums">{finalTime}</span>
              </div>
            </div>
            <button
              onClick={handlePlayAnother}
              className="ml-2 rounded-lg px-3 py-1 text-sm bg-blue-600 text-white hover:bg-blue-700"
              type="button"
            >
              Play another
            </button>
            <button
              onClick={() => navigate("/scoreboard")}
              className="ml-2 rounded-lg px-2 py-1 text-sm border hover:bg-gray-100"
              type="button"
            >
              Scoreboard
            </button>
            <button
              onClick={() => setShowToast(false)}
              className="ml-2 rounded-lg px-2 py-1 text-sm border hover:bg-gray-100"
              type="button"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Render the card */}
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
          <div className="flex items-center justify-between">
            <Header date={currentDate} />
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={toggleTimer}
                className="w-24 border px-4 py-1 rounded hover:bg-gray-100"
              >
                {!started ? "Start" : paused ? "Resume" : "Pause"}
              </button>
              <span className="text-lg font-mono tabular-nums leading-none">
                {formatTime(timer)}
              </span>
            </div>
          </div>
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
                disabled={!isPlaying}
              />
            )}
          </div>

          {/* RIGHT: clues (only visible when running) */}
          <aside className="w-72 md:w-80 xl:w-96 2xl:w-[32rem] shrink-0 p-6 overflow-y-auto border-l">
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
        <div className="px-6 py-4 border-t">
          <Footer>
            <button
              type="button"
              onClick={openClearModal}
              className="border px-3 py-1 rounded hover:bg-gray-100"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={checkAnswers}
              disabled={!started || paused}
              className="bg-blue-600 text-white px-6 py-2 rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              Check Answers
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => navigate("/random")}
                className="border px-3 py-1 rounded hover:bg-gray-100"
              >
                Random
              </button>
              <button
                type="button"
                onClick={() => navigate("/scoreboard")}
                className="border px-3 py-1 rounded hover:bg-gray-100"
              >
                Scoreboard
              </button>
            </div>
          </Footer>
        </div>
        <ConfirmClearModal
          open={showClearModal}
          onClose={closeClearModal}
          onClearErrors={clearErrors}
          onClearAll={clearAll}
          disabledClearErrors={completed || isAllCorrect(grid)}
        />
      </div>
    </main>
  );
}
