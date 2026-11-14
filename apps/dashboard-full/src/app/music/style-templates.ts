// Style templates: a short English text tied to a genre, added to the style
// when chosen (as Mureka's create screen does). The model reads captions best
// in English; the labels are for the user. Each text is one clause meant to
// combine with others.

export interface StyleTemplate {
  id: string;
  label: string;
  text: string;
}

export interface TemplateGroup {
  label: string;
  templates: StyleTemplate[];
}

export const TEMPLATE_GROUPS: readonly TemplateGroup[] = [
  {
    label: $localize`:@@music.tpl.groupRock:Rock and pop`,
    templates: [
      { id: 'rock', label: $localize`:@@music.tpl.rock:Rock`, text: 'driving rock with crunchy electric guitars, punchy drums and a solid bassline' },
      { id: 'hard-rock', label: $localize`:@@music.tpl.hardRock:Hard rock`, text: 'hard rock with heavy distorted riffs, powerful drums and raw gritty energy' },
      { id: 'indie-rock', label: $localize`:@@music.tpl.indieRock:Indie rock`, text: 'indie rock with jangly guitars, laid-back drums and a warm lo-fi garage feel' },
      { id: 'punk', label: $localize`:@@music.tpl.punk:Punk`, text: 'fast punk rock with buzzing power chords, shouted energy and raw production' },
      { id: 'metal', label: $localize`:@@music.tpl.metal:Metal`, text: 'heavy metal with down-tuned chugging guitars, double bass drums and intense aggression' },
      { id: 'pop', label: $localize`:@@music.tpl.pop:Pop`, text: 'catchy modern pop with a bright polished mix, tight beat and an instantly memorable hook' },
      { id: 'synth-pop', label: $localize`:@@music.tpl.synthPop:Synth-pop`, text: 'synth-pop with shimmering analog synthesizers, a steady drum machine and a nostalgic eighties mood' },
      { id: 'ballad', label: $localize`:@@music.tpl.ballad:Ballad`, text: 'emotional slow ballad with piano, soft strings and a tender heartfelt melody' },
    ],
  },
  {
    label: $localize`:@@music.tpl.groupElectronic:Electronic`,
    templates: [
      { id: 'electronic', label: $localize`:@@music.tpl.electronic:Electronic`, text: 'electronic music with layered synthesizers, a pulsing bass and crisp programmed drums' },
      { id: 'house', label: $localize`:@@music.tpl.house:House`, text: 'groovy house with a four-on-the-floor kick, funky bass and uplifting chords' },
      { id: 'techno', label: $localize`:@@music.tpl.techno:Techno`, text: 'dark driving techno with a hypnotic repetitive beat and evolving industrial textures' },
      { id: 'trance', label: $localize`:@@music.tpl.trance:Trance`, text: 'euphoric trance with soaring supersaw leads, rolling arpeggios and a building energy' },
      { id: 'dnb', label: $localize`:@@music.tpl.dnb:Drum and bass`, text: 'fast drum and bass with breakbeats, a deep rolling sub bass and tense atmosphere' },
      { id: 'synthwave', label: $localize`:@@music.tpl.synthwave:Synthwave`, text: 'retro synthwave with warm analog arpeggios, gated reverb drums and a neon night-drive mood' },
      { id: 'chillout', label: $localize`:@@music.tpl.chillout:Chillout`, text: 'relaxed chillout with soft pads, a gentle downtempo beat and a dreamy atmosphere' },
      { id: 'eurobeat', label: $localize`:@@music.tpl.eurobeat:Eurobeat`, text: 'high-energy eurobeat with a fast pounding beat, bright synth leads and dramatic hooks' },
    ],
  },
  {
    label: $localize`:@@music.tpl.groupAcoustic:Acoustic and folk`,
    templates: [
      { id: 'acoustic', label: $localize`:@@music.tpl.acoustic:Acoustic`, text: 'intimate acoustic arrangement with fingerpicked guitar and a warm natural sound' },
      { id: 'folk', label: $localize`:@@music.tpl.folk:Folk`, text: 'folk with strummed acoustic guitar, light percussion and an earthy storytelling feel' },
      { id: 'country', label: $localize`:@@music.tpl.country:Country`, text: 'country with twangy guitars, steel guitar, a steady shuffle and a down-home feel' },
      { id: 'flamenco', label: $localize`:@@music.tpl.flamenco:Flamenco`, text: 'passionate flamenco with fast nylon-string guitar, hand claps and a fiery rhythm' },
      { id: 'singer-songwriter', label: $localize`:@@music.tpl.singerSongwriter:Singer-songwriter`, text: 'singer-songwriter style with a simple guitar and a personal confessional mood' },
    ],
  },
  {
    label: $localize`:@@music.tpl.groupUrban:Urban`,
    templates: [
      { id: 'hip-hop', label: $localize`:@@music.tpl.hipHop:Hip hop`, text: 'hip hop with a heavy boom-bap beat, deep bass and a confident rhythmic flow' },
      { id: 'lofi', label: $localize`:@@music.tpl.lofi:Lo-fi`, text: 'lo-fi hip hop with dusty drums, mellow jazzy keys and a cozy vinyl crackle' },
      { id: 'trap', label: $localize`:@@music.tpl.trap:Trap`, text: 'modern trap with booming 808 bass, rapid hi-hats and a dark moody atmosphere' },
      { id: 'rnb', label: $localize`:@@music.tpl.rnb:R&B`, text: 'smooth R&B with silky chords, a slow groove and sensual layered harmonies' },
      { id: 'reggaeton', label: $localize`:@@music.tpl.reggaeton:Reggaeton`, text: 'reggaeton with a dembow rhythm, deep bass and a catchy danceable feel' },
      { id: 'funk', label: $localize`:@@music.tpl.funk:Funk`, text: 'funk with a tight slap bass groove, rhythmic guitar scratches and punchy horns' },
    ],
  },
  {
    label: $localize`:@@music.tpl.groupJazz:Jazz and blues`,
    templates: [
      { id: 'jazz', label: $localize`:@@music.tpl.jazz:Jazz`, text: 'jazz with a walking upright bass, brushed drums and improvised piano' },
      { id: 'smooth-jazz', label: $localize`:@@music.tpl.smoothJazz:Smooth jazz`, text: 'smooth jazz with a silky saxophone, soft electric piano and a relaxed groove' },
      { id: 'swing', label: $localize`:@@music.tpl.swing:Swing`, text: 'lively swing with a big band brass section, a bouncing rhythm and a vintage feel' },
      { id: 'blues', label: $localize`:@@music.tpl.blues:Blues`, text: 'gritty blues with a bending electric guitar, a slow shuffle and a soulful mood' },
      { id: 'soul', label: $localize`:@@music.tpl.soul:Soul`, text: 'warm soul with a Hammond organ, a tight rhythm section and heartfelt gospel-like harmonies' },
    ],
  },
  {
    label: $localize`:@@music.tpl.groupCinematic:Film and orchestra`,
    templates: [
      { id: 'soundtrack', label: $localize`:@@music.tpl.soundtrack:Soundtrack`, text: 'cinematic film score with sweeping strings, a slowly building emotional arc and a spacious mix' },
      { id: 'epic', label: $localize`:@@music.tpl.epic:Epic orchestral`, text: 'epic orchestral music with thundering percussion, powerful brass and a heroic choir' },
      { id: 'classical', label: $localize`:@@music.tpl.classical:Classical`, text: 'classical chamber music with elegant strings and a refined, balanced phrasing' },
      { id: 'piano', label: $localize`:@@music.tpl.piano:Piano`, text: 'solo piano with expressive dynamics, gentle pedal and a reflective mood' },
      { id: 'ambient', label: $localize`:@@music.tpl.ambient:Ambient`, text: 'ambient with slowly evolving pads, soft textures and a calm floating atmosphere' },
    ],
  },
  {
    label: $localize`:@@music.tpl.groupWorld:World`,
    templates: [
      { id: 'latin', label: $localize`:@@music.tpl.latin:Latin`, text: 'Latin pop with lively percussion, rhythmic acoustic guitar and a warm sunny groove' },
      { id: 'salsa', label: $localize`:@@music.tpl.salsa:Salsa`, text: 'energetic salsa with congas, bright trumpets and a driving piano montuno' },
      { id: 'bossa', label: $localize`:@@music.tpl.bossa:Bossa nova`, text: 'bossa nova with a soft nylon guitar, a gentle syncopated rhythm and a breezy mood' },
      { id: 'reggae', label: $localize`:@@music.tpl.reggae:Reggae`, text: 'reggae with an offbeat guitar skank, a deep rolling bass and a relaxed island groove' },
      { id: 'afrobeat', label: $localize`:@@music.tpl.afrobeat:Afrobeat`, text: 'afrobeat with interlocking polyrhythms, bright horns and a hypnotic danceable groove' },
      { id: 'celtic', label: $localize`:@@music.tpl.celtic:Celtic`, text: 'Celtic folk with a lively fiddle, tin whistle and a rolling traditional dance rhythm' },
    ],
  },
];

const SEPARATOR = ', ';

/** Whether the template's text is in the style (case-insensitive). */
export function isChosen(style: string, template: StyleTemplate): boolean {
  return style.toLowerCase().includes(template.text.toLowerCase());
}

/**
 * The style after choosing or releasing a template: its text is added at the
 * end after a comma (or alone into an empty style), or removed with one
 * adjacent separator when it is already there.
 */
export function toggleTemplate(style: string, template: StyleTemplate): string {
  const at = style.toLowerCase().indexOf(template.text.toLowerCase());
  if (at < 0) {
    const base = style.trimEnd().replace(/[,;.]+$/, '').trimEnd();
    return base === '' ? template.text : base + SEPARATOR + template.text;
  }
  const before = style.slice(0, at);
  const after = style.slice(at + template.text.length);
  // Take the separator in front of the text, else the one behind it.
  const front = /(?:,\s*)$/.exec(before);
  if (front) return (before.slice(0, front.index) + after).trim();
  return (before + after.replace(/^\s*,\s*/, '')).trim();
}
