import type { Lang } from '@lab/forms-kit';

/** The words of scenes, review and the theme in the editor, in both languages. */
export interface SceneTexts {
  badge: string;
  scene: string;
  sceneHint: string;
  editScene: string;
  editSceneHint: string;
  dialog: {
    title: (block: string) => string;
    brief: string;
    briefHint: string;
    briefCount: (n: number, max: number) => string;
    assistant: string;
    assistantHint: string;
    review: string;
    reviewHint: string;
    reviewMin: string;
    reviewAttempts: string;
    ask: string;
    asking: string;
    askAgain: string;
    close: string;
    approvedSet: (part: string, block: string) => string;
    noAssistant: string;
    editTitle: (block: string) => string;
    manifest: string;
    fragment: string;
    save: string;
    saving: string;
    saved: (part: string) => string;
    problems: string;
    loading: string;
    notEditable: string;
  };
  draft: {
    brief: string;
    reviewTitle: string;
    score: (n: number) => string;
    verdict: Record<'pass' | 'weak' | 'fail', string>;
    notes: string;
    climb: string;
    attempt: (i: number, score: number) => string;
    reviewError: (reason: string) => string;
    warnings: string;
  };
  batch: {
    writeAll: string;
    writeAllHint: string;
    title: string;
    mode: string;
    metaphor: string;
    metaphorHint: string;
    literal: string;
    literalHint: string;
    start: string;
    starting: string;
    progress: (done: number, total: number) => string;
    state: Record<'writing' | 'done' | 'cancelled' | 'failed', string>;
    current: (block: string) => string;
    cancel: string;
    cancelled: string;
    approveAll: (ready: number) => string;
    approveAllDirty: string;
    approveSave: string;
    approveDiscard: string;
    approveCancel: string;
    approveWorking: string;
    approveDirtyStays: string;
    approved: (n: number, notApproved: number) => string;
    explain: string;
    cardOpen: string;
    cardScore: (n: number) => string;
    cardStates: Record<'pending' | 'writing' | 'ready' | 'failed' | 'approved', string>;
    failed: (reason: string) => string;
    close: string;
  };
  review: {
    review: string;
    hint: string;
    running: string;
    done: string;
    failed: (reason: string) => string;
    title: string;
    overall: (score: number) => string;
    overallNotes: string;
    repeated: (blocks: string) => string;
    block: (id: string) => string;
    mark: Record<'pass' | 'weak' | 'fail', string>;
    noNotes: string;
    open: string;
    close: string;
    none: string;
  };
  theme: {
    title: string;
    hint: string;
    css: string;
    cssHint: (max: number) => string;
    cssCount: (n: number, max: number) => string;
    refused: (reason: string) => string;
    assets: string;
    assetsHint: string;
    addAsset: string;
    assetName: string;
    assetTooBig: (kb: number) => string;
    assetNotSvg: string;
    assetName_bad: string;
    assetFull: (max: number) => string;
    assetDuplicate: string;
    removeAsset: (name: string) => string;
    hud: string;
    hudHint: string;
    corners: Record<'tl' | 'tr' | 'bl' | 'br', string>;
    fonts: string;
    fontLicence: (family: string, licence: string, weights: string) => string;
    transition: string;
    transitionHint: string;
    transitionPiece: string;
    transitionPieceHint: string;
    transitionInherit: string;
    framePreset: string;
    framePresetHint: string;
    framePresetDone: string;
    framePresetHas: string;
    seconds: (s: number) => string;
  };
}

const es: SceneTexts = {
  badge: 'escena',
  scene: 'Escena…',
  sceneHint: 'Escribir con el asistente una escena para este verso; la revisas antes de ponerla',
  editScene: 'Editar escena…',
  editSceneHint: 'Cambiar los textos de la escena de este bloque',
  dialog: {
    title: (block) => `Escena para ${block}`,
    brief: 'Idea o metáfora',
    briefHint: 'Qué quieres ver mientras suena este verso. Vacío: el asistente elige la metáfora.',
    briefCount: (n, max) => `${n} de ${max} caracteres`,
    assistant: 'Quién la escribe',
    assistantHint: 'El modelo que escribe la escena.',
    review: 'Revisar con el modelo de visión',
    reviewHint: 'Puntúa la escena mirando sus imágenes y, si no llega a la nota mínima, la reescribe con sus notas.',
    reviewMin: 'Nota mínima (1 a 10)',
    reviewAttempts: 'Reescrituras como mucho (0 a 3)',
    ask: 'Escribir escena',
    asking: 'Pidiendo…',
    askAgain: 'Pedir otra',
    close: 'Cerrar',
    approvedSet: (part, block) => `La escena ${part} es ahora la parte de ${block}. Guarda con Ctrl+S cuando quieras.`,
    noAssistant: 'No hay asistente al que pedírselo.',
    editTitle: (block) => `Escena de ${block}`,
    manifest: 'Manifiesto (JSON)',
    fragment: 'Fragmento (HTML, CSS y JS de la escena)',
    save: 'Guardar escena',
    saving: 'Guardando…',
    saved: (part) => `La escena ${part} está guardada en la biblioteca; la vista previa la usa ya.`,
    problems: 'El servidor no la admite:',
    loading: 'Leyendo la escena…',
    notEditable: 'Esta escena no se puede leer ni cambiar aquí.',
  },
  draft: {
    brief: 'Idea',
    reviewTitle: 'Revisión',
    score: (n) => `${n} de 10`,
    verdict: { pass: 'Aprobada', weak: 'Floja', fail: 'Suspensa' },
    notes: 'Qué corregir',
    climb: 'Versiones revisadas (la mejor es la que queda)',
    attempt: (i, score) => `Versión ${i}: ${score}`,
    reviewError: (reason) => `No se pudo puntuar: ${reason}`,
    warnings: 'Avisos',
  },
  batch: {
    writeAll: 'Escribir todas las escenas',
    writeAllHint: 'Una escena por cada verso del guion; las apruebas después',
    title: 'Escribir todas las escenas',
    mode: 'Cómo las piensa',
    metaphor: 'Metáfora',
    metaphorHint: 'Elige una imagen para lo que significa cada verso.',
    literal: 'Literal',
    literalHint: 'Dibuja lo que dicen las palabras.',
    start: 'Empezar',
    starting: 'Empezando…',
    progress: (done, total) => `${done} de ${total} escenas`,
    state: { writing: 'Escribiendo', done: 'Terminado', cancelled: 'Parado', failed: 'Falló' },
    current: (block) => `Escribiendo ${block}`,
    cancel: 'Parar',
    cancelled: 'Se para después de la escena que se está escribiendo.',
    approveAll: (ready) => `Aprobar las ${ready} listas`,
    approveAllDirty: 'Hay cambios sin guardar. El servidor aprueba y guarda el guion, así que antes hay que guardarlos o descartarlos.',
    approveSave: 'Guardar y aprobar',
    approveDiscard: 'Descartar y aprobar',
    approveCancel: 'Ahora no',
    approveWorking: 'Aprobando…',
    approveDirtyStays: 'No se pudieron guardar los cambios; no se aprobó nada.',
    approved: (n, notApproved) => (notApproved ? `${n} escenas puestas; ${notApproved} no se pudieron aprobar y su bloque sigue como estaba.` : `${n} escenas puestas en el guion.`),
    explain: 'Aprobar todas las listas las guarda en el servidor y recarga la pieza. Una a una se aprueban desde su tarjeta.',
    cardOpen: 'Abrir',
    cardScore: (n) => `${n} de 10`,
    cardStates: { pending: 'Pendiente', writing: 'Escribiendo', ready: 'Lista', failed: 'Falló', approved: 'Puesta' },
    failed: (reason) => `Las escenas no se pudieron escribir: ${reason}`,
    close: 'Cerrar',
  },
  review: {
    review: 'Revisar pieza',
    hint: 'El modelo de visión puntúa cada escena y la pieza entera',
    running: 'Revisando la pieza…',
    done: 'Revisión terminada',
    failed: (reason) => `No se pudo revisar: ${reason}`,
    title: 'Revisión de la pieza',
    overall: (score) => `Conjunto: ${score} de 10`,
    overallNotes: 'Del conjunto',
    repeated: (blocks) => `Repiten metáfora: ${blocks}`,
    block: (id) => `Bloque ${id}`,
    mark: { pass: 'Aprobada', weak: 'Floja', fail: 'Suspensa' },
    noNotes: 'Sin notas.',
    open: 'Ver revisión',
    close: 'Ocultar revisión',
    none: 'Aún no se ha revisado.',
  },
  theme: {
    title: 'Tema de la pieza',
    hint: 'Lo que comparten todas las páginas: estilos, dibujos y los cuatro textos de las esquinas.',
    css: 'CSS del tema',
    cssHint: (max) => `Se añade después del de la página: puede cambiar #verse y #hit. Hasta ${max} caracteres; sin @import ni direcciones que no sean data:.`,
    cssCount: (n, max) => `${n} de ${max}`,
    refused: (reason) => `El servidor lo rechaza: ${reason}`,
    assets: 'Dibujos',
    assetsHint: 'SVG pequeños, de hasta 50 KB; una parte los pone con {{asset:nombre}}.',
    addAsset: 'Añadir SVG…',
    assetName: 'Nombre',
    assetTooBig: (kb) => `Pesa más de ${kb} KB.`,
    assetNotSvg: 'No es un SVG.',
    assetName_bad: 'El nombre va en minúsculas, números y _, empieza por letra y tiene hasta 32.',
    assetFull: (max) => `Como mucho ${max} dibujos.`,
    assetDuplicate: 'Ya hay un dibujo con ese nombre.',
    removeAsset: (name) => `Quitar ${name}`,
    hud: 'Textos de las esquinas',
    hudHint: 'Los dibuja la parte hud-chrome. Hasta 40 caracteres cada uno.',
    corners: { tl: 'Arriba izquierda', tr: 'Arriba derecha', bl: 'Abajo izquierda', br: 'Abajo derecha' },
    fonts: 'Tipografías empaquetadas',
    fontLicence: (family, licence, weights) => `${family}: ${licence}, pesos ${weights}`,
    transition: 'Fundido entre piezas',
    transitionHint: '0 es un corte. 0,2 a 0,4 suele ir bien; 0 en una pieza que cae sobre un golpe de palabra.',
    transitionPiece: 'Fundido de esta pieza',
    transitionPieceHint: 'Cómo entra esta pieza desde la anterior.',
    transitionInherit: 'El del diseño',
    framePreset: 'Marco: HUD y grano',
    framePresetHint: 'Añade una capa con hud-chrome y otra con grano durante toda la canción.',
    framePresetDone: 'Capas del marco añadidas.',
    framePresetHas: 'Ya hay capas con hud-chrome y grano.',
    seconds: (s) => `${s.toLocaleString('es', { maximumFractionDigits: 2 })} s`,
  },
};

const en: SceneTexts = {
  badge: 'scene',
  scene: 'Scene…',
  sceneHint: 'Have the assistant write a scene for this verse; you check it before it is put in',
  editScene: 'Edit scene…',
  editSceneHint: "Change the texts of this block's scene",
  dialog: {
    title: (block) => `Scene for ${block}`,
    brief: 'Idea or metaphor',
    briefHint: 'What you want to see while this verse is sung. Empty: the assistant chooses the metaphor.',
    briefCount: (n, max) => `${n} of ${max} characters`,
    assistant: 'Who writes it',
    assistantHint: 'The model that writes the scene.',
    review: 'Review with the vision model',
    reviewHint: 'It scores the scene by looking at its pictures and, under the minimum, rewrites it with its notes.',
    reviewMin: 'Minimum score (1 to 10)',
    reviewAttempts: 'Rewrites at most (0 to 3)',
    ask: 'Write scene',
    asking: 'Asking…',
    askAgain: 'Ask again',
    close: 'Close',
    approvedSet: (part, block) => `Scene ${part} is now the part of ${block}. Save with Ctrl+S when you like.`,
    noAssistant: 'There is no assistant to ask.',
    editTitle: (block) => `Scene of ${block}`,
    manifest: 'Manifest (JSON)',
    fragment: "Fragment (the scene's HTML, CSS and JS)",
    save: 'Save scene',
    saving: 'Saving…',
    saved: (part) => `Scene ${part} is saved in the library; the preview uses it already.`,
    problems: 'The server does not take it:',
    loading: 'Reading the scene…',
    notEditable: 'This scene cannot be read or changed here.',
  },
  draft: {
    brief: 'Idea',
    reviewTitle: 'Review',
    score: (n) => `${n} of 10`,
    verdict: { pass: 'Pass', weak: 'Weak', fail: 'Fail' },
    notes: 'What to fix',
    climb: 'Versions reviewed (the best one is kept)',
    attempt: (i, score) => `Version ${i}: ${score}`,
    reviewError: (reason) => `It could not be scored: ${reason}`,
    warnings: 'Warnings',
  },
  batch: {
    writeAll: 'Write all scenes',
    writeAllHint: 'One scene for each verse of the script; you approve them after',
    title: 'Write all scenes',
    mode: 'How they are thought',
    metaphor: 'Metaphor',
    metaphorHint: 'It chooses an image for what each verse means.',
    literal: 'Literal',
    literalHint: 'It draws what the words say.',
    start: 'Start',
    starting: 'Starting…',
    progress: (done, total) => `${done} of ${total} scenes`,
    state: { writing: 'Writing', done: 'Done', cancelled: 'Stopped', failed: 'Failed' },
    current: (block) => `Writing ${block}`,
    cancel: 'Stop',
    cancelled: 'It stops after the scene being written.',
    approveAll: (ready) => `Approve the ${ready} ready`,
    approveAllDirty: 'There are unsaved changes. The server approves and saves the script, so they have to be saved or discarded first.',
    approveSave: 'Save and approve',
    approveDiscard: 'Discard and approve',
    approveCancel: 'Not now',
    approveWorking: 'Approving…',
    approveDirtyStays: 'The changes could not be saved, so nothing was approved.',
    approved: (n, notApproved) => (notApproved ? `${n} scenes put in; ${notApproved} could not be approved and their block stays as it was.` : `${n} scenes put in the script.`),
    explain: 'Approve all ready saves them on the server and reloads the piece. One by one they are approved from their card.',
    cardOpen: 'Open',
    cardScore: (n) => `${n} of 10`,
    cardStates: { pending: 'Pending', writing: 'Writing', ready: 'Ready', failed: 'Failed', approved: 'Put in' },
    failed: (reason) => `The scenes could not be written: ${reason}`,
    close: 'Close',
  },
  review: {
    review: 'Review piece',
    hint: 'The vision model scores each scene and the piece as a whole',
    running: 'Reviewing the piece…',
    done: 'Review done',
    failed: (reason) => `It could not be reviewed: ${reason}`,
    title: "The piece's review",
    overall: (score) => `As a whole: ${score} of 10`,
    overallNotes: 'About the whole',
    repeated: (blocks) => `They repeat a metaphor: ${blocks}`,
    block: (id) => `Block ${id}`,
    mark: { pass: 'Pass', weak: 'Weak', fail: 'Fail' },
    noNotes: 'No notes.',
    open: 'Show review',
    close: 'Hide review',
    none: 'Not reviewed yet.',
  },
  theme: {
    title: "The piece's theme",
    hint: 'What every page shares: styles, drawings and the four corner texts.',
    css: 'Theme CSS',
    cssHint: (max) => `Added after the page's own: it may restyle #verse and #hit. Up to ${max} characters; no @import and no address that is not data:.`,
    cssCount: (n, max) => `${n} of ${max}`,
    refused: (reason) => `The server refuses it: ${reason}`,
    assets: 'Drawings',
    assetsHint: 'Small SVGs, up to 50 KB; a part places one with {{asset:name}}.',
    addAsset: 'Add SVG…',
    assetName: 'Name',
    assetTooBig: (kb) => `It is over ${kb} KB.`,
    assetNotSvg: 'It is not an SVG.',
    assetName_bad: 'A name is lower case letters, digits and _, from a letter, up to 32.',
    assetFull: (max) => `At most ${max} drawings.`,
    assetDuplicate: 'There is a drawing with that name already.',
    removeAsset: (name) => `Remove ${name}`,
    hud: 'Corner texts',
    hudHint: 'Drawn by the hud-chrome part. Up to 40 characters each.',
    corners: { tl: 'Top left', tr: 'Top right', bl: 'Bottom left', br: 'Bottom right' },
    fonts: 'Packed fonts',
    fontLicence: (family, licence, weights) => `${family}: ${licence}, weights ${weights}`,
    transition: 'Crossfade between pieces',
    transitionHint: '0 is a cut. 0.2 to 0.4 is usually right; 0 on a piece that lands on a word hit.',
    transitionPiece: "This piece's crossfade",
    transitionPieceHint: 'How this piece comes in from the one before.',
    transitionInherit: "The design's",
    framePreset: 'Frame: HUD and grain',
    framePresetHint: 'Adds a layer with hud-chrome and one with grain over the whole song.',
    framePresetDone: 'Frame layers added.',
    framePresetHas: 'There are layers with hud-chrome and grain already.',
    seconds: (s) => `${s.toLocaleString('en', { maximumFractionDigits: 2 })} s`,
  },
};

const TEXTS: Record<Lang, SceneTexts> = { es, en };
export const sceneTextsFor = (lang: Lang): SceneTexts => TEXTS[lang];
