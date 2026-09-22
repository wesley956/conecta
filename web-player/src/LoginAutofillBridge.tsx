import { useEffect } from 'react';

const DEVICE_CODE_NAME = 'ronecaplaytv-device-code';
const WEB_PIN_NAME = 'ronecaplaytv-web-pin';

function validLoginValues(code: HTMLInputElement, pin: HTMLInputElement) {
  return code.value.trim().length >= 4 && /^\d{6}$/.test(pin.value.trim());
}

function notifyReact(input: HTMLInputElement) {
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

export function LoginAutofillBridge() {
  useEffect(() => {
    let activeForm: HTMLFormElement | null = null;
    let stopActive: (() => void) | null = null;

    const attach = () => {
      const form = document.querySelector<HTMLFormElement>('.experience-login-card form');
      if (!form || form === activeForm) return;

      stopActive?.();
      activeForm = form;

      const inputs = form.querySelectorAll<HTMLInputElement>('input');
      const code = inputs[0];
      const pin = inputs[1];
      const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (!code || !pin || !submit) return;

      code.name = DEVICE_CODE_NAME;
      code.autocomplete = 'off';
      code.setAttribute('data-lpignore', 'true');
      code.setAttribute('data-1p-ignore', 'true');

      pin.name = WEB_PIN_NAME;
      pin.autocomplete = 'one-time-code';
      pin.setAttribute('data-lpignore', 'true');
      pin.setAttribute('data-1p-ignore', 'true');

      form.autocomplete = 'off';

      let lastCode = code.value;
      let lastPin = pin.value;
      let resubmitting = false;

      const reconcile = () => {
        const nextCode = code.value;
        const nextPin = pin.value;
        const changed = nextCode !== lastCode || nextPin !== lastPin;
        lastCode = nextCode;
        lastPin = nextPin;

        if (changed) {
          notifyReact(code);
          notifyReact(pin);
        }

        const ready = validLoginValues(code, pin);
        form.classList.toggle('autofill-ready', ready);
        if (ready && submit.disabled) submit.disabled = false;
      };

      const onAnimationStart = () => window.setTimeout(reconcile, 0);
      const onInput = () => window.setTimeout(reconcile, 0);
      const onClickCapture = (event: Event) => {
        if (resubmitting || event.target !== submit || !validLoginValues(code, pin)) return;

        // Chrome can paint autofilled values before React receives an input/change event.
        // Synchronize the controlled fields first, then submit on the next frame.
        event.preventDefault();
        event.stopPropagation();
        notifyReact(code);
        notifyReact(pin);
        resubmitting = true;
        window.requestAnimationFrame(() => {
          resubmitting = false;
          form.requestSubmit(submit);
        });
      };

      code.addEventListener('animationstart', onAnimationStart);
      pin.addEventListener('animationstart', onAnimationStart);
      code.addEventListener('input', onInput);
      pin.addEventListener('input', onInput);
      form.addEventListener('click', onClickCapture, true);

      const interval = window.setInterval(reconcile, 160);
      const timeout = window.setTimeout(() => window.clearInterval(interval), 5_000);
      reconcile();

      stopActive = () => {
        window.clearInterval(interval);
        window.clearTimeout(timeout);
        code.removeEventListener('animationstart', onAnimationStart);
        pin.removeEventListener('animationstart', onAnimationStart);
        code.removeEventListener('input', onInput);
        pin.removeEventListener('input', onInput);
        form.removeEventListener('click', onClickCapture, true);
        form.classList.remove('autofill-ready');
      };
    };

    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      stopActive?.();
    };
  }, []);

  return null;
}
