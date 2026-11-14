/**
 * Opens the section a link points to in a new tab, the way the link would, but from a script so that the tab keeps its opener and can close itself when the person is done
 * (a link opened by the browser alone cannot be closed by the page, and going "back" in it would load a second copy of the app). A click with a modifier or a middle click is left
 * to the browser: the link still has its address.
 */
export function openSectionWindow(event: MouseEvent): void {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const href = (event.currentTarget as HTMLAnchorElement | null)?.href;
  if (!href) return;
  if (window.open(href, '_blank')) event.preventDefault();
}

/** Whether this tab was opened by another tab of the app that is still there, so that closing it leaves the person where they came from. */
export function openedByThisApp(): boolean {
  try {
    return !!window.opener && !window.opener.closed;
  } catch {
    return false;
  }
}
