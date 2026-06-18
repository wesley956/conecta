/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ENABLE_DEVICE_PANEL?: string;
  readonly VITE_DEVICE_CONFIG_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
