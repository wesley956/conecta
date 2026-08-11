/*
 * LG-09 — compatibilidade mínima de runtime para webOS 4.x / Chromium 53.
 *
 * O target do bundler transpila sintaxe, mas não polyfilla APIs de runtime.
 * Esta camada fica deliberadamente pequena e local para não carregar uma
 * biblioteca legacy inteira em TVs modernas.
 */

type LegacyListener = () => void;

type LegacyAbortSignal = {
  aborted: boolean;
  addEventListener: (type: string, listener: LegacyListener) => void;
  removeEventListener: (type: string, listener: LegacyListener) => void;
};

const browser = window as typeof window & {
  globalThis?: typeof window;
  __RONECA_LEGACY_COMPAT__?: string;
};

if (!browser.globalThis) browser.globalThis = window;
browser.__RONECA_LEGACY_COMPAT__ = "webos4-chrome53";

const arrayPrototype = Array.prototype as unknown as Record<string, unknown>;
if (typeof arrayPrototype.flatMap !== "function") {
  Object.defineProperty(Array.prototype, "flatMap", {
    configurable: true,
    writable: true,
    value: function <T, U>(this: T[], callback: (value: T, index: number, array: T[]) => U | U[]) {
      const result: U[] = [];
      for (let index = 0; index < this.length; index += 1) {
        const mapped = callback(this[index], index, this);
        if (Array.isArray(mapped)) result.push.apply(result, mapped);
        else result.push(mapped);
      }
      return result;
    }
  });
}

if (typeof arrayPrototype.flat !== "function") {
  Object.defineProperty(Array.prototype, "flat", {
    configurable: true,
    writable: true,
    value: function <T>(this: Array<T | T[]>, depth = 1) {
      const flatten = (items: Array<T | T[]>, remaining: number): T[] => {
        const result: T[] = [];
        for (let index = 0; index < items.length; index += 1) {
          const value = items[index];
          if (Array.isArray(value) && remaining > 0) result.push.apply(result, flatten(value as Array<T | T[]>, remaining - 1));
          else result.push(value as T);
        }
        return result;
      };
      return flatten(this, Math.max(0, Number(depth) || 0));
    }
  });
}

const stringPrototype = String.prototype as unknown as Record<string, unknown>;
if (typeof stringPrototype.padStart !== "function") {
  Object.defineProperty(String.prototype, "padStart", {
    configurable: true,
    writable: true,
    value: function (this: string, targetLength: number, padString = " ") {
      const source = String(this);
      const desired = Math.max(0, Number(targetLength) || 0);
      if (source.length >= desired || !padString) return source;
      let padding = "";
      while (padding.length < desired - source.length) padding += padString;
      return padding.slice(0, desired - source.length) + source;
    }
  });
}

if (typeof stringPrototype.replaceAll !== "function") {
  Object.defineProperty(String.prototype, "replaceAll", {
    configurable: true,
    writable: true,
    value: function (this: string, searchValue: string, replacement: string) {
      const source = String(this);
      const search = String(searchValue);
      if (!search) return source;
      return source.split(search).join(String(replacement));
    }
  });
}

if (typeof Object.entries !== "function") {
  Object.entries = function (value: object) {
    const result: Array<[string, unknown]> = [];
    const object = Object(value) as Record<string, unknown>;
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) result.push([key, object[key]]);
    }
    return result;
  } as typeof Object.entries;
}

if (typeof Object.values !== "function") {
  Object.values = function (value: object) {
    const result: unknown[] = [];
    const object = Object(value) as Record<string, unknown>;
    for (const key in object) {
      if (Object.prototype.hasOwnProperty.call(object, key)) result.push(object[key]);
    }
    return result;
  } as typeof Object.values;
}

if (typeof Promise.prototype.finally !== "function") {
  Object.defineProperty(Promise.prototype, "finally", {
    configurable: true,
    writable: true,
    value: function <T>(this: Promise<T>, callback: () => unknown) {
      return this.then(
        value => Promise.resolve(callback()).then(() => value),
        reason => Promise.resolve(callback()).then(() => { throw reason; })
      );
    }
  });
}

/*
 * Chromium 53 não possui AbortController. O fetch antigo também não entende
 * RequestInit.signal, então o wrapper abaixo rejeita a Promise no abort e
 * ignora a resposta tardia. A requisição de rede pode terminar no SO, mas não
 * mantém a UI esperando nem reativa estado depois do cancelamento lógico.
 */
if (typeof window.AbortController !== "function") {
  class CompatAbortSignal {
    aborted = false;
    private listeners: LegacyListener[] = [];

    addEventListener(type: string, listener: LegacyListener) {
      if (type === "abort" && this.listeners.indexOf(listener) < 0) this.listeners.push(listener);
    }

    removeEventListener(type: string, listener: LegacyListener) {
      if (type !== "abort") return;
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    }

    abort() {
      if (this.aborted) return;
      this.aborted = true;
      const pending = this.listeners.slice();
      this.listeners.length = 0;
      for (let index = 0; index < pending.length; index += 1) pending[index]();
    }
  }

  class CompatAbortController {
    signal = new CompatAbortSignal();
    abort() { this.signal.abort(); }
  }

  const originalFetch = window.fetch.bind(window);
  (window as unknown as { AbortController: typeof AbortController }).AbortController = CompatAbortController as unknown as typeof AbortController;
  window.fetch = ((input: RequestInfo | URL, init: RequestInit = {}) => {
    const signal = init.signal as unknown as LegacyAbortSignal | undefined;
    if (!signal) return originalFetch(input, init);

    const safeInit: RequestInit = {};
    for (const key in init) {
      if (key !== "signal") (safeInit as unknown as Record<string, unknown>)[key] = (init as unknown as Record<string, unknown>)[key];
    }

    return new Promise<Response>((resolve, reject) => {
      let settled = false;
      const abort = () => {
        if (settled) return;
        settled = true;
        const error = new Error("A operação foi cancelada.");
        error.name = "AbortError";
        reject(error);
      };
      if (signal.aborted) { abort(); return; }
      signal.addEventListener("abort", abort);
      originalFetch(input, safeInit).then(
        response => {
          if (settled) return;
          settled = true;
          signal.removeEventListener("abort", abort);
          resolve(response);
        },
        error => {
          if (settled) return;
          settled = true;
          signal.removeEventListener("abort", abort);
          reject(error);
        }
      );
    });
  }) as typeof window.fetch;
}
