export interface BackEntry {
  /** The thing was closed some other way (a tap): takes the history entry off again without leaving the page. */
  leave(): void;
  /** Another thing took the place of the first one on top of the page: the back gesture closes that one. */
  retarget(onBack: () => void): void;
}

/**
 * Lets the device's back gesture close something that sits on top of the page (a bottom sheet, the full-screen
 * viewer) instead of leaving the screen: while it is open one history entry is added, and going back removes it.
 */
export function pushBackEntry(onBack: () => void): BackEntry {
  const marker = { moOverlay: Math.random() };
  history.pushState(marker, '');
  let open = true;
  let handler = onBack;
  const onPop = () => {
    if (!open) return;
    open = false;
    window.removeEventListener('popstate', onPop);
    handler();
  };
  window.addEventListener('popstate', onPop);
  return {
    leave: () => {
      if (!open) return;
      open = false;
      window.removeEventListener('popstate', onPop);
      if (history.state === marker) history.back();
    },
    retarget: (fn) => {
      handler = fn;
    },
  };
}
