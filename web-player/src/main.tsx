import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ExperienceApp from './ExperienceApp';
import { ExperienceAccessibilityController } from './experienceAccessibility';
import { NavigationStateRestorer } from './NavigationStateRestorer';
import { registerPwa } from './pwa';
import { installSplashPolish } from './splashPolish';
import './styles.css';
import './experience.css';
import './experience-a11y.css';
import './splash-polish.css';
import './pwa.css';
import './evolution-batch1.css';
import './evolution-batch1-integration.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found.');

const disposeSplashPolish = installSplashPolish();

createRoot(root).render(
  <StrictMode>
    <ExperienceAccessibilityController />
    <NavigationStateRestorer />
    <ExperienceApp />
  </StrictMode>,
);

void registerPwa();

if (import.meta.hot) {
  import.meta.hot.dispose(() => disposeSplashPolish());
}
