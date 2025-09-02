import React from "react";

export default function CrosswordGrid({
  grid,
  cols = 5,
  rows = 5,
  onInput,
  activeIndex,
  direction,      // not used directly but handy for future tweaks
  inputRefs,
  activeWordSet,
  onCellClick,      // 👈 new
}) {
  if (!grid || grid.length === 0) return null;

  const style = {
    "--cell": `clamp(32px, calc(80vmin / ${cols}), 64px)`,
    gridTemplateColumns: `repeat(${cols}, var(--cell))`,
  };

  return (
    <div className="grid gap-1" style={style}>
      {grid.map((cell, i) => {
        const isPlayable = !!(cell && typeof cell.answer === "string");
        const isActive = i === activeIndex;
        const inActiveWord = activeWordSet?.has(i);
        const status = cell?.status || "neutral";

        return (
          <div key={i} className="w-[var(--cell)] aspect-square relative">
            {isPlayable ? (
              <button
                type="button"
                onClick={() => (onCellClick ? onCellClick(i) : setActiveIndex?.(i))} // 👈 changed
                className={[
                  "absolute inset-0 border flex items-center justify-center transition-shadow",
                  status === "neutral" && inActiveWord ? "bg-yellow-50/70" : "",
                  isActive ? "ring-2 ring-blue-500" : "",
                  status === "correct" ? "bg-gray-200 text-black" : "",
                  status === "wrong" ? "bg-red-300 text-white" : "",
                  status === "neutral" && !inActiveWord ? "bg-white text-black" : "",
                ].join(" ")}
                aria-label={`Cell ${i}`}
                aria-current={isActive ? "true" : "false"}
              >
                {cell.label && (
                  <div className="absolute top-0 left-0 text-[10px] text-gray-500 p-0.5 select-none">
                    {cell.label}
                  </div>
                )}
                <input
                  ref={(el) => (inputRefs.current[i] = el)}
                  className={[
                    "w-full h-full text-xl text-center focus:outline-none bg-transparent",
                    status === "wrong" ? "text-white" : "text-black",
                  ].join(" ")}
                  maxLength={1}
                  value={cell.userInput}
                  onChange={(e) => onInput(i, e.target.value)}
                  tabIndex={isActive ? 0 : -1}
                  aria-label={`Letter input for cell ${i}`}
                />
              </button>
            ) : (
              <div className="absolute inset-0 bg-black" aria-hidden="true" />
            )}
          </div>
        );
      })}
    </div>
  );
}
