import React from "react";

export default function Footer({ children }) {
  return (
    <div className="flex items-center justify-between w-full">
      {children}
    </div>
  );
}
