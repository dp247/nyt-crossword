import React from "react";

export default function Footer({ onCheck, disabled }) {
  return (
    <div className="text-center mt-4">
      <button
        onClick={onCheck}
        disabled={disabled}
        className="bg-blue-600 text-white px-6 py-2 rounded font-semibold hover:bg-blue-700 disabled:opacity-50"
      >
        Check Answers
      </button>
    </div>
  );
}
