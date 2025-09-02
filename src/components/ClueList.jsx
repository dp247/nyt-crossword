import React, { useMemo } from "react";

function ClueList({
  clues,
  onSelectClue,
  activeDirection,
  activeWordSet,
  activeClueKey,
}) {
  if (!clues) return null;

  // stable across/down arrays
  const { across, down } = useMemo(() => {
    return {
      across: clues.filter((c) => c.direction === "Across"),
      down: clues.filter((c) => c.direction === "Down"),
    };
  }, [clues]);

  const ClueBlock = ({ title, items }) => (
    <div className="text-sm space-y-0.5">
      <h2 className="font-bold mb-1">{title}</h2>
      <ul className="space-y-0.5">
        {items.map((clue) => {
          const key = `${clue.direction}:${clue.label}`;
          const isActive = key === activeClueKey;
          return (
            <li key={key}>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); onSelectClue?.(clue); }}
                className={[
                  "w-full text-left rounded px-2 py-1 hover:bg-gray-100 transition-colors",
                  isActive ? "bg-yellow-50 ring-1 ring-yellow-300" : "",
                ].join(" ")}
                aria-current={isActive ? "true" : "false"}
              >
                <strong className="mr-1">{clue.label}</strong>
                <span className="text-gray-700">{clue.clue}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <div className="text-sm space-y-4">
      <ClueBlock title="Across" items={across} />
      <ClueBlock title="Down" items={down} />
    </div>
  );
}

export default React.memo(ClueList);
