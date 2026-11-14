/**
 * The example logo the Example button loads, as text: the library carries it, so the button works wherever a host serves its files (a dashboard's
 * `public/examples/logo.svg` is the same file; the shell's spec keeps the two equal). It has no text: a part with text that overlaps the words of the
 * server's check is refused.
 */
export const EXAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300" width="480" height="300">
  <title>Example logo</title>
  <g id="mark">
    <circle id="ring" cx="150" cy="150" r="92" fill="none" stroke="#5b48d6" stroke-width="10" stroke-dasharray="48 22" stroke-linecap="round"/>
    <circle id="dot" cx="150" cy="150" r="44" fill="#e8590c"/>
    <rect id="bar-a" x="262" y="104" width="24" height="92" rx="6" fill="#5b48d6"/>
    <rect id="bar-b" x="300" y="84" width="24" height="132" rx="6" fill="#7c6ae8"/>
    <rect id="bar-c" x="338" y="118" width="24" height="64" rx="6" fill="#9d8cff"/>
  </g>
</svg>
`;
