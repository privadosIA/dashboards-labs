import { isDesktopShell } from './desktop-shell';

describe('isDesktopShell', () => {
  it('is true when the webview of the shell defines its internals', () => {
    expect(isDesktopShell({ __TAURI_INTERNALS__: {} })).toBe(true);
  });

  it('is false in a browser', () => {
    expect(isDesktopShell({})).toBe(false);
    expect(isDesktopShell()).toBe(false);
  });
});
