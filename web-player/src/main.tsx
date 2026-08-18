import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ExperienceApp from './ExperienceApp';
import { ExperienceAccessibilityController } from './experienceAccessibility';
import { registerPwa } from './pwa';
import './styles.css';
import './experience.css';
import './experience-a11y.css';
import './pwa.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found.');

createRoot(root).render(
  <StrictMode>
    <ExperienceAccessibilityController />
    <ExperienceApp />
  </StrictMode>,
);

void registerPwa();
