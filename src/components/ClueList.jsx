import React from "react";

export default function ClueList({ clues }) {
  if (!clues) return null;

  const across = clues.filter((clue) => clue.direction === "Across");
  const down = clues.filter((clue) => clue.direction === "Down");

  return (
    <div className="text-sm space-y-4">
      <div>
        <h2 className="font-bold mb-1">Across</h2>
        <ul className="list-disc list-inside space-y-0.5">
          {across.map((clue, idx) => (
            <li key={idx}>
              <strong>{clue.label}</strong>: {clue.clue}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h2 className="font-bold mt-4 mb-1">Down</h2>
        <ul className="list-disc list-inside space-y-0.5">
          {down.map((clue, idx) => (
            <li key={idx}>
              <strong>{clue.label}</strong>: {clue.clue}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
