import { openSectionWindow } from './open-section';

function click(init: MouseEventInit = {}) {
  const a = document.createElement('a');
  a.href = '/animation';
  const event = new MouseEvent('click', { cancelable: true, button: 0, ...init });
  Object.defineProperty(event, 'currentTarget', { value: a });
  return event;
}

describe('openSectionWindow', () => {
  afterEach(() => vi.restoreAllMocks());

  it('opens the address in a new tab from a script and keeps the browser from opening it a second time', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    const event = click();
    openSectionWindow(event);
    expect(open).toHaveBeenCalledWith(expect.stringContaining('/animation'), '_blank');
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves the click to the browser when the tab could not be opened', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const event = click();
    openSectionWindow(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves a click with a modifier and a middle click to the browser', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { button: 1 }]) openSectionWindow(click(init));
    expect(open).not.toHaveBeenCalled();
  });
});
