/**
 * Popup UI - Main interface entry point
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import Popup from './PopupComponent';
import '../styles/globals.css';

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <Popup />
    </React.StrictMode>
  );
}

