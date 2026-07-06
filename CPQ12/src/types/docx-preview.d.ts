declare module 'docx-preview' {
  export function renderAsync(
    data: ArrayBuffer | Uint8Array,
    container?: HTMLElement,
    style?: any,
    options?: any
  ): Promise<void>;
}

declare global {
  interface Window {
    docx?: {
      renderAsync: (
        data: ArrayBuffer | Uint8Array,
        container?: HTMLElement,
        style?: any,
        options?: any
      ) => Promise<void>;
    };
  }
}

export {};


