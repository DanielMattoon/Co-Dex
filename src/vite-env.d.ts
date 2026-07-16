/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Google OAuth2 web client ID for Drive BYOC backup (PRD 16). Client IDs are not secret. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
