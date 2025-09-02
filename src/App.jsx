import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import CrosswordGrid from "./components/CrosswordGrid";
import ClueList from "./components/ClueList";
import Header from "./components/Header";
import Footer from "./components/Footer";
import { recordScore } from "./utils/scoreStorage";
import ReactConfetti from "react-confetti";

// ----- helpers
function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export default function App() {
  const params = useParams();
  const navigate = useNavigate();

  // route param may be yyyy-mm-dd or 'random'
  const dateParam = params.date;

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

  const effectiveDate = useMemo(() => {
    if (dateParam === "random") return null; // will resolve after fetch/redirect
    return /^\d{4}-\d{2}-\d{2}$/.test(dateParam || "") ? dateParam : todayISO();
  }, [dateParam]);

  const [showConfetti, setShowConfetti] = useState(false);

  // timer tick
  useEffect(() => {
    if (!started || paused) return;
    const id = setInterval(() => setTimer((t) => t + 1), 1000);
    setIntervalId(id);
    return () => clearInterval(id);
  }, [started, paused]);

  // fetch puzzle whenever route changes
  useEffect(() => {
    async function load() {
      setError("");
      setPuzzle(null);
      setGrid([]);
      setStarted(false);
      setPaused(false);
      setTimer(0);
      setActiveIndex(null);
      setDirection("Across");

      try {
        let url;
        if (dateParam === "random") {
          url = `/api/puzzle/mini/random.json`;
        } else {
          url = `/api/puzzle/mini/${effectiveDate}.json`;
        }

        const res = await fetch(url, { redirect: "follow" });
        if (!res.ok) {
          const maybeJson = await res.json().catch(() => null);
          const msg = maybeJson?.error || `HTTP ${res.status}`;
          throw new Error(msg);
        }

        // if random, update URL to the resolved date (from final redirect URL)
        if (dateParam === "random") {
          const resolved = res.headers.get("X-Crossword-Date");
          if (resolved && /^\d{4}-\d{2}-\d{2}$/.test(resolved)) {
            navigate(`/${resolved}`, { replace: true });
          } else {
            console.warn("Random puzzle resolved date not found in headers");
          }
        }

        const meta = await res.json();
        const data = meta?.body?.[0];
        if (!data?.cells || !data?.clues) throw new Error("Malformed NYT payload");

        // figure out board dimensions (NYT usually includes one of these; otherwise infer)
        const cols =
          data?.dimensions?.cols ??
          data?.size?.cols ??
          Math.sqrt(data.cells.length) | 0; // fallback for perfect squares
        const rows =
          data?.dimensions?.rows ??
          data?.size?.rows ??
          Math.ceil(data.cells.length / cols);

        // build grid: playable if type=1 or has 'answer'
        const isPlayable = (c) => c && (c.type === 1 || typeof c.answer === "string");
        const initialGrid = data.cells.map((cell, i) =>
          isPlayable(cell)
            ? {
              ...cell,
              id: i,
              userInput: "",
              status: "neutral",
              label: cell.label ?? null,
            }
            : null
        );

        // ensure both Across and Down starts have labels (NYT puts label on first cell of each clue)
        data.clues.forEach((cl) => {
          const startIdx = cl.cells?.[0];
          if (startIdx != null && initialGrid[startIdx]) {
            initialGrid[startIdx].label = cl.label;
          }
        });

        // set puzzle & grid
        setPuzzle(
          data.clues.map((c) => ({
            label: c.label,
            direction: c.direction,
            clue: (c.text?.[0]?.plain ?? "").trim(),
            cells: c.cells || [],
          }))
        );
        setGrid(initialGrid);
        setCols(cols);
        setRows(rows);

        // pick first playable cell as the starting focus
        const firstPlayable = initialGrid.findIndex((c) => c && typeof c.answer === "string");
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

  // Map each index to its owning clue (by direction)
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

  // ---- input / timer / check
  function handleInput(index, value) {
    setGrid((prev) =>
      prev.map((cell, i) =>
        i === index && cell
          ? { ...cell, userInput: (value || "").toUpperCase() }
          : cell
      )
    );
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
      return;
    }
    setPaused((p) => !p);
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

    const allCorrect = nextGrid.every((cell) => !cell || cell.status === "correct");
    setGrid(nextGrid);

    if (allCorrect) {
      if (intervalId) clearInterval(intervalId);
      alert(`🎉 Crossword complete in ${formatTime(timer)}!`);
      if (intervalId) clearInterval(intervalId);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 30000);
      // Persist score: keep best per date
      const currentDate =
        (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : null) ||
        effectiveDate ||
        todayISO();
      recordScore({ date: currentDate, seconds: timer });
      alert(`🎉 Crossword complete in ${formatTime(timer)}!`);
    }
  }

  function handleCellClick(i) {
    if (i == null || !grid[i]) return;

    if (activeIndex === i) {
      // Clicking the same cell toggles direction
      setDirection(d => (d === "Across" ? "Down" : "Across"));
    } else {
      // New cell: make it active…
      setActiveIndex(i);
      // …and choose a default direction that actually exists for this cell
      const inAcross = indexToAcross.has(i);
      const inDown = indexToDown.has(i);
      if (inAcross && !inDown) setDirection("Across");
      else if (!inAcross && inDown) setDirection("Down");
      // if it's in both, keep current direction (nice UX), or force Across if you prefer
      // else if (inAcross && inDown) setDirection("Across");
    }
  }


  // ---- movement helpers
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

  function sameRow(a, b) {
    return Math.floor(a / cols) === Math.floor(b / cols);
  }

  function inBounds(idx) {
    return idx >= 0 && idx < grid.length;
  }

  function moveByArrow(key) {
    if (activeIndex == null) return;

    let step = null;
    let horizontal = false;
    if (key === "ArrowRight") {
      step = +1;
      horizontal = true;
    }
    if (key === "ArrowLeft") {
      step = -1;
      horizontal = true;
    }
    if (key === "ArrowDown") step = +cols;
    if (key === "ArrowUp") step = -cols;

    if (step == null) return;

    let next = activeIndex + step;

    while (inBounds(next) && (!grid[next] || (horizontal && !sameRow(activeIndex, next)))) {
      // if we wrapped to another row on horizontal, stop
      if (horizontal && !sameRow(activeIndex, next)) return;
      next += step;
    }

    if (inBounds(next) && grid[next]) {
      setActiveIndex(next);
      // auto-adjust direction to movement axis
      if (horizontal) setDirection("Across");
      else setDirection("Down");
    }
  }

  function typeLetter(letter) {
    if (activeIndex == null) return;
    const L = letter.toUpperCase();

    setGrid((prev) =>
      prev.map((cell, i) =>
        i === activeIndex && cell ? { ...cell, userInput: L } : cell
      )
    );

    // advance within current word
    const { cells, pos } = getWordCells(activeIndex, direction);
    const nextPos = pos + 1;
    if (cells.length && nextPos < cells.length) {
      setActiveIndex(cells[nextPos]);
    }
  }

  function handleBackspace() {
    if (activeIndex == null) return;
    const here = grid[activeIndex];
    if (!here) return;

    if (!here.userInput) {
      // go back one within the word and clear that cell
      const { cells, pos } = getWordCells(activeIndex, direction);
      const prevPos = Math.max(pos - 1, 0);
      const prevIdx = cells.length ? cells[prevPos] : activeIndex;

      setGrid((prev) =>
        prev.map((cell, i) =>
          i === prevIdx && cell ? { ...cell, userInput: "" } : cell
        )
      );
      setActiveIndex(prevIdx);
    } else {
      // clear current cell but don't move
      setGrid((prev) =>
        prev.map((cell, i) =>
          i === activeIndex && cell ? { ...cell, userInput: "" } : cell
        )
      );
    }
  }

  // ---- global key handler (attached to the card container)
  function handleKeyDown(e) {
    // only handle when started and not paused (keeps the "clues hidden" rule meaningful)
    if (!started || paused) return;

    const key = e.key || "";

    // Letters
    if (/^[a-zA-Z]$/.test(key)) {
      e.preventDefault();
      typeLetter(key);
      return;
    }

    // Navigation
    if (key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown") {
      e.preventDefault();
      moveByArrow(key);
      return;
    }

    if (key === "Backspace") {
      e.preventDefault();
      handleBackspace();
      return;
    }

    if (key === " " || key === "Tab" || key === "Enter") {
      e.preventDefault();
      toggleDirection();
      return;
    }

    if (key === "Home") {
      e.preventDefault();
      jumpToWordEdge(false);
      return;
    }

    if (key === "End") {
      e.preventDefault();
      jumpToWordEdge(true);
      return;
    }
  }

  // ---- clue click handler
  const handleSelectClue = useCallback((clue) => {
    setDirection(clue.direction);
    // use current grid safely
    setActiveIndex((prev) => {
      const firstPlayable = (clue.cells || []).find((i) => grid[i]);
      return firstPlayable ?? prev;
    });
  }, [grid]); // <— this won’t change on every tick; only when the grid changes


  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      {showConfetti && <ReactConfetti recycle={false} />}
      <div
        className="relative w-full max-w-5xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[90rem] min-h-[80vh] bg-white rounded-2xl shadow-lg overflow-hidden flex flex-col"
        onKeyDown={handleKeyDown}
        tabIndex={0} // so the card itself can capture keys
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
                  <button
                    onClick={() => navigate("/2014-08-21")}
                    className="border px-3 py-1 rounded hover:bg-gray-100"
                  >
                    Go to first available
                  </button>
                  <button
                    onClick={() => navigate(`/${todayISO()}`)}
                    className="border px-3 py-1 rounded hover:bg-gray-100"
                  >
                    Go to today
                  </button>
                  <button
                    onClick={() => navigate("/random")}
                    className="border px-3 py-1 rounded hover:bg-gray-100"
                  >
                    Random
                  </button>
                </div>
              </div>
            ) : (
              <CrosswordGrid
                grid={grid}
                cols={cols}
                rows={rows}
                onInput={handleInput}
                activeIndex={activeIndex}
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
              <div className="text-gray-500 italic">
                Press start to reveal the clues…
              </div>
            )}
          </aside>
        </div>

        {/* FOOTER */}
        <div className="px-6 py-4 border-t flex justify-center">
          <Footer onCheck={checkAnswers} disabled={!started || paused} />
        </div>

        {/* FLOATING CONTROLS ON RIGHT EDGE */}
        <div className="absolute top-4 right-6 flex items-center gap-4">
          <button
            onClick={toggleTimer}
            className="w-24 border px-4 py-1 rounded hover:bg-gray-100"
          >
            {!started ? "Start" : paused ? "Resume" : "Pause"}
          </button>
          <span className="text-lg font-mono tabular-nums">
            {formatTime(timer)}
          </span>
        </div>
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
