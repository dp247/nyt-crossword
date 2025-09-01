import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* default: today */}
        <Route path="/" element={<App />} />
        {/* date route: /2025-08-03 */}
        <Route path="/:date" element={<App />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)