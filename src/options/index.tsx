/**
 * Options page entry point
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import Options from './OptionsComponent';
import '../styles/globals.css';

const root = document.getElementById('root');
if (root && !(root as any)._reactRootContainer) {
  const reactRoot = ReactDOM.createRoot(root);
  (root as any)._reactRootContainer = reactRoot;
  reactRoot.render(
    <React.StrictMode>
      <Options />
    </React.StrictMode>
  );
}

