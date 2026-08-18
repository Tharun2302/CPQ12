/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_HUBSPOT_API_KEY: string
  readonly VITE_APP_NAME: string
  readonly VITE_APP_VERSION: string
  /** Numeric Hotjar Site ID. Blank/absent = Hotjar never loads. Baked in at build time. */
  readonly VITE_HOTJAR_ID: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
