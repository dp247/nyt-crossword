import React from "react";

export default function Header({ date }) {
  return (
    <div>
      <h1 className="text-2xl font-bold leading-tight">Mini Crossword</h1>
      {date && (
        <p className="text-sm text-gray-600">{date}</p>
      )}
    </div>
  );
}
