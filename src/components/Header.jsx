import React from "react";
import { Link } from "react-router-dom";

export default function Header() {
  return (
    <div className="flex items-center justify-between">
      {/* Left: title + Random */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Mini Crossword</h1>
        <Link
          to="/random"
          className="text-sm border px-2 py-1 rounded hover:bg-gray-100"
          title="Load a random Mini crossword"
        >
          Random
        </Link>
      </div>
    </div>
  );
}
