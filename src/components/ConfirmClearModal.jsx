// components/ConfirmClearModal.jsx
import React, { useEffect } from "react";

export default function ConfirmClearModal({
  open,
  onClose,
  onClearErrors,
  onClearAll,
  disabledClearErrors = false,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl p-6">
        <h2 className="text-lg font-semibold mb-2">Clear puzzle</h2>
        <p className="text-sm text-gray-600 mb-4">
          What would you like to do?
        </p>

        <div className="space-y-2">
          <button
            type="button"
            onClick={onClearErrors}
            disabled={disabledClearErrors}
            className="w-full border px-3 py-2 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            title={disabledClearErrors ? "Cannot clear errors after the puzzle is complete" : ""}
          >
            Clear errors (keep correct letters)
          </button>

          <button
            type="button"
            onClick={onClearAll}
            className="w-full border px-3 py-2 rounded hover:bg-gray-50"
          >
            Clear all (start over)
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full border px-3 py-2 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
