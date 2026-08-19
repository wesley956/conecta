import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ExperienceApp from './ExperienceApp';
import { ExperienceAccessibilityController } from './experienceAccessibility';
import { NavigationStateRestorer } from './NavigationStateRestorer';
import { PwaUpdatePrompt } from './PwaUpdatePrompt';
import { registerPwa } from './pwa';
import { SectionNavigationEnhancer } from './SectionNavigationEnhancer';
import { SettingsPortal } from './SettingsPortal';
import { installSplashPolish } from './splashPolish';
import './styles.css';
import './experience.css';
import './experience-a11y.css';
import './splash-polish.css';
import './pwa.css';
import './evolution-batch1.css';
import './evolution-batch1-integration.css';
import './evolution-batch2.css';
import './evolution-batch2-mobile.css';
import './autonext.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found.');

const disposeSplashPolish = installSplashPolish();

// Batch2 stays hook-safe after synchronization with the latest batch1 base.
createRoot(root).render(
  <StrictMode>
    <ExperienceAccessibilityController />
    <NavigationStateRestorer />
    <ExperienceApp />
    <SectionNavigationEnhancer />
    <SettingsPortal />
    <PwaUpdatePrompt />
  </StrictMode>,
);

void registerPwa();

if (import.meta.hot) {
  import.meta.hot.dispose(() => disposeSplashPolish());
}
