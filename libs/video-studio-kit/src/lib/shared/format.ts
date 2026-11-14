/** 45 -> "45 s", 125 -> "2 min 5 s", 120 -> "2 min". */
export function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
}

export const formatMegabytes = (megabytes: number): string => `${megabytes} MB`;

/** "16:9" -> "16 / 9", the form CSS `aspect-ratio` takes. */
export const cssRatio = (ratio: string): string => ratio.replace(':', ' / ');
