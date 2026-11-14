// The pure part of `npm run <dashboard>:mock`: what the launcher was given.

/** What the launcher was given: the dashboard (the first word that is not an option), `--mock`, and the options for `ng serve`. */
export function parseArgs(argv) {
  const rest = argv.filter((a) => a !== '--mock');
  const named = rest.length > 0 && !rest[0].startsWith('-');
  return { dashboard: named ? rest[0] : 'video-studio', mock: rest.length !== argv.length, rest: named ? rest.slice(1) : rest };
}

export class LauncherError extends Error {}
