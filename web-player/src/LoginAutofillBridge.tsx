import { useEffect } from 'react';

export function LoginAutofillBridge() {
  useEffect(() => {
    let active: HTMLFormElement | null = null;
    let last = '';

    const tick = () => {
      const form = document.querySelector<HTMLFormElement>('.experience-login-card form');
      if (!form) return;
      if (form !== active) {
        active = form;
        const inputs = form.querySelectorAll<HTMLInputElement>('input');
        if (inputs[0]) {
          inputs[0].name = 'ronecaplaytv-device-code';
          inputs[0].autocomplete = 'off';
          inputs[0].setAttribute('data-lpignore', 'true');
          inputs[0].setAttribute('data-1p-ignore', 'true');
        }
        if (inputs[1]) {
          inputs[1].name = 'ronecaplaytv-web-pin';
          inputs[1].autocomplete = 'one-time-code';
          inputs[1].setAttribute('data-lpignore', 'true');
          inputs[1].setAttribute('data-1p-ignore', 'true');
        }
        form.autocomplete = 'off';
        last = '';
      }

      const inputs = form.querySelectorAll<HTMLInputElement>('input');
      const code = inputs[0];
      const pin = inputs[1];
      const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (!code || !pin || !submit) return;

      const snapshot = `${code.value}\n${pin.value}`;
      if (snapshot !== last) {
        last = snapshot;
        code.dispatchEvent(new Event('input', { bubbles: true }));
        pin.dispatchEvent(new Event('input', { bubbles: true }));
      }

      const ready = code.value.trim().length >= 4 && /^\d{6}$/.test(pin.value.trim());
      form.classList.toggle('autofill-ready', ready);
      if (ready && submit.disabled) submit.disabled = false;
    };

    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, []);

  return null;
}
