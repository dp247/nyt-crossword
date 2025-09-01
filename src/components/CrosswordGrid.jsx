import React from "react";

export default function CrosswordGrid({ grid, cols = 5, rows = 5, onInput }) {
  if (!grid || grid.length === 0) return null;

  // We'll size each square via a CSS var:
  //   --cell = clamp(min, preferred, max)
  // preferred = 80vmin / cols → scales to the viewport and number of columns
  const style = {
    // Bigger cap for big screens; still scales with viewport and # of columns
    "--cell": `clamp(32px, calc(80vmin / ${cols}), 88px)`,
    gridTemplateColumns: `repeat(${cols}, var(--cell))`,
  };

  return (
    <div className="grid gap-1" style={style}>
      {grid.map((cell, i) => (
        <div key={i} className="w-[var(--cell)] aspect-square relative">
          {cell && typeof cell.answer === "string" ? (
            <div
              className={`absolute inset-0 border flex items-center justify-center
                ${cell.status === "correct" ? "bg-gray-200 text-black" : ""}
                ${cell.status === "wrong" ? "bg-red-300 text-white" : ""}
                ${cell.status === "neutral" ? "bg-white text-black" : ""}
              `}
            >
              {cell.label && (
                <div className="absolute top-0 left-0 text-[10px] text-gray-500 p-0.5">
                  {cell.label}
                </div>
              )}
              <input
                className={`w-full h-full text-xl text-center focus:outline-none bg-transparent
                  ${cell.status === "wrong" ? "text-white" : "text-black"}
                `}
                maxLength={1}
                value={cell.userInput}
                onChange={(e) => onInput(i, e.target.value)}
              />
            </div>
          ) : (
            <div className="absolute inset-0 bg-black" />
          )}
        </div>
      ))}
    </div>
  );
}
