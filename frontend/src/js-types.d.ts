/**
 * Type declarations for JavaScript modules that haven't been migrated to TypeScript yet.
 * This allows TypeScript files to import from .js files with proper typing.
 */

// ── JSX wildcard ───────────────────────────────────────────────────────────────

declare module '*.jsx' {
  import { ComponentType } from 'react';
  const component: ComponentType<unknown>;
  export default component;
}

// ── CSS modules ──────────────────────────────────────────────────────────────

declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}

// ── Chart.js global ──────────────────────────────────────────────────────────

declare global {
  interface Window {
    Chart: new (canvas: HTMLCanvasElement, config: object) => { destroy: () => void };
  }

  interface ImportMetaEnv {
    VITE_TENANCY_MODE?: string;
    [key: string]: string | undefined;
  }

  interface ImportMeta {
    env: ImportMetaEnv;
  }

  // Vitest globals
  var global: typeof globalThis;
}

export {};
