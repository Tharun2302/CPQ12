/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HUBSPOT_API_KEY: string
  readonly VITE_APP_NAME: string
  readonly VITE_APP_VERSION: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
