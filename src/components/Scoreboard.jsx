// components/Scoreboard.jsx
import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { loadScores } from "../utils/scoreStorage";

function format(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  return `${m}:${s}`;
}

export default function Scoreboard() {
  const navigate = useNavigate();
  const scores = useMemo(() => {
    const list = loadScores();
    // Sort: most recent date first
    return [...list].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="relative w-full max-w-5xl lg:max-w-6xl xl:max-w-7xl 2xl:max-w-[90rem] min-h-[60vh] bg-white rounded-2xl shadow-lg overflow-hidden flex flex-col">
        {/* HEADER */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h1 className="text-2xl font-bold">Scoreboard</h1>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="border px-3 py-1 rounded hover:bg-gray-100"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={() => navigate(`/${new Date().toISOString().slice(0,10)}`)}
              className="border px-3 py-1 rounded hover:bg-gray-100"
              title="Go to today's puzzle"
            >
              Today
            </button>
          </div>
        </div>

        {/* BODY */}
        <div className="p-6 flex-1 overflow-auto">
          {scores.length === 0 ? (
            <div className="text-gray-500 italic">No completed puzzles yet. Finish a puzzle to record your time!</div>
          ) : (
            <div className="overflow-hidden rounded-xl border">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Best Time</th>
                  </tr>
                </thead>
                <tbody>
                  {scores.map((row) => (
                    <tr key={row.date} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => navigate(`/${row.date}`)}
                          className="underline underline-offset-2 hover:no-underline"
                          title={`Open ${row.date}`}
                        >
                          {row.date}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums">{format(row.seconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* FOOTER (empty for now) */}
        <div className="px-6 py-4 border-t" />
      </div>
    </main>
  );
}
