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
import './player-hud.css';
import './player-exit.css';
import './login-autofill.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found.');

const disposeSplashPolish = installSplashPolish();

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

window.setInterval(() => {
  const fields = document.querySelectorAll<HTMLInputElement>('.experience-login-card form input');
  const submit = document.querySelector<HTMLButtonElement>('.experience-login-card form button[type="submit"]');
  if (fields.length < 2 || !submit) return;
  const [code, pin] = fields;
  code.name = 'ronecaplaytv-device-code';
  pin.name = 'ronecaplaytv-web-pin';
  pin.autocomplete = 'one-time-code';
  if (submit.disabled && code.value.trim().length >= 4 && /^\d{6}$/.test(pin.value.trim())) {
    code.dispatchEvent(new Event('input', { bubbles: true }));
    pin.dispatchEvent(new Event('input', { bubbles: true }));
    submit.disabled = false;
  }
}, 300);

void registerPwa();

if (import.meta.hot) {
  import.meta.hot.dispose(() => disposeSplashPolish());
}
