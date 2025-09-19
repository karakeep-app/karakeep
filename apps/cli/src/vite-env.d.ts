/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly CLI_VERSION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
