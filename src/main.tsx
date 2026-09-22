import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
// Fonts are bundled rather than loaded from Google, which VS Code webviews block. Latin woff2 only; see fonts.css.
import './fonts.css';
import App from './App';
import { ThemeIntro } from './components/ThemeIntro';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Honours the system's "reduce motion" setting for every animation. */}
    <MotionConfig reducedMotion="user">
      <App />
      <ThemeIntro />
    </MotionConfig>
  </StrictMode>,
);
