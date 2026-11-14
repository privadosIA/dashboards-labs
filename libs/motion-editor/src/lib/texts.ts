export type MotionEditorLang = 'es' | 'en';

export interface MotionEditorTexts {
  readonly approximate: string;
  readonly exact: string;
  readonly gaps: {
    readonly missingPart: (name: string) => string;
    readonly stagePlaceholders: string;
    readonly fontsMayDiffer: string;
    readonly builtInBrowser: string;
    readonly keyframesNotDrawn: string;
    readonly layersNotDrawn: string;
    readonly crossfadeApproximated: string;
  };
  readonly transport: {
    readonly play: string;
    readonly pause: string;
    readonly stepBack: string;
    readonly stepForward: string;
    readonly toStart: string;
    readonly toEnd: string;
    readonly quantise: string;
    readonly noAudio: string;
    readonly seek: string;
    readonly beat: string;
    readonly section: string;
    readonly time: string;
  };
  readonly timeline: {
    readonly label: string;
    readonly zoomIn: string;
    readonly zoomOut: string;
    readonly zoomFit: string;
    readonly removeExtra: string;
    readonly removeLine: string;
    readonly line: (n: number) => string;
    readonly main: string;
    readonly extra: (n: number) => string;
    readonly sections: string;
    readonly loudness: string;
    readonly words: string;
    readonly magnet: string;
    readonly magnetHint: string;
    readonly cut: (n: number) => string;
    readonly keyframes: string;
    readonly keyframe: (param: string, time: string) => string;
    readonly addKeyframeHint: string;
    readonly layer: (n: number, id: string) => string;
    readonly newLayer: string;
    readonly moveLayer: string;
    readonly moveKeys: string;
    readonly extraKeys: string;
    readonly pageParts: (n: number, max: number) => string;
    readonly item: (layer: string, n: number, part: string) => string;
    readonly removeItem: string;
    readonly itemKeyframes: (layer: string, n: number, param: string) => string;
  };
  readonly warnings: {
    readonly coverage: string;
    readonly unknownPart: (part: string) => string;
    readonly paramType: (param: string) => string;
    readonly paramRange: (param: string, limit: number) => string;
    readonly paramLength: (param: string, limit: number) => string;
    readonly paramOption: (param: string) => string;
    readonly extrasCount: (limit: number) => string;
    readonly extrasRepeat: (part: string) => string;
    readonly keyword: (word: string) => string;
    readonly hitWord: (word: string) => string;
    readonly level: (part: string, level: string) => string;
    readonly animateUnsupported: string;
    readonly layersUnsupported: string;
    readonly mark: string;
  };
  readonly layers: {
    readonly label: string;
    readonly solo: string;
    readonly hide: string;
    readonly soloHint: string;
    readonly hideHint: string;
    readonly removePiece: string;
    readonly removeSlot: string;
    readonly empty: string;
    readonly add: string;
    readonly addHint: string;
    readonly extras: string;
    readonly piece: (id: string) => string;
  };
  readonly frame: { readonly title: string; readonly empty: string };
  readonly palette: {
    readonly title: string;
    readonly search: string;
    readonly text: string;
    readonly textHint: string;
    readonly add: (name: string) => string;
    readonly addLayer: (name: string) => string;
    readonly replace: (name: string) => string;
    readonly drag: string;
    readonly none: string;
    readonly user: string;
    readonly notAtLevel: (level: string) => string;
  };
}

const ES: MotionEditorTexts = {
  approximate: 'Aproximado',
  exact: 'Exacto',
  gaps: {
    missingPart: (name) => `Falta la parte «${name}»: se dibuja una tarjeta`,
    stagePlaceholders: 'El escenario se dibuja con marcadores',
    fontsMayDiffer: 'Las tipografías pueden diferir de las del servidor',
    builtInBrowser: 'Página construida en el navegador, no por el servidor',
    keyframesNotDrawn: 'Los fotogramas clave se ven aquí, pero el servidor aún no los dibuja',
    layersNotDrawn: 'Las capas se ven aquí, pero el servidor aún no las dibuja',
    crossfadeApproximated: 'Fundido aproximado: aquí se mezclan dos fotogramas, el vídeo disuelve las páginas',
  },
  transport: {
    play: 'Reproducir',
    pause: 'Pausa',
    stepBack: 'Un fotograma atrás',
    stepForward: 'Un fotograma adelante',
    toStart: 'Al principio',
    toEnd: 'Al final',
    quantise: 'Ajustar a fotogramas',
    noAudio: 'Esta canción no tiene audio aquí: el reloj avanza solo',
    seek: 'Posición en la canción',
    beat: 'Pulso',
    section: 'Sección',
    time: 'Tiempo',
  },
  timeline: {
    label: 'Línea de tiempo',
    zoomIn: 'Acercar',
    zoomOut: 'Alejar',
    zoomFit: 'Ajustar la canción a la ventana',
    removeExtra: 'Quitar esta parte extra',
    removeLine: 'Quitar este texto',
    line: (n) => `Texto ${n}`,
    main: 'Parte principal',
    extra: (n) => `Extra ${n}`,
    sections: 'Secciones',
    loudness: 'Volumen',
    words: 'Palabras',
    magnet: 'Imán',
    magnetHint: 'Los cortes se pegan al compás (tecla M; Alt lo suspende mientras se arrastra). Con Mayús, soltar un bloque sobre otro los intercambia.',
    cut: (n) => `Corte entre las piezas ${n} y ${n + 1}`,
    keyframes: 'Fotogramas clave',
    keyframe: (param, time) => `Fotograma clave de «${param}» en ${time}. Las flechas izquierda y derecha lo mueven 0,1 s; con Mayús, 1 s; con Alt, 0,01 s`,
    addKeyframeHint: 'Doble clic para añadir un fotograma clave aquí',
    layer: (n, id) => `Capa ${n} · ${id}`,
    newLayer: 'Suelta una parte aquí para crear otra capa',
    pageParts: (n, max) => `La página de esta pieza dibuja ${n} partes (el servidor admite ${max})`,
    moveLayer: 'Arrastra para cambiar el orden de la capa (la de abajo se dibuja encima); con Alt y las flechas, también',
    extraKeys: 'Las flechas arriba y abajo lo cambian de carril',
    moveKeys: 'Las flechas izquierda y derecha lo mueven 0,1 s; con Mayús, 1 s; con Alt, 0,01 s; [ y ] intercambian lo que dibuja con la pieza de antes o de después',
    item: (layer, n, part) => `Elemento ${n} de la capa «${layer}»: ${part}`,
    removeItem: 'Quitar este elemento',
    itemKeyframes: (layer, n, param) => `${layer} #${n} · ${param}`,
  },
  warnings: {
    coverage: 'El guion no cubre toda la canción: hay un hueco o se solapan piezas.',
    unknownPart: (p) => `La parte «${p}» no está en el catálogo.`,
    paramType: (n) => `El parámetro «${n}» no tiene el tipo que pide la parte.`,
    paramRange: (n, l) => `El parámetro «${n}» se sale del límite (${l}).`,
    paramLength: (n, l) => `El parámetro «${n}» es más largo de ${l} caracteres.`,
    paramOption: (n) => `El parámetro «${n}» no es una de las opciones de la parte.`,
    extrasCount: (l) => `Una pieza admite como mucho ${l} partes extra.`,
    extrasRepeat: (p) => `La parte «${p}» ya se dibuja en esta pieza.`,
    keyword: (w) => `«${w}» no es una palabra de ese texto.`,
    hitWord: (w) => `«${w}» no es una palabra de los textos de la pieza.`,
    level: (p, l) => `La parte «${p}» no se dibuja en el nivel ${l}; el servidor pondrá otra.`,
    animateUnsupported: 'El servidor no admite parámetros animados: quita los fotogramas clave para poder guardar.',
    layersUnsupported: 'El servidor no admite capas: quita las capas para poder guardar.',
    mark: 'Avisos',
  },
  layers: {
    label: 'Capas',
    solo: 'Solo',
    hide: 'Ocultar',
    soloHint: 'Solo: ver solo esta parte en la vista previa (no cambia la pieza)',
    hideHint: 'Ocultar esta parte en la vista previa (no cambia la pieza)',
    removePiece: 'Vaciar esta pieza: se queda en blanco para poner lo que quieras',
    removeSlot: 'Quitar este hueco (su tiempo pasa a la anterior)',
    empty: 'Vacía',
    add: 'Añadir pieza',
    addHint: 'Divide la pieza que está bajo el cursor en dos',
    extras: 'Extras',
    piece: (id) => `Pieza ${id}`,
  },
  frame: { title: 'Vista previa', empty: 'No hay nada que dibujar' },
  palette: {
    title: 'Biblioteca',
    search: 'Buscar una parte…',
    text: 'Texto',
    textHint: 'Un texto que aparece en pantalla',
    add: (name) => `Añadir ${name} a la pieza`,
    replace: (name) => `Poner ${name} como la parte de la pieza elegida`,
    addLayer: (name) => `Añadir ${name} como elemento de una capa donde está el cursor`,
    drag: 'Arrástralo a la línea de tiempo, o pulsa + para añadirlo a la pieza elegida, ⇄ para sustituir la parte de la pieza, o ▤ para hacerlo elemento de una capa',
    none: 'Ninguna parte coincide.',
    user: 'tuya',
    notAtLevel: (level) => `No admite el nivel ${level}`,
  },
};

const EN: MotionEditorTexts = {
  approximate: 'Approximate',
  exact: 'Exact',
  gaps: {
    missingPart: (name) => `Part "${name}" is missing: a card is drawn`,
    stagePlaceholders: 'The stage is drawn with placeholders',
    fontsMayDiffer: "Fonts may differ from the server's",
    builtInBrowser: 'Page built in the browser, not by the server',
    keyframesNotDrawn: 'Keyframes are previewed here, but the server does not draw them yet',
    layersNotDrawn: 'Layers are previewed here, but the server does not draw them yet',
    crossfadeApproximated: 'Crossfade approximated: two frames are blended here, the render dissolves the pages',
  },
  transport: {
    play: 'Play',
    pause: 'Pause',
    stepBack: 'One frame back',
    stepForward: 'One frame forward',
    toStart: 'To the start',
    toEnd: 'To the end',
    quantise: 'Snap to frames',
    noAudio: 'This song has no audio here: the clock runs on its own',
    seek: 'Position in the song',
    beat: 'Beat',
    section: 'Section',
    time: 'Time',
  },
  timeline: {
    label: 'Timeline',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    zoomFit: 'Fit the whole song in the window',
    removeExtra: 'Remove this extra part',
    removeLine: 'Remove this text',
    line: (n) => `Text ${n}`,
    main: 'Main part',
    extra: (n) => `Extra ${n}`,
    sections: 'Sections',
    loudness: 'Loudness',
    words: 'Words',
    magnet: 'Magnet',
    magnetHint: 'Cuts stick to the beat (M key; Alt suspends it while dragging). With Shift, dropping a block on another swaps them.',
    cut: (n) => `Cut between pieces ${n} and ${n + 1}`,
    keyframes: 'Keyframes',
    keyframe: (param, time) => `Keyframe of "${param}" at ${time}. Left and Right arrows move it 0.1 s; with Shift, 1 s; with Alt, 0.01 s`,
    addKeyframeHint: 'Double-click to add a keyframe here',
    layer: (n, id) => `Layer ${n} · ${id}`,
    newLayer: 'Drop a part here to make another layer',
    pageParts: (n, max) => `The page of this piece draws ${n} parts (the server takes ${max})`,
    moveLayer: 'Drag to change the layer\'s order (the lowest is drawn on top); Alt and the arrow keys do it too',
    extraKeys: 'Up and Down arrows take it to another lane',
    moveKeys: 'Left and Right arrows move it 0.1 s; with Shift, 1 s; with Alt, 0.01 s; [ and ] swap what it draws with the piece before or after',
    item: (layer, n, part) => `Item ${n} of layer "${layer}": ${part}`,
    removeItem: 'Remove this item',
    itemKeyframes: (layer, n, param) => `${layer} #${n} · ${param}`,
  },
  warnings: {
    coverage: 'The script does not cover the whole song: there is a gap or pieces overlap.',
    unknownPart: (p) => `The part "${p}" is not in the catalog.`,
    paramType: (n) => `The parameter "${n}" is not of the type the part asks for.`,
    paramRange: (n, l) => `The parameter "${n}" is outside its limit (${l}).`,
    paramLength: (n, l) => `The parameter "${n}" is longer than ${l} characters.`,
    paramOption: (n) => `The parameter "${n}" is not one of the part's options.`,
    extrasCount: (l) => `A piece takes at most ${l} extra parts.`,
    extrasRepeat: (p) => `The part "${p}" is already drawn in this piece.`,
    keyword: (w) => `"${w}" is not a word of that text.`,
    hitWord: (w) => `"${w}" is not a word of the piece's texts.`,
    level: (p, l) => `The part "${p}" is not drawn at the ${l} level; the server will swap it.`,
    animateUnsupported: 'The server does not accept animated parameters: remove the keyframes to be able to save.',
    layersUnsupported: 'The server does not accept layers: remove the layers to be able to save.',
    mark: 'Warnings',
  },
  layers: {
    label: 'Layers',
    solo: 'Solo',
    hide: 'Hide',
    soloHint: 'Solo: see only this part in the preview (the piece does not change)',
    hideHint: 'Hide this part in the preview (the piece does not change)',
    removePiece: 'Empty this piece: it is left blank for whatever you want',
    removeSlot: 'Remove this slot (its time goes to the one before)',
    empty: 'Empty',
    add: 'Add piece',
    addHint: 'Splits the piece under the playhead in two',
    extras: 'Extras',
    piece: (id) => `Piece ${id}`,
  },
  frame: { title: 'Preview', empty: 'Nothing to draw' },
  palette: {
    title: 'Library',
    search: 'Search a part…',
    text: 'Text',
    textHint: 'A text that appears on screen',
    add: (name) => `Add ${name} to the piece`,
    replace: (name) => `Make ${name} the part of the chosen piece`,
    addLayer: (name) => `Add ${name} as a layer item where the playhead is`,
    drag: 'Drag it onto the timeline, or press + to add it to the selected piece, ⇄ to replace the piece\'s part, or ▤ to make it a layer item',
    none: 'No part matches.',
    user: 'yours',
    notAtLevel: (level) => `Does not support level ${level}`,
  },
};

/** The words of the editor's components in the dashboard's language. */
export const motionEditorTexts = (lang: MotionEditorLang): MotionEditorTexts => (lang === 'es' ? ES : EN);
