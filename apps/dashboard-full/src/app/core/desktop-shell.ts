/** True when the app runs inside the Tauri desktop shell (the webview it hosts defines `__TAURI_INTERNALS__`). */
export function isDesktopShell(target: object = globalThis): boolean {
  return '__TAURI_INTERNALS__' in target;
}
