import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import CrosswordGrid from "./components/CrosswordGrid";
import ClueList from "./components/ClueList";
import Header from "./components/Header"; // title + Random link
import Footer from "./components/Footer";

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

  const [puzzle, setPuzzle] = useState(null); // clues
  const [grid, setGrid] = useState([]);       // 25 cells or nulls
  const [cols, setCols] = useState(5);
  const [rows, setRows] = useState(5);
  const [timer, setTimer] = useState(0);
  const [started, setStarted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [intervalId, setIntervalId] = useState(null);
  const [error, setError] = useState("");

  const effectiveDate = useMemo(() => {
    if (dateParam === "random") return null; // will resolve after fetch/redirect
    return /^\d{4}-\d{2}-\d{2}$/.test(dateParam || "") ? dateParam : todayISO();
  }, [dateParam]);

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

      try {
        let url;
        if (dateParam === "random") {
          // server redirects (307) to a concrete date
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
        if (dateParam === 'random') {
          const resolved = res.headers.get('X-Crossword-Date');
          if (resolved && /^\d{4}-\d{2}-\d{2}$/.test(resolved)) {
            navigate(`/${resolved}`, { replace: true });
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

        // base grid
        const isPlayable = (c) =>
          c && (c.type === 1 || typeof c.answer === "string");
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

        // label both Across and Down starts (first index of each clue)
        data.clues.forEach((cl) => {
          const startIdx = cl.cells?.[0];
          if (startIdx != null && initialGrid[startIdx]) {
            initialGrid[startIdx].label = cl.label;
          }
        });

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
      } catch (e) {
        setError(String(e.message || e));
      }
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateParam, effectiveDate]);

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
    }
  }

  async function fetchRandomPuzzle() {
    setLoading(true);
    setError(null);
    try {
      // IMPORTANT: hit your API, not the front-end dev server
      const data = await fetchJSON('/api/puzzle/random');
      setPuzzle(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="relative w-full max-w-5xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[90rem] min-h-[80vh] bg-white rounded-2xl shadow-lg overflow-hidden flex flex-col">
        {/* HEADER: title + Random (Header component includes the Random link) */}
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
              <CrosswordGrid grid={grid} cols={cols} rows={rows} onInput={handleInput} />
            )}
          </div>

          {/* RIGHT: clues (only visible when running) */}
          <aside className="w-72 md:w-80 xl:w-96 2xl:w-[28rem] shrink-0 p-6 overflow-y-auto border-l">
            {started && !paused ? (
              <ClueList clues={puzzle || []} />
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
      </div>
    </main>
  );
}
