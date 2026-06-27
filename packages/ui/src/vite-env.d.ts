/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the @surveyor/server API. Consumed by src/config/server.config.ts. */
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
