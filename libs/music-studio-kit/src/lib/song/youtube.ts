/** The hosts the server takes a YouTube address from. */
const HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'];

/** Whether the text is the https address of one YouTube video (what the server accepts: never a list, never another site). */
export function isYoutubeUrl(text: string): boolean {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || !HOSTS.includes(url.hostname)) return false;
  if (url.hostname === 'youtu.be') return url.pathname.length > 1;
  return url.pathname === '/watch' ? url.searchParams.has('v') : /^\/(shorts|embed|live)\/[^/]+/.test(url.pathname);
}
