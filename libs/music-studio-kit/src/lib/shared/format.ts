/** 131 -> "2:11", 59 -> "0:59", 3601 -> "60:01": the length of a song as a clock. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}
