import type { Lang } from '@lab/forms-kit';

/** Every text the dashboard shows, in each language. Add a key here and TypeScript asks for both languages. */
/** The texts of the section that asks the server to learn from a reference. */
export interface LearnTexts {
  title: string;
  intro: string;
  nothingEnters: string;
  strictness: string;
  strictnesses: Record<'low' | 'normal' | 'high', string>;
  action: string;
  again: string;
  starting: string;
  notReady: string;
  running: string;
  runningNote: string;
  failed: string;
  styles: string;
  parts: string;
  none: string;
  novel: string;
  similar: string;
  kinds: Record<'style' | 'part' | 'draft', string>;
  distance: string;
  states: Record<'ready' | 'writing' | 'failed' | 'gone', string>;
  gone: string;
  openStyle: string;
  openPart: string;
  discarded: string;
  discardedNone: string;
  skipped: string;
  skippedNone: string;
  strictnessUsed: string;
  history: string;
  historyEmpty: string;
  open: string;
  current: string;
  when: string;
  summary: (styles: number, parts: number, discarded: number) => string;
}

export interface Texts {
  title: string;
  nav: { new: string; songs: string; pieces: string; references: string; presets: string; parts: string; datasets: string };
  /** The links to the host's editors (drawn only when the host gave the place). */
  links: { editInMotionEdit: string; vectorCatalog: string; openInVector: string };
  language: string;
  loading: string;
  retry: string;
  back: string;
  cancel: string;
  /** What the screens say about a call that did not work, by kind; the server's own reason follows. */
  failure: { refused: string; busy: string; unavailable: string; missing: string; other: string };
  songs: {
    title: string;
    intro: string;
    empty: string;
    emptyHint: string;
    loadFailed: string;
    version: string;
    versionOf: string;
    instrumental: string;
    animate: string;
    listen: string;
  };
  newPiece: {
    title: string;
    song: string;
    songMissing: string;
    create: string;
    creating: string;
    styles: Record<'typographic' | 'illustrated', string>;
    levels: Record<'simple' | 'medium' | 'advanced', string>;
    slowNote: string;
    noPreset: string;
    inBrowser: string;
  };
  pieces: {
    title: string;
    intro: string;
    empty: string;
    emptyHint: string;
    states: Record<'draft' | 'queued' | 'running' | 'done' | 'failed', string>;
    open: string;
    remove: string;
    removeTitle: string;
    removeMessage: string;
    removeAction: string;
    progress: string;
    spec: string;
    size: string;
    forecast: string;
    exampleLoad: string;
    exampleHint: string;
    exampleLoaded: string;
    importLabel: string;
    imported: string;
    importUnreadable: string;
    importTooBig: string;
    importRefused: string;
    importMore: string;
    exportDataset: string;
    /** What the page says after saving the dataset of an animation. */
    exportedDataset: (file: string) => string;
    exportFailed: string;
  };
  references: {
    title: string;
    intro: string;
    empty: string;
    add: string;
    chooseFile: string;
    noFile: string;
    clearFile: string;
    addAction: string;
    adding: string;
    sourceNeeded: string;
    analysingNote: string;
    states: Record<'analysing' | 'ready' | 'failed', string>;
    open: string;
    remove: string;
    removeTitle: string;
    removeMessage: string;
    removeAction: string;
    back: string;
    edit: string;
    save: string;
    saving: string;
    saved: string;
    frames: string;
    colours: string;
    third: string;
    cuts: string;
    meanShot: string;
    tempo: string;
    key: string;
    size: string;
    duration: string;
    description: string;
    noDescription: string;
    failedReason: string;
    makePreset: string;
    makingPreset: string;
    presetMade: string;
    adjustments: string;
    notReady: string;
    loadFailed: string;
    missing: string;
    tags: string;
    source: string;
    uploaded: string;
    learn: LearnTexts;
    taught: (styles: number, parts: number) => string;
  };
  presets: {
    title: string;
    intro: string;
    empty: string;
    emptyHint: string;
    open: string;
    remove: string;
    removeTitle: string;
    removeMessage: string;
    removeAction: string;
    back: string;
    rhythm: string;
    parts: string;
    allParts: string;
    fromReference: string;
    referenceGone: string;
    newStyle: string;
    ownTitle: string;
    ownIntro: string;
    ownBadge: string;
    ownEdit: string;
    adjustments: string;
    save: string;
    saving: string;
    saved: string;
    loadFailed: string;
    missing: string;
    design: string;
  };
  newAnimation: {
    title: string;
    intro: string;
    steps: { look: string; song: string; options: string };
    stepOf: (n: number, total: number) => string;
    next: string;
    back: string;
    look: {
      title: string;
      intro: string;
      none: string;
      noneHint: string;
      referencesTitle: string;
      noReferences: string;
      stylesTitle: string;
      noStyles: string;
      addressTitle: string;
      addressHint: string;
      add: string;
      adding: string;
      added: string;
      analysing: string;
      failed: string;
      chosen: (name: string) => string;
      willMake: string;
      refused: string;
      ownBadge: string;
      tags: string;
    };
    song: { title: string; intro: string; chosen: string; none: string; empty: string; emptyHint: string; loadFailed: string; change: string };
    options: { title: string; look: string; song: string; noLook: string; text: string; noText: string; assistant: string; routing: string; summary: string; nextTitle: string; next: readonly string[] };
    making: string;
    referenceStyle: string;
    prompt: { title: string; intro: string; hint: string; counter: (n: number, max: number) => string; ownNote: string };
    progress: { creating: string; design: string; script: string; elapsed: (seconds: number) => string; keepOpen: string; created: string };
  };
  styleBuilder: {
    title: string;
    editTitle: string;
    intro: string;
    back: string;
    keepTitle: string;
    keepBrowser: string;
    keepHint: string;
    keepServer: (name: string) => string;
    noReady: string;
    save: string;
    saving: string;
    savedBrowser: string;
    savedServer: string;
    movedServer: string;
    refused: string;
    missing: string;
    browserNote: string;
    picker: {
      title: string;
      search: string;
      level: string;
      anyLevel: string;
      levels: Record<'simple' | 'medium' | 'advanced', string>;
      available: string;
      chosen: string;
      none: string;
      noMatch: string;
      add: string;
      remove: string;
      up: string;
      down: string;
      count: (n: number, max: number) => string;
      full: (max: number) => string;
      unsupported: (level: string) => string;
      cost: (ms: number) => string;
      manual: string;
      unknown: string;
    };
  };
  datasets: {
    title: string;
    intro: string;
    export: {
      title: string;
      intro: string;
      partsNote: string;
      /** Shown when there is no animation to export. */
      empty: string;
      loading: string;
      action: string;
      working: string;
      /** The sentence that says what was saved. */
      exported: (title: string, file: string) => string;
      failed: string;
    };
    import: {
      title: string;
      intro: string;
      chooseFile: string;
      noFile: string;
      limit: string;
      reading: string;
      unreadable: string;
      tooBig: string;
      problemsTitle: string;
      reportTitle: string;
      /** The one line that says what importing would do. */
      summary: (c: Record<'create' | 'exists' | 'keep-local' | 'impossible', number>) => string;
      columns: { kind: string; item: string; action: string; why: string };
      kinds: Record<'song' | 'reference' | 'style' | 'part' | 'animation', string>;
      actions: Record<'create' | 'exists' | 'keep-local' | 'impossible', string>;
      reasons: Record<'no-address' | 'song-missing' | 'parts-missing' | 'no-ready-reference' | 'part-no-text' | 'draft-invalid' | 'fitted' | 'animate-unsupported' | 'layers-unsupported', (detail: string) => string>;
      songLabel: string;
      /** The option that keeps the song of the file, with whether the library has it. */
      songOfFile: (title: string, found: boolean) => string;
      songHint: string;
      openAnimation: string;
      nothingToDo: string;
      approvalNote: string;
      dropAnimate: string;
      assistantNote: string;
      askAssistant: string;
      asked: string;
      askFailed: string;
      confirm: string;
      cancel: string;
      running: string;
      stop: string;
      states: Record<'created' | 'exists' | 'kept-local' | 'failed' | 'skipped', string>;
      pending: string;
      doneTitle: string;
      done: (c: Record<'created' | 'exists' | 'kept-local' | 'failed' | 'skipped', number>) => string;
      another: string;
      notDurable: string;
    };
  };
  parts: {
    title: string;
    intro: string;
    empty: string;
    ask: string;
    pictureNone: string;
    pictureFrame: string;
    pictureFile: string;
    noPictureNote: string;
    ageWarning: string;
    chooseReference: string;
    noReferences: string;
    frame: string;
    chooseFile: string;
    noFile: string;
    clearFile: string;
    askAction: string;
    pictureNeeded: string;
    asking: string;
    states: Record<'writing' | 'ready' | 'failed', string>;
    open: string;
    remove: string;
    removeTitle: string;
    removeMessage: string;
    removeAction: string;
    back: string;
    writingNote: string;
    picture: string;
    sourceUpload: string;
    sourceReference: string;
    seen: string;
    attempts: string;
    preview: string;
    problems: string;
    failedReason: string;
    pictureLost: string;
    edit: string;
    save: string;
    saving: string;
    saved: string;
    retry: string;
    retrying: string;
    approve: string;
    approving: string;
    approveTitle: string;
    approveMessage: string;
    approveAction: string;
    approved: string;
    parameters: string;
    noParameters: string;
    nameTaken: string;
    loadFailed: string;
    missing: string;
    name: string;
    /** A draft made from a text has no sentence: this stands in its place. */
    fromText: string;
    mineTitle: string;
    mineIntro: string;
    mineEmpty: string;
    mineEdit: string;
    mineRemove: string;
    newFromScratch: string;
    newTitle: string;
    newIntro: string;
    newCreate: string;
    newCreating: string;
    ownTitle: string;
    ownIntro: string;
    ownBuiltin: string;
    ownMissing: string;
    ownLoadFailed: string;
    ownSave: string;
    ownSaved: string;
    removePartTitle: string;
    removePartMessage: string;
    removePartAction: string;
    forceTitle: string;
    forceMessage: string;
    forceAction: string;
    previewButton: string;
    previewPause: string;
    previewResume: string;
    previewFailed: string;
    previewFrame: string;
    previewNote: string;
    askChangeTitle: string;
    askChangeHint: string;
    askChangeAction: string;
    askChangeBusy: string;
    replace: string;
    replacing: string;
    replaceTitle: string;
    replaceMessage: string;
    replaceAction: string;
    replaced: string;
  };
  piece: {
    missing: string;
    loadFailed: string;
    drawing: string;
    createdNotice: string;
    presetOrigin: string;
    ownOrigin: string;
    promptFailed: string;
    presetGone: string;
    tabs: string;
  };
  design: {
    title: string;
    save: string;
    saving: string;
    saved: string;
    modeOf: string;
    modes: Record<'dark' | 'light', string>;
    origin: Record<'assistant' | 'fallback' | 'user', string>;
    swatches: string;
    verseStyles: Record<'plain' | 'highlight' | 'karaoke' | 'glow', string>;
    hitStyles: Record<'plain' | 'metal' | 'glow', string>;
    concept: string;
    conceptPlaceholder: string;
    /** How much of the concept's room is used: `12 of 200 characters`. */
    conceptCount: (n: number, max: number) => string;
  };
  render: {
    title: string;
    forecast: string;
    forecastNote: string;
    draw: string;
    again: string;
    working: string;
    progress: string;
    video: string;
    download: string;
    failed: string;
    finishedTitle: string;
    failedTitle: string;
    finishedBody: string;
    failedBody: string;
  };
  propose: {
    title: string;
    design: string;
    script: string;
    working: string;
    confirmTitle: string;
    confirmDesign: string;
    confirmDesignEdited: string;
    confirmScript: string;
    action: string;
    done: Record<'design' | 'script', string>;
    source: Record<'assistant' | 'fallback', string>;
    replaced: string;
    replacedItem: string;
    both: string;
    confirmBoth: string;
    model: string;
    modelDefault: (name: string) => string;
    modelNoFit: string;
    promptHint: string;
    counter: (n: number, max: number) => string;
    proposingNote: string;
    modelUsed: (name: string) => string;
    reason: (why: string) => string;
  };
  proposal: {
    title: string;
    states: Record<'waiting' | 'writing' | 'done' | 'failed', string>;
    model: (name: string) => string;
    elapsed: (time: string) => string;
    design: string;
    script: string;
    assistant: string;
    rule: (reason: string) => string;
    ruleNoReason: string;
    error: (why: string) => string;
  };
  songMap: {
    title: string;
    tempo: string;
    estimated: string;
    heard: string;
    legend: string;
    summary: string;
    sync: string;
    syncing: string;
    syncWait: string;
    syncDone: string;
    syncNotice: string;
    syncWarning: string;
  };
  stage: {
    title: string;
    hint: string;
    background: string;
    character: string;
    pose: string;
    expression: string;
    action: string;
    x: string;
    y: string;
    size: string;
    add: string;
    remove: string;
    none: string;
    empty: string;
  };
  script: {
    title: string;
    hint: string;
    save: string;
    saving: string;
    saved: string;
    discard: string;
    piece: string;
    part: string;
    mode: string;
    start: string;
    end: string;
    keyword: string;
    none: string;
    hitWord: string;
    hitAt: string;
    hitLength: string;
    aboveLevel: string;
    covers: string;
    showOnMap: string;
    extras: string;
    extrasHint: string;
    extraPart: string;
    addExtra: string;
    removeExtra: string;
    pieceDesign: string;
    pieceDesignHint: string;
    giveDesign: string;
    backToSong: string;
    songValue: string;
  };
}

const es: Texts = {
  title: 'Video Anim',
  nav: { new: 'Nueva animación', songs: 'Canciones', pieces: 'Piezas', references: 'Referencias', presets: 'Estilos', parts: 'Partes', datasets: 'Datasets' },
  links: { editInMotionEdit: 'Editar en Motion Edit', vectorCatalog: 'Partes vectoriales', openInVector: 'Abrir en Vector' },
  language: 'Idioma',
  loading: 'Cargando…',
  retry: 'Reintentar',
  back: 'Volver',
  cancel: 'Cancelar',
  failure: {
    refused: 'El servidor no lo acepta:',
    busy: 'La pieza se está dibujando:',
    unavailable: 'El servidor no puede dibujar ahora:',
    missing: 'Ya no existe:',
    other: 'No se pudo hablar con el servidor:',
  },
  songs: {
    title: 'Canciones',
    intro: 'Elige una canción de la biblioteca para hacerle una pieza animada que la siga.',
    empty: 'La biblioteca no tiene canciones.',
    emptyHint: 'Las canciones se hacen en un panel de música; aquí solo se leen.',
    loadFailed: 'No se pudo leer la biblioteca.',
    version: 'Versión',
    versionOf: 'Versión {n}',
    instrumental: 'instrumental',
    animate: 'Animar',
    listen: 'Escuchar',
  },
  newPiece: {
    title: 'Nueva pieza',
    song: 'Canción',
    songMissing: 'Esa canción ya no está en la biblioteca.',
    create: 'Crear pieza',
    creating: 'Creando…',
    styles: { typographic: 'Tipográfico', illustrated: 'Ilustrado' },
    levels: { simple: 'Simple', medium: 'Medio', advanced: 'Avanzado' },
    slowNote: 'El nivel avanzado a 60 fps tarda mucho en dibujarse: verás la previsión antes de dibujar.',
    noPreset: '(ninguno)',
    inBrowser: 'en este navegador',
  },
  pieces: {
    title: 'Piezas',
    intro: 'Las piezas animadas que has hecho, la más reciente primero.',
    empty: 'Aún no hay piezas.',
    emptyHint: 'Elige una canción y púlsale Animar.',
    states: { draft: 'Borrador', queued: 'En cola', running: 'Dibujando', done: 'Hecha', failed: 'Falló' },
    open: 'Abrir',
    remove: 'Borrar',
    removeTitle: 'Borrar la pieza',
    removeMessage: 'Se borra la pieza con sus ficheros y su historial. No se puede deshacer.',
    removeAction: 'Borrar',
    progress: 'Progreso',
    spec: '{style} · {level} · {fps} fps · {size}',
    size: 'Tamaño',
    forecast: 'Previsión: {time}',
    exampleLoad: 'Cargar ejemplo',
    exampleHint: 'Datos de demostración con un vídeo real, para ver qué muestran las pantallas, o un fichero tuyo en ese formato. No se envía nada a ningún servidor. El dataset de tu trabajo, para sacarlo o traerlo de un servidor, está en Datasets.',
    exampleLoaded: 'Ejemplo cargado: sus canciones, piezas, referencias, estilos y partes están en sus pantallas.',
    importLabel: 'Importar dataset de demostración',
    imported: 'Dataset importado: sus canciones, piezas, referencias, estilos y partes están en sus pantallas.',
    importUnreadable: 'No se pudo leer el fichero: no es un JSON.',
    importTooBig: 'El fichero es demasiado grande: como mucho 1 MB.',
    importRefused: 'No se cargó nada. El fichero tiene estos problemas:',
    importMore: 'y {n} más',
    exportDataset: 'Exportar dataset',
    exportedDataset: (file) => `Dataset de la animación guardado en ${file}.`,
    exportFailed: 'No se pudo exportar el dataset:',
  },
  references: {
    title: 'Referencias',
    intro: 'Vídeos que das como ejemplo de una buena pieza. El servidor no guarda el vídeo: solo sus fotogramas clave y lo que lee de él.',
    empty: 'Aún no hay referencias. Añade una con la dirección de un vídeo de YouTube o con un fichero.',
    add: 'Añadir una referencia',
    chooseFile: 'O elige un vídeo',
    noFile: 'Ningún fichero',
    clearFile: 'Quitar el fichero',
    addAction: 'Añadir referencia',
    adding: 'Añadiendo…',
    sourceNeeded: 'Escribe una dirección de YouTube o elige un vídeo, pero no las dos cosas.',
    analysingNote: 'El servidor la está analizando: tarda unos segundos.',
    states: { analysing: 'Analizando', ready: 'Lista', failed: 'Falló' },
    open: 'Abrir',
    remove: 'Borrar',
    removeTitle: 'Borrar la referencia',
    removeMessage: 'se borra con sus fotogramas. Si se está analizando, el análisis se detiene. Los estilos que salieron de ella se conservan.',
    removeAction: 'Borrar',
    back: 'Referencias',
    edit: 'Datos de la referencia',
    save: 'Guardar',
    saving: 'Guardando…',
    saved: 'Guardado.',
    frames: 'Fotogramas clave',
    colours: 'Colores dominantes',
    third: 'Tercio {n}',
    cuts: 'Cambios de plano',
    meanShot: 'Plano medio',
    tempo: 'Tempo',
    key: 'Tonalidad',
    size: 'Tamaño',
    duration: 'Duración',
    description: 'Cómo se ve',
    noDescription: 'Sin descripción:',
    failedReason: 'No se pudo analizar:',
    makePreset: 'Hacer un estilo con ella',
    makingPreset: 'Haciendo el estilo…',
    presetMade: 'Estilo hecho:',
    adjustments: 'Lo que hubo que ajustar de los colores del vídeo:',
    notReady: 'Solo se puede hacer un estilo con una referencia lista.',
    loadFailed: 'No se pudo leer la referencia.',
    missing: 'Esa referencia ya no existe.',
    tags: 'Etiquetas',
    source: 'Origen',
    uploaded: 'Vídeo subido',
    taught: (s, p) => `Enseñó ${s === 1 ? '1 estilo' : `${s} estilos`} y ${p === 1 ? '1 parte' : `${p} partes`}`,
    learn: {
      title: 'Aprender de esta referencia',
      intro: 'El servidor mira la referencia y propone un estilo y hasta tres partes que sean distintos de lo que ya hay; lo que se parece demasiado lo descarta y lo dice. Puede tardar unos minutos y se puede dejar: sigue en el servidor.',
      nothingEnters: 'Nada entra en el catálogo por sí solo: los estilos se editan en Estilos y las partes son borradores que se aprueban en Partes.',
      strictness: 'Exigencia',
      strictnesses: { low: 'Baja: acepta lo parecido', normal: 'Normal', high: 'Alta: solo lo muy distinto' },
      action: 'Aprender',
      again: 'Aprender otra vez',
      starting: 'Empezando…',
      notReady: 'Solo se puede aprender de una referencia lista.',
      running: 'Aprendiendo…',
      runningNote: 'El servidor está aprendiendo de la referencia. Puedes salir de esta página: sigue en el servidor y aparecerá en el historial.',
      failed: 'No pudo aprender:',
      styles: 'Estilos que conservó',
      parts: 'Partes que propuso (borradores)',
      none: 'Ninguno',
      novel: 'Distinto de lo que hay',
      similar: 'Parecido a',
      kinds: { style: 'el estilo', part: 'la parte', draft: 'el borrador' },
      distance: 'distancia',
      states: { ready: 'Lista', writing: 'Escribiéndose', failed: 'Falló', gone: 'Ya no existe' },
      gone: 'Se borró o se aprobó y ya está en el catálogo.',
      openStyle: 'Abrir el estilo',
      openPart: 'Abrir el borrador',
      discarded: 'Lo que descartó por parecerse demasiado',
      discardedNone: 'No descartó nada.',
      skipped: 'Lo que no pudo hacer',
      skippedNone: 'Pudo hacerlo todo.',
      strictnessUsed: 'Exigencia usada',
      history: 'Aprendizajes anteriores',
      historyEmpty: 'Todavía no ha aprendido nada de esta referencia.',
      open: 'Ver',
      current: 'Ahora',
      when: 'Empezó',
      summary: (s, p, d) => `${s} estilos, ${p} partes y ${d} descartadas`,
    },
  },
  presets: {
    title: 'Estilos',
    intro: 'Un estilo es un diseño, un ritmo y unas partes sacados de una referencia. Una pieza puede empezar por uno.',
    empty: 'Aún no hay estilos.',
    emptyHint: 'Se hacen desde una referencia lista:',
    open: 'Editar',
    remove: 'Borrar',
    removeTitle: 'Borrar el estilo',
    removeMessage: 'se borra. Las piezas que partieron de él no cambian.',
    removeAction: 'Borrar',
    back: 'Estilos',
    rhythm: 'Ritmo',
    parts: 'Partes',
    allParts: 'Todas las habituales',
    fromReference: 'De la referencia',
    referenceGone: 'Su referencia ya no existe',
    newStyle: 'Nuevo estilo',
    ownTitle: 'Guardados en este navegador',
    ownIntro: 'No están en el servidor: salen en la exportación y se pueden elegir al hacer una pieza. Para llevarlos al servidor, ábrelos y elige una referencia lista.',
    ownBadge: 'En este navegador',
    ownEdit: 'Abrir',
    adjustments: 'Lo que hubo que ajustar de los colores del vídeo:',
    save: 'Guardar estilo',
    saving: 'Guardando…',
    saved: 'Estilo guardado.',
    loadFailed: 'No se pudo leer el estilo.',
    missing: 'Ese estilo ya no existe.',
    design: 'Diseño del estilo',
  },
  newAnimation: {
    title: 'Nueva animación',
    intro: 'Cuenta qué quieres, elige el aspecto (sale de una referencia: una que ya tengas o un vídeo de YouTube), la canción y cómo se dibuja.',
    steps: { look: 'Idea y aspecto', song: 'Canción', options: 'Opciones' },
    stepOf: (n, total) => `Paso ${n} de ${total}`,
    next: 'Siguiente',
    back: 'Atrás',
    look: {
      title: 'Aspecto',
      intro: 'Elige una referencia ya analizada o pega la dirección de un vídeo de YouTube: de ella sale el estilo de la pieza. También puedes partir de un estilo o de ninguno.',
      none: 'Sin aspecto',
      noneHint: 'La pieza parte de la regla fija, sin estilo.',
      referencesTitle: 'Referencias',
      noReferences: 'Aún no hay referencias. Pega una dirección de YouTube para añadir la primera.',
      stylesTitle: 'O parte de un estilo',
      noStyles: 'No hay estilos guardados.',
      addressTitle: 'Un vídeo de YouTube',
      addressHint: 'Se añade como referencia y se analiza en unos segundos; no hace falta salir de aquí.',
      add: 'Añadir',
      adding: 'Añadiendo…',
      added: 'Añadida: se está analizando.',
      analysing: 'Analizando…',
      failed: 'Falló',
      chosen: (name) => `Aspecto elegido: ${name}`,
      willMake: 'Al crear la animación se hará un estilo a partir de esta referencia, o se usará el que ya tenga.',
      refused: 'No se pudo añadir:',
      ownBadge: 'en este navegador',
      tags: 'Etiquetas',
    },
    song: {
      title: 'Canción',
      intro: 'Elige la canción de la biblioteca que la animación va a seguir.',
      chosen: 'Canción elegida',
      none: 'Ninguna canción elegida.',
      empty: 'La biblioteca no tiene canciones.',
      emptyHint: 'Las canciones se hacen en un panel de música; aquí solo se leen.',
      loadFailed: 'No se pudo leer la biblioteca.',
      change: 'Cambiar',
    },
    options: {
      title: 'Opciones',
      look: 'Aspecto',
      song: 'Canción',
      noLook: 'ninguno',
      text: 'Texto',
      noText: 'ninguno',
      assistant: 'Asistente',
      routing: 'como lo enruta el servidor',
      summary: 'Tu animación',
      nextTitle: 'Qué pasa al crearla',
      next: ['Se crea la pieza con la canción, el aspecto y tu texto, y se guarda el diseño.', 'El asistente escribe el guion en segundo plano; sin asistente, lo escribe la regla fija, que no lee el texto.', 'Vas a la página de la pieza y ves cómo avanza. Allí puedes revisarla, editarla en Motion Edit y dibujarla.'],
    },
    making: 'Haciendo el estilo de la referencia…',
    referenceStyle: 'Estilo de',
    prompt: {
      title: 'Describe tu animación',
      intro: 'Cuéntalo con tus palabras, como en los demás paneles: el asistente del servidor escribe el diseño y el guion a partir de tu texto. Es opcional: sin texto, la animación se hace como siempre.',
      hint: 'Se guarda con la pieza (hasta 2000 caracteres) y el asistente la lee al escribir el diseño y el guion, en segundo plano: irás a la página de la pieza y verás cómo avanza. Si el servidor no tiene asistente, sale de la regla fija, que no lee el texto.',
      counter: (n, max) => `${n} de ${max} caracteres`,
      ownNote: 'Con un estilo propio el diseño y el guion salen del estilo: tu texto solo se guarda con la pieza.',
    },
    progress: {
      creating: 'Creando la pieza…',
      design: 'Guardando el diseño…',
      script: 'Pidiendo el guion al asistente…',
      elapsed: (n) => `Van ${n} s`,
      keepOpen: 'No cierres esta página: al terminar se abre la pieza.',
      created: 'La pieza ya está en Piezas; si cierras esta página puede quedarse sin tu texto y sin el guion del asistente.',
    },
  },
  styleBuilder: {
    title: 'Nuevo estilo',
    editTitle: 'Estilo propio',
    intro: 'Haz un estilo desde cero: elige las partes del catálogo, el diseño y el ritmo. Al usarlo en una pieza, su guion recorre esas partes de una en una.',
    back: 'Estilos',
    keepTitle: 'Dónde guardarlo',
    keepBrowser: 'En este navegador',
    keepHint: 'El servidor solo hace estilos a partir de una referencia lista. Sin ella, el estilo se queda en este navegador y va en la exportación; con una, se guarda en el servidor.',
    keepServer: (name) => `En el servidor, a partir de «${name}»`,
    noReady: 'No hay referencias listas: se guardará en este navegador.',
    save: 'Guardar estilo',
    saving: 'Guardando…',
    savedBrowser: 'Guardado en este navegador.',
    savedServer: 'Guardado en el servidor.',
    movedServer: 'Guardado en el servidor; la copia de este navegador se ha quitado.',
    refused: 'El servidor no lo guardó:',
    missing: 'Ese estilo no está en este navegador.',
    browserNote: 'El navegador no deja guardar: este estilo se perderá al cerrar la página.',
    picker: {
      title: 'Partes',
      search: 'Buscar partes',
      level: 'Nivel',
      anyLevel: 'Cualquiera',
      levels: { simple: 'Simple', medium: 'Medio', advanced: 'Avanzado' },
      available: 'Catálogo',
      chosen: 'Elegidas, en este orden',
      none: 'Ninguna parte elegida: el estilo usaría todas las habituales.',
      noMatch: 'Ninguna parte coincide.',
      add: 'Añadir',
      remove: 'Quitar',
      up: 'Subir',
      down: 'Bajar',
      count: (n, max) => `${n} de ${max}`,
      full: (max) => `Un estilo tiene como mucho ${max} partes.`,
      unsupported: (level) => `No se dibuja en el nivel ${level}.`,
      cost: (ms) => `${ms} ms por fotograma`,
      manual: 'Solo si el guion la nombra',
      unknown: 'Ya no está en el catálogo',
    },
  },
  datasets: {
    title: 'Datasets',
    intro: 'Saca una animación de este servidor o trae una de otro: su diseño y su guion (sin vídeo), el estilo del que partió y las partes propias que usa. El fichero es el de una animación, no el dataset de proyectos del dashboard completo.',
    export: {
      title: 'Exportar',
      intro: 'Un dataset es el de una animación: elige la que quieres sacar de este servidor. El fichero lleva su diseño, su guion, el estilo del que partió y las partes propias que usa; nunca el vídeo.',
      partsNote: 'Una parte que ya aprobaste no se puede leer de vuelta del servidor: va con su descripción y sus parámetros, marcada sin texto.',
      empty: 'Aún no hay animaciones que exportar.',
      loading: 'Cargando las animaciones…',
      action: 'Exportar',
      working: 'Exportando…',
      exported: (title, file) => `Guardado ${file}: la animación «${title}».`,
      failed: 'No se pudo exportar:',
    },
    import: {
      title: 'Importar',
      intro: 'Elige el fichero del dataset de una animación. Antes de crear nada verás un informe de lo que pasaría con la canción, la referencia, el estilo, las partes y la animación; y podrás ponerla sobre otra canción de la biblioteca.',
      chooseFile: 'Elegir fichero',
      noFile: 'Ningún fichero elegido',
      limit: 'Hasta 5 MB.',
      reading: 'Leyendo el fichero…',
      unreadable: 'El fichero no se pudo leer como JSON.',
      tooBig: 'El fichero pesa más de 5 MB.',
      problemsTitle: 'El fichero no es válido y no se ha creado nada:',
      reportTitle: 'Informe de la importación',
      summary: (c) => `${c.create} por crear, ${c['keep-local']} para guardar en este navegador, ${c.exists} que ya están y ${c.impossible} que no se pueden.`,
      columns: { kind: 'Tipo', item: 'Elemento', action: 'Qué pasará', why: 'Motivo' },
      kinds: { song: 'Canción', reference: 'Referencia', style: 'Estilo', part: 'Parte', animation: 'Animación' },
      actions: { create: 'Se crea', exists: 'Ya está', 'keep-local': 'Se guarda en el navegador', impossible: 'No se puede' },
      reasons: {
        'no-address': () => 'Se subió como vídeo y no tiene dirección: no se puede volver a hacer.',
        'song-missing': (d) => `La canción «${d}» no está en la biblioteca.`,
        'parts-missing': (d) => `Usa partes que el catálogo aún no tiene: ${d}. Aprueba en Partes los borradores que trae el fichero e importa otra vez.`,
        'no-ready-reference': () => 'El servidor no hace un estilo sin una referencia lista.',
        'part-no-text': () => 'El catálogo no la tiene y el fichero no trae su texto.',
        'draft-invalid': () => 'Su manifest no es un JSON que nombre la parte.',
        fitted: (d) => (d ? `Va sobre otra canción de la biblioteca: el guion de «${d}» se ajusta a su duración.` : 'Va sobre otra canción: el guion se ajusta a su duración.'),
        'animate-unsupported': (d) => `El servidor no admite parámetros animados: la animación se crea sin los fotogramas clave de ${d}, y solo si lo confirmas.`,
        'layers-unsupported': (d) => `El servidor no admite capas: la animación se crea sin ${d}, y solo si lo confirmas.`,
      },
      songLabel: 'Canción de la animación',
      songOfFile: (title, found) => (found ? `La del fichero: ${title}` : `La del fichero: ${title} (no está en la biblioteca)`),
      songHint: 'Si eliges otra, el guion se ajusta a su duración; la letra y los golpes de palabra de la canción original no se llevan.',
      openAnimation: 'Abrir la animación',
      nothingToDo: 'No hay nada que crear ni guardar.',
      approvalNote: 'Las partes se crean como borradores, que apruebas tú en Partes: la importación no aprueba nada.',
      dropAnimate: 'Crear la animación sin lo que este servidor no admite (fotogramas clave o capas)',
      assistantNote: 'Escribir un borrador pide una respuesta al asistente y puede tardar.',
      askAssistant: 'Pedir al asistente que la escriba',
      asked: 'Pedida: está en Partes como borrador.',
      askFailed: 'No se pudo pedir:',
      confirm: 'Importar',
      cancel: 'Cancelar',
      running: 'Importando… las referencias tardan unos segundos en analizarse.',
      stop: 'Parar',
      states: { created: 'Creado', exists: 'Ya estaba', 'kept-local': 'Guardado en el navegador', failed: 'Falló', skipped: 'Sin hacer' },
      pending: 'Esperando',
      doneTitle: 'Importación terminada',
      done: (c) => `${c.created} creados, ${c.exists} ya estaban, ${c['kept-local']} guardados en el navegador, ${c.failed} fallaron y ${c.skipped} sin hacer.`,
      another: 'Importar otro fichero',
      notDurable: 'El navegador no deja guardar: los estilos guardados aquí se perderán al cerrar la página.',
    },
  },
  parts: {
    title: 'Partes',
    intro: 'Pide una parte nueva: el asistente la escribe a partir de una frase y, si quieres, de una imagen. Hasta que la apruebes no está en el catálogo.',
    empty: 'Aún no hay borradores. Pide una parte con una frase.',
    ask: 'Pedir una parte',
    pictureNone: 'Sin imagen',
    pictureFrame: 'Un fotograma de una referencia',
    pictureFile: 'Una imagen mía',
    noPictureNote: 'Sin imagen, la parte se escribe solo con la frase.',
    ageWarning: 'Con una imagen se mira la edad de las personas que salgan: si hay un menor, o no se puede confirmar la edad, el borrador falla y la imagen no se conserva.',
    chooseReference: 'Referencia',
    noReferences: 'No hay referencias listas con fotogramas.',
    frame: 'Fotograma',
    chooseFile: 'Elige una imagen (png, jpg o webp, hasta 20 MB)',
    noFile: 'Ningún fichero',
    clearFile: 'Quitar el fichero',
    askAction: 'Pedir la parte',
    pictureNeeded: 'Elige una imagen válida o cambia a «Sin imagen».',
    asking: 'Pidiendo…',
    states: { writing: 'Escribiéndose', ready: 'Lista', failed: 'Falló' },
    open: 'Abrir',
    remove: 'Borrar',
    removeTitle: 'Borrar el borrador',
    removeMessage: 'se borra con sus ficheros. Si se está escribiendo, el trabajo se detiene.',
    removeAction: 'Borrar',
    back: 'Partes',
    writingNote: 'El asistente la está escribiendo: tarda de medio minuto a más de un minuto.',
    picture: 'Imagen',
    sourceUpload: 'Una imagen subida',
    sourceReference: 'El fotograma {frame} de la referencia {id}',
    seen: 'Lo que vio el modelo de visión:',
    attempts: 'Intentos: {n}',
    preview: 'Vista previa',
    problems: 'Lo que falló en el último intento:',
    failedReason: 'No se pudo escribir:',
    pictureLost: 'La imagen no se conservó, así que no se puede reintentar: pide la parte otra vez.',
    edit: 'Texto de la parte',
    save: 'Guardar texto',
    saving: 'Guardando…',
    saved: 'Texto guardado: la vista previa se ha dibujado otra vez.',
    retry: 'Reintentar',
    retrying: 'Reintentando…',
    approve: 'Aprobar la parte',
    approving: 'Aprobando…',
    approveTitle: 'Aprobar la parte',
    approveMessage: 'pasa al catálogo y se conserva en tu carpeta de partes. El borrador se borra.',
    approveAction: 'Aprobar',
    approved: 'Parte añadida al catálogo:',
    parameters: 'Parámetros',
    noParameters: 'Sin parámetros.',
    nameTaken: 'Ya hay una parte con ese nombre: cámbialo editando el texto del borrador (el nombre está en manifest.json).',
    loadFailed: 'No se pudo leer el borrador.',
    missing: 'Ese borrador ya no existe.',
    name: 'Nombre',
    fromText: 'Parte hecha a mano',
    mineTitle: 'Tus partes',
    mineIntro: 'Las partes que has aprobado. Puedes cambiar su texto o borrarlas; las que vienen con el programa no se tocan.',
    mineEmpty: 'Aún no tienes ninguna parte aprobada.',
    mineEdit: 'Editar',
    mineRemove: 'Borrar',
    newFromScratch: 'Nueva parte desde cero',
    newTitle: 'Nueva parte desde cero',
    newIntro: 'Escribe tú el manifest.json y el part.html, sin asistente. Parte de una plantilla que funciona: cambia el nombre (no puede repetirse) y lo demás. Se guarda como borrador: lo ves, lo cambias y lo apruebas igual que uno pedido con una frase.',
    newCreate: 'Crear el borrador',
    newCreating: 'Creando…',
    ownTitle: 'Editar la parte',
    ownIntro: 'Cambia el texto de una parte aprobada. Se comprueba como al aprobarla y, si no pasa, no cambia nada. El nombre no se puede cambiar.',
    ownBuiltin: 'Esta parte viene con el programa: no se puede cambiar.',
    ownMissing: 'Esa parte ya no existe.',
    ownLoadFailed: 'No se pudo leer la parte.',
    ownSave: 'Guardar la parte',
    ownSaved: 'Parte guardada: el catálogo ya tiene el cambio.',
    removePartTitle: 'Borrar la parte',
    removePartMessage: 'se borra de tu carpeta de partes y deja el catálogo.',
    removePartAction: 'Borrar',
    forceTitle: 'La parte está en uso',
    forceMessage: 'Si la borras igualmente, las piezas y estilos que la usan se quedan sin ella y dejan de ser válidos hasta que les des otra parte.',
    forceAction: 'Borrar igualmente',
    previewButton: 'Previsualizar',
    previewPause: 'Pausar',
    previewResume: 'Seguir',
    previewFailed: 'No se puede previsualizar:',
    previewFrame: 'Vista previa de la parte en movimiento',
    askChangeTitle: 'Pedir un cambio',
    askChangeHint: 'El asistente cambia el texto que tienes arriba (guardado o no) según tu instrucción y deja el resultado como un borrador nuevo: el original no se toca.',
    askChangeAction: 'Pedir el cambio',
    askChangeBusy: 'Pidiendo…',
    replace: 'Reemplazar la parte',
    replacing: 'Reemplazando…',
    replaceTitle: 'Reemplazar la parte',
    replaceMessage: 'se guarda sobre la parte aprobada que tiene ese nombre y el borrador se borra.',
    replaceAction: 'Reemplazar',
    replaced: 'Parte reemplazada:',
    previewNote: 'Aproximada: solo la parte visual, en un bucle de 8 segundos con un compás fijo y sin canción. Las imágenes del servidor son la referencia.',
  },
  piece: {
    missing: 'Esa pieza ya no existe.',
    loadFailed: 'No se pudo leer la pieza.',
    drawing: 'La pieza se está dibujando: no se puede cambiar hasta que acabe.',
    createdNotice: 'La pieza se creó con los tiempos de las palabras estimados.',
    presetOrigin: 'Partió del estilo:',
    ownOrigin: 'Partió de un estilo propio de este navegador:',
    promptFailed: 'La pieza se hizo, pero no se pudo pedir al asistente el diseño y el guion:',
    presetGone: 'Partió de un estilo que ya se ha borrado.',
    tabs: 'Dibujar y proponer',
  },
  design: {
    title: 'Diseño',
    save: 'Guardar diseño',
    saving: 'Guardando…',
    saved: 'Diseño guardado.',
    modeOf: 'Modo de la sección',
    modes: { dark: 'Oscuro', light: 'Claro' },
    origin: { assistant: 'Propuesto por el asistente', fallback: 'Propuesto por la regla fija', user: 'Editado por ti' },
    swatches: 'Colores del diseño',
    verseStyles: { plain: 'Normal: las palabras aparecen y la clave va en el acento', highlight: 'Resaltado: la palabra que se canta lleva un fondo y se queda marcada', karaoke: 'Karaoke: las palabras ya cantadas pasan al acento', glow: 'Brillo suave: cada palabra con un resplandor y un halo, sin fondo' },
    hitStyles: { plain: 'Normal', metal: 'Metal: letras metálicas con un brillo que las cruza', glow: 'Brillo: letras en el acento con luz alrededor' },
    concept: 'Concepto',
    conceptPlaceholder: 'La idea visual a la que vuelve cada escena',
    conceptCount: (n, max) => `${n} de ${max} caracteres`,
  },
  render: {
    title: 'Dibujar',
    forecast: 'Previsión de lo que tarda: {time}',
    forecastNote: 'Es una previsión, no una promesa: se corrige con lo que tardaron los dibujos anteriores en esa máquina.',
    draw: 'Dibujar la pieza',
    again: 'Dibujar otra vez',
    working: 'Empezando…',
    progress: 'Progreso',
    video: 'El vídeo de la pieza',
    download: 'Descargar el vídeo',
    failed: 'No se pudo dibujar:',
    finishedTitle: 'Pieza hecha',
    failedTitle: 'La pieza falló',
    finishedBody: '{title} ya está dibujada.',
    failedBody: '{title} no se pudo dibujar.',
  },
  propose: {
    title: 'Proponer con el asistente',
    design: 'Proponer diseño',
    script: 'Proponer guion',
    working: 'Pensando…',
    confirmTitle: 'Sustituir lo que hay',
    confirmDesign: 'La propuesta sustituye el diseño actual.',
    confirmDesignEdited: 'Este diseño lo has editado tú: la propuesta lo sustituye igualmente.',
    confirmScript: 'La propuesta sustituye el guion actual, también lo que hayas cambiado y no hayas guardado.',
    action: 'Proponer',
    done: { design: 'Diseño propuesto.', script: 'Guion propuesto.' },
    source: { assistant: 'Lo propuso el asistente.', fallback: 'Salió de la regla fija (no hay asistente o no dio una respuesta que valiera). No es un error.' },
    replaced: 'Partes que el nivel no admite y se cambiaron por otras más sencillas:',
    replacedItem: '{piece}: {from} → {to}',
    both: 'Proponer diseño y guion',
    confirmBoth: 'La propuesta sustituye el diseño y el guion actuales, también lo que hayas editado. Se escribe en segundo plano y puede tardar.',
    model: 'Modelo del asistente',
    modelDefault: (name) => `El del servidor (${name})`,
    modelNoFit: 'no cabe ahora en la memoria',
    promptHint: 'El asistente lo lee para el diseño y para el guion. Al proponer sustituye al texto que guarda la pieza.',
    counter: (n, max) => `${n} de ${max} caracteres`,
    proposingNote: 'Hay una propuesta escribiéndose: mientras dure no se puede editar la pieza ni pedir otra.',
    modelUsed: (name) => `Modelo: ${name}`,
    reason: (why) => `Por qué no el asistente: ${why}`,
  },
  proposal: {
    title: 'Propuesta del asistente',
    states: {
      waiting: 'Esperando a que acabe una ejecución para poder escribir (hasta 15 minutos).',
      writing: 'El asistente está escribiendo el diseño y el guion…',
      done: 'Propuesta terminada.',
      failed: 'La propuesta falló.',
    },
    model: (name) => `Modelo: ${name}`,
    elapsed: (time) => `Lleva ${time}`,
    design: 'Diseño',
    script: 'Guion',
    assistant: 'lo escribió el asistente',
    rule: (reason) => `lo escribió la regla fija. ${reason}`,
    ruleNoReason: 'lo escribió la regla fija (no es un error).',
    error: (why) => `Motivo: ${why}`,
  },
  songMap: {
    title: 'Mapa de la canción',
    tempo: '{bpm} pulsos por minuto',
    estimated: 'Los tiempos de las palabras son una estimación: el servidor repartió la letra por sus secciones.',
    heard: 'Los tiempos de las palabras se oyeron en la canción.',
    legend: 'Secciones, pulsos, palabras y volumen de la canción, en el tiempo.',
    summary: '{sections} secciones · {beats} pulsos · {words} palabras',
    sync: 'Sincronizar las palabras con la voz',
    syncing: 'Escuchando…',
    syncWait: 'El servidor está escuchando la canción. Tarda cerca de un tercio de lo que dura (unos {time}).',
    syncDone: 'Palabras sincronizadas: los tiempos se oyeron en la canción.',
    syncNotice: 'No se oyeron las palabras:',
    syncWarning: 'Se conservó tu guion y puede necesitar ajuste a las secciones nuevas:',
  },
  stage: {
    title: 'Escenario',
    hint: 'Los personajes y el fondo salen de la biblioteca del servidor. x, y y tamaño son porcentajes del cuadro.',
    background: 'Fondo',
    character: 'Personaje',
    pose: 'Pose',
    expression: 'Expresión',
    action: 'Acción',
    x: 'x (%)',
    y: 'y (%)',
    size: 'Tamaño (%)',
    add: 'Añadir personaje',
    remove: 'Quitar personaje',
    none: '(ninguno)',
    empty: 'Esta pieza no tiene personajes.',
  },
  script: {
    title: 'Guion',
    hint: 'Las piezas del guion cubren la canción sin huecos: al mover un corte se mueve el de la pieza vecina.',
    save: 'Guardar guion',
    saving: 'Guardando…',
    saved: 'Guion guardado.',
    discard: 'Descartar cambios',
    piece: 'Pieza',
    part: 'Parte',
    mode: 'Modo',
    start: 'Empieza (s)',
    end: 'Acaba (s)',
    keyword: 'Palabra clave',
    none: '(ninguna)',
    hitWord: 'Golpe de palabra',
    hitAt: 'Entra en (s)',
    hitLength: 'Dura (s)',
    aboveLevel: '(pide más nivel)',
    covers: 'Las piezas cubren toda la canción.',
    showOnMap: 'Ver en el mapa',
    extras: 'Partes extra',
    extrasHint: 'Se dibujan junto a la principal, encima y en este orden: hasta tres, sin repetir ninguna parte de la pieza.',
    extraPart: 'Parte extra',
    addExtra: 'Añadir una parte extra',
    removeExtra: 'Quitar',
    pieceDesign: 'Diseño de esta pieza',
    pieceDesignHint: 'Lo que pongas sustituye al diseño de la canción solo en esta pieza; lo que dejes vacío sigue siendo el de la canción.',
    giveDesign: 'Darle un diseño propio',
    backToSong: 'Volver al diseño de la canción',
    songValue: 'La canción: {value}',
  },
};

const en: Texts = {
  title: 'Video Anim',
  nav: { new: 'New animation', songs: 'Songs', pieces: 'Pieces', references: 'References', presets: 'Styles', parts: 'Parts', datasets: 'Datasets' },
  links: { editInMotionEdit: 'Edit in Motion Edit', vectorCatalog: 'Vector parts', openInVector: 'Open in Vector' },
  language: 'Language',
  loading: 'Loading…',
  retry: 'Retry',
  back: 'Back',
  cancel: 'Cancel',
  failure: {
    refused: 'The server does not accept it:',
    busy: 'The piece is being drawn:',
    unavailable: 'The server cannot draw now:',
    missing: 'It is no longer there:',
    other: 'Could not reach the server:',
  },
  songs: {
    title: 'Songs',
    intro: 'Pick a song from the library to make an animated piece that follows it.',
    empty: 'The library has no songs.',
    emptyHint: 'Songs are made in a music dashboard; here they are only read.',
    loadFailed: 'The library could not be read.',
    version: 'Version',
    versionOf: 'Version {n}',
    instrumental: 'instrumental',
    animate: 'Animate',
    listen: 'Listen',
  },
  newPiece: {
    title: 'New piece',
    song: 'Song',
    songMissing: 'That song is no longer in the library.',
    create: 'Create piece',
    creating: 'Creating…',
    styles: { typographic: 'Typographic', illustrated: 'Illustrated' },
    levels: { simple: 'Simple', medium: 'Medium', advanced: 'Advanced' },
    slowNote: 'The advanced level at 60 fps is slow to draw: you will see the forecast before drawing.',
    noPreset: '(none)',
    inBrowser: 'in this browser',
  },
  pieces: {
    title: 'Pieces',
    intro: 'The animated pieces you have made, newest first.',
    empty: 'There are no pieces yet.',
    emptyHint: 'Pick a song and press Animate.',
    states: { draft: 'Draft', queued: 'Queued', running: 'Drawing', done: 'Done', failed: 'Failed' },
    open: 'Open',
    remove: 'Delete',
    removeTitle: 'Delete the piece',
    removeMessage: 'The piece is deleted with its files and its history. This cannot be undone.',
    removeAction: 'Delete',
    progress: 'Progress',
    spec: '{style} · {level} · {fps} fps · {size}',
    size: 'Size',
    forecast: 'Forecast: {time}',
    exampleLoad: 'Load example',
    exampleHint: 'Demonstration data with a real video, to see what the screens show, or a file of your own in that format. Nothing is sent to a server. The dataset of your work, to take it out of a server or bring it in, is on Datasets.',
    exampleLoaded: 'Example loaded: its songs, pieces, references, styles and parts are in their screens.',
    importLabel: 'Import demonstration dataset',
    imported: 'Dataset imported: its songs, pieces, references, styles and parts are in their screens.',
    importUnreadable: 'The file could not be read: it is not JSON.',
    importTooBig: 'The file is too large: 1 MB at most.',
    importRefused: 'Nothing was loaded. The file has these problems:',
    importMore: 'and {n} more',
    exportDataset: 'Export dataset',
    exportedDataset: (file) => `The animation's dataset was saved as ${file}.`,
    exportFailed: 'Could not export the dataset:',
  },
  references: {
    title: 'References',
    intro: 'Videos you give as an example of a good piece. The server does not keep the video: only its key frames and what it reads from it.',
    empty: 'There are no references yet. Add one with the address of a YouTube video or with a file.',
    add: 'Add a reference',
    chooseFile: 'Or choose a video',
    noFile: 'No file',
    clearFile: 'Remove the file',
    addAction: 'Add reference',
    adding: 'Adding…',
    sourceNeeded: 'Write a YouTube address or choose a video, but not both.',
    analysingNote: 'The server is analysing it: it takes some seconds.',
    states: { analysing: 'Analysing', ready: 'Ready', failed: 'Failed' },
    open: 'Open',
    remove: 'Delete',
    removeTitle: 'Delete the reference',
    removeMessage: 'is deleted with its key frames. If it is being analysed, the analysis stops. The styles made from it are kept.',
    removeAction: 'Delete',
    back: 'References',
    edit: 'Details of the reference',
    save: 'Save',
    saving: 'Saving…',
    saved: 'Saved.',
    frames: 'Key frames',
    colours: 'Dominant colours',
    third: 'Third {n}',
    cuts: 'Cuts',
    meanShot: 'Mean shot',
    tempo: 'Tempo',
    key: 'Key',
    size: 'Size',
    duration: 'Duration',
    description: 'What it looks like',
    noDescription: 'No description:',
    failedReason: 'It could not be analysed:',
    makePreset: 'Make a style from it',
    makingPreset: 'Making the style…',
    presetMade: 'Style made:',
    adjustments: 'What had to be adjusted of the video\'s colours:',
    notReady: 'A style can only be made from a ready reference.',
    loadFailed: 'The reference could not be read.',
    missing: 'That reference no longer exists.',
    tags: 'Tags',
    source: 'Source',
    uploaded: 'Uploaded video',
    taught: (s, p) => `Taught ${s === 1 ? '1 style' : `${s} styles`} and ${p === 1 ? '1 part' : `${p} parts`}`,
    learn: {
      title: 'Learn from this reference',
      intro: 'The server looks at the reference and proposes one style and up to three parts that differ from what already exists; what is too similar it drops, and says so. It can take some minutes and can be left: it goes on in the server.',
      nothingEnters: 'Nothing enters the catalog by itself: styles are edited in Styles and parts are drafts approved in Parts.',
      strictness: 'Strictness',
      strictnesses: { low: 'Low: accepts what is similar', normal: 'Normal', high: 'High: only what is very different' },
      action: 'Learn',
      again: 'Learn again',
      starting: 'Starting…',
      notReady: 'Only a ready reference can be learned from.',
      running: 'Learning…',
      runningNote: 'The server is learning from the reference. You can leave this page: it goes on in the server and will be in the history.',
      failed: 'It could not learn:',
      styles: 'Styles it kept',
      parts: 'Parts it proposed (drafts)',
      none: 'None',
      novel: 'Different from what exists',
      similar: 'Similar to',
      kinds: { style: 'the style', part: 'the part', draft: 'the draft' },
      distance: 'distance',
      states: { ready: 'Ready', writing: 'Being written', failed: 'Failed', gone: 'No longer exists' },
      gone: 'It was deleted, or approved and is now in the catalog.',
      openStyle: 'Open the style',
      openPart: 'Open the draft',
      discarded: 'What it dropped for being too similar',
      discardedNone: 'It dropped nothing.',
      skipped: 'What it could not do',
      skippedNone: 'It could do everything.',
      strictnessUsed: 'Strictness used',
      history: 'Earlier learnings',
      historyEmpty: 'Nothing has been learned from this reference yet.',
      open: 'View',
      current: 'Now',
      when: 'Started',
      summary: (s, p, d) => `${s} styles, ${p} parts and ${d} dropped`,
    },
  },
  presets: {
    title: 'Styles',
    intro: 'A style is a design, a rhythm and some parts taken from a reference. A piece can start from one.',
    empty: 'There are no styles yet.',
    emptyHint: 'They are made from a ready reference:',
    open: 'Edit',
    remove: 'Delete',
    removeTitle: 'Delete the style',
    removeMessage: 'is deleted. The pieces that started from it do not change.',
    removeAction: 'Delete',
    back: 'Styles',
    rhythm: 'Rhythm',
    parts: 'Parts',
    allParts: 'All the usual ones',
    fromReference: 'From the reference',
    referenceGone: 'Its reference no longer exists',
    newStyle: 'New style',
    ownTitle: 'Kept in this browser',
    ownIntro: 'They are not on the server: they go in the export and can be chosen when a piece is made. To take one to the server, open it and choose a ready reference.',
    ownBadge: 'In this browser',
    ownEdit: 'Open',
    adjustments: 'What had to be adjusted of the video\'s colours:',
    save: 'Save style',
    saving: 'Saving…',
    saved: 'Style saved.',
    loadFailed: 'The style could not be read.',
    missing: 'That style no longer exists.',
    design: 'Design of the style',
  },
  newAnimation: {
    title: 'New animation',
    intro: 'Say what you want, choose the look (it comes from a reference: one you already have or a YouTube video), the song and how it is drawn.',
    steps: { look: 'Idea and look', song: 'Song', options: 'Options' },
    stepOf: (n, total) => `Step ${n} of ${total}`,
    next: 'Next',
    back: 'Back',
    look: {
      title: 'Look',
      intro: 'Choose a reference that is already analysed or paste the address of a YouTube video: the style of the piece comes from it. You can also start from a style, or from none.',
      none: 'No look',
      noneHint: 'The piece starts from the fixed rule, with no style.',
      referencesTitle: 'References',
      noReferences: 'There are no references yet. Paste a YouTube address to add the first one.',
      stylesTitle: 'Or start from a style',
      noStyles: 'There are no saved styles.',
      addressTitle: 'A YouTube video',
      addressHint: 'It is added as a reference and analysed in a few seconds; you do not have to leave this page.',
      add: 'Add',
      adding: 'Adding…',
      added: 'Added: it is being analysed.',
      analysing: 'Analysing…',
      failed: 'Failed',
      chosen: (name) => `Look chosen: ${name}`,
      willMake: 'When the animation is made, a style is made from this reference, or the one it already has is used.',
      refused: 'Could not add it:',
      ownBadge: 'in this browser',
      tags: 'Tags',
    },
    song: {
      title: 'Song',
      intro: 'Choose the song of the library that the animation will follow.',
      chosen: 'Song chosen',
      none: 'No song chosen.',
      empty: 'The library has no songs.',
      emptyHint: 'Songs are made in a music panel; here they are only read.',
      loadFailed: 'The library could not be read.',
      change: 'Change',
    },
    options: {
      title: 'Options',
      look: 'Look',
      song: 'Song',
      noLook: 'none',
      text: 'Text',
      noText: 'none',
      assistant: 'Assistant',
      routing: 'as the server routes it',
      summary: 'Your animation',
      nextTitle: 'What happens when you create it',
      next: ['The piece is created with the song, the look and your text, and the design is saved.', 'The assistant writes the script in the background; with no assistant the fixed rule writes it, and it does not read the text.', "You go to the piece's page and see it advance. There you can review it, edit it in Motion Edit and draw it."],
    },
    making: "Making the reference's style…",
    referenceStyle: 'Style of',
    prompt: {
      title: 'Describe your animation',
      intro: 'Say it in your own words, as in the other panels: the assistant of the server writes the design and the script from your text. It is optional: with no text, the animation is made as always.',
      hint: "It is kept with the piece (up to 2000 characters) and the assistant reads it when it writes the design and the script, in the background: you go to the piece's page and see it advance. If the server has no assistant, the fixed rule writes them, and it does not read the text.",
      counter: (n, max) => `${n} of ${max} characters`,
      ownNote: 'With an own style the design and the script come from the style: your text is only kept with the piece.',
    },
    progress: {
      creating: 'Creating the piece…',
      design: 'Saving the design…',
      script: 'Asking the assistant for the script…',
      elapsed: (n) => `${n} s so far`,
      keepOpen: 'Do not close this page: the piece opens when it is done.',
      created: 'The piece is already on Pieces; if you close this page it may be left without your text and without the assistant\'s script.',
    },
  },
  styleBuilder: {
    title: 'New style',
    editTitle: 'Own style',
    intro: "Make a style from scratch: pick the catalog's parts, the design and the rhythm. When it is used for a piece, the script goes through those parts one after another.",
    back: 'Styles',
    keepTitle: 'Where to keep it',
    keepBrowser: 'In this browser',
    keepHint: 'The server only makes styles from a ready reference. Without one, the style stays in this browser and goes in the export; with one, it is saved on the server.',
    keepServer: (name) => `On the server, starting from "${name}"`,
    noReady: 'There are no ready references: it will be kept in this browser.',
    save: 'Save style',
    saving: 'Saving…',
    savedBrowser: 'Saved in this browser.',
    savedServer: 'Saved on the server.',
    movedServer: 'Saved on the server; the copy in this browser was removed.',
    refused: 'The server did not save it:',
    missing: 'That style is not in this browser.',
    browserNote: 'The browser does not let anything be saved: this style will be lost when the page is closed.',
    picker: {
      title: 'Parts',
      search: 'Search parts',
      level: 'Level',
      anyLevel: 'Any',
      levels: { simple: 'Simple', medium: 'Medium', advanced: 'Advanced' },
      available: 'Catalog',
      chosen: 'Chosen, in this order',
      none: 'No part chosen: the style would use all the usual ones.',
      noMatch: 'No part matches.',
      add: 'Add',
      remove: 'Remove',
      up: 'Up',
      down: 'Down',
      count: (n, max) => `${n} of ${max}`,
      full: (max) => `A style has at most ${max} parts.`,
      unsupported: (level) => `It is not drawn at the ${level} level.`,
      cost: (ms) => `${ms} ms per frame`,
      manual: 'Only when the script names it',
      unknown: 'It is no longer in the catalog',
    },
  },
  datasets: {
    title: 'Datasets',
    intro: "Take one animation out of this server, or bring one in from another: its design and script (no video), the style it started from and the own parts it uses. The file is the dataset of one animation, not the project dataset of the full dashboard.",
    export: {
      title: 'Export',
      intro: 'A dataset is the dataset of one animation: choose the one you want to take out of this server. The file carries its design, its script, the style it started from and the own parts it uses; never the video.',
      partsNote: 'A part you approved earlier cannot be read back from the server: it goes with its description and parameters only, marked as having no text.',
      empty: 'There are no animations to export yet.',
      loading: 'Loading the animations…',
      action: 'Export',
      working: 'Exporting…',
      exported: (title, file) => `Saved ${file}: the animation "${title}".`,
      failed: 'Could not export:',
    },
    import: {
      title: 'Import',
      intro: 'Choose the dataset file of one animation. Before anything is created you will see a report of what would happen to the song, the reference, the style, the parts and the animation; and you can put it on another song of the library.',
      chooseFile: 'Choose a file',
      noFile: 'No file chosen',
      limit: 'Up to 5 MB.',
      reading: 'Reading the file…',
      unreadable: 'The file could not be read as JSON.',
      tooBig: 'The file is larger than 5 MB.',
      problemsTitle: 'The file is not valid and nothing was created:',
      reportTitle: 'Import report',
      summary: (c) => `${c.create} to create, ${c['keep-local']} to keep in this browser, ${c.exists} already there and ${c.impossible} that cannot be done.`,
      columns: { kind: 'Kind', item: 'Item', action: 'What will happen', why: 'Why' },
      kinds: { song: 'Song', reference: 'Reference', style: 'Style', part: 'Part', animation: 'Animation' },
      actions: { create: 'Will be created', exists: 'Already there', 'keep-local': 'Kept in the browser', impossible: 'Cannot be done' },
      reasons: {
        'no-address': () => 'It was uploaded as a video and has no address: it cannot be made again.',
        'song-missing': (d) => `The song "${d}" is not in the library.`,
        'parts-missing': (d) => `It uses parts the catalog does not have yet: ${d}. Approve the drafts the file brings on Parts and import again.`,
        'no-ready-reference': () => 'The server does not make a style without a ready reference.',
        'part-no-text': () => 'The catalog does not have it and the file brings no text for it.',
        'draft-invalid': () => 'Its manifest is not JSON that names the part.',
        fitted: (d) => (d ? `It goes on another song of the library: the script of "${d}" is fitted to its length.` : 'It goes on another song: the script is fitted to its length.'),
        'animate-unsupported': (d) => `The server does not take animated parameters: the animation is made without the keyframes of ${d}, and only if you confirm it.`,
        'layers-unsupported': (d) => `The server does not take layers: the animation is made without ${d}, and only if you confirm it.`,
      },
      songLabel: 'Song of the animation',
      songOfFile: (title, found) => (found ? `The file's: ${title}` : `The file's: ${title} (not in the library)`),
      songHint: 'If you pick another, the script is fitted to its length; the lyrics and word hits of the original song do not come along.',
      openAnimation: 'Open the animation',
      nothingToDo: 'There is nothing to create or keep.',
      approvalNote: 'Parts are made as drafts, which you approve on Parts: importing approves nothing.',
      dropAnimate: 'Make the animation without what this server does not take (keyframes or layers)',
      assistantNote: 'Writing a draft asks the assistant and can take a while.',
      askAssistant: 'Ask the assistant to write it',
      asked: 'Asked: it is on Parts as a draft.',
      askFailed: 'Could not ask:',
      confirm: 'Import',
      cancel: 'Cancel',
      running: 'Importing… references take a few seconds to be analysed.',
      stop: 'Stop',
      states: { created: 'Created', exists: 'Already there', 'kept-local': 'Kept in the browser', failed: 'Failed', skipped: 'Not done' },
      pending: 'Waiting',
      doneTitle: 'Import finished',
      done: (c) => `${c.created} created, ${c.exists} already there, ${c['kept-local']} kept in the browser, ${c.failed} failed and ${c.skipped} not done.`,
      another: 'Import another file',
      notDurable: 'The browser does not let anything be saved: the styles kept here will be lost when the page is closed.',
    },
  },
  parts: {
    title: 'Parts',
    intro: 'Ask for a new part: the assistant writes it from a phrase and, if you wish, a picture. It is not in the catalog until you approve it.',
    empty: 'There are no drafts yet. Ask for a part with a phrase.',
    ask: 'Ask for a part',
    pictureNone: 'No picture',
    pictureFrame: 'A key frame of a reference',
    pictureFile: 'A picture of mine',
    noPictureNote: 'Without a picture, the part is written from the phrase alone.',
    ageWarning: 'With a picture, the age of the people in it is checked: if there is a minor, or the age cannot be confirmed, the draft fails and the picture is not kept.',
    chooseReference: 'Reference',
    noReferences: 'There are no ready references with key frames.',
    frame: 'Key frame',
    chooseFile: 'Choose a picture (png, jpg or webp, up to 20 MB)',
    noFile: 'No file',
    clearFile: 'Remove the file',
    askAction: 'Ask for the part',
    pictureNeeded: 'Choose a valid picture or switch to "No picture".',
    asking: 'Asking…',
    states: { writing: 'Being written', ready: 'Ready', failed: 'Failed' },
    open: 'Open',
    remove: 'Delete',
    removeTitle: 'Delete the draft',
    removeMessage: 'is deleted with its files. If it is being written, the work stops.',
    removeAction: 'Delete',
    back: 'Parts',
    writingNote: 'The assistant is writing it: it takes from half a minute to over a minute.',
    picture: 'Picture',
    sourceUpload: 'An uploaded picture',
    sourceReference: 'Frame {frame} of reference {id}',
    seen: 'What the vision model saw:',
    attempts: 'Attempts: {n}',
    preview: 'Preview',
    problems: 'What failed in the last attempt:',
    failedReason: 'It could not be written:',
    pictureLost: 'The picture was not kept, so it cannot be tried again: ask for the part again.',
    edit: 'Text of the part',
    save: 'Save text',
    saving: 'Saving…',
    saved: 'Text saved: the preview was drawn again.',
    retry: 'Try again',
    retrying: 'Trying again…',
    approve: 'Approve the part',
    approving: 'Approving…',
    approveTitle: 'Approve the part',
    approveMessage: 'goes to the catalog and is kept in your parts folder. The draft is deleted.',
    approveAction: 'Approve',
    approved: 'Part added to the catalog:',
    parameters: 'Parameters',
    noParameters: 'No parameters.',
    nameTaken: 'A part with that name already exists: change it by editing the text of the draft (the name is in manifest.json).',
    loadFailed: 'The draft could not be read.',
    missing: 'That draft no longer exists.',
    name: 'Name',
    fromText: 'A part made by hand',
    mineTitle: 'Your parts',
    mineIntro: 'The parts you have approved. You can change their text or delete them; the ones that come with the program are not touched.',
    mineEmpty: 'You have no approved parts yet.',
    mineEdit: 'Edit',
    mineRemove: 'Delete',
    newFromScratch: 'New part from scratch',
    newTitle: 'New part from scratch',
    newIntro: 'Write the manifest.json and the part.html yourself, with no assistant. It starts from a template that works: change the name (it cannot be repeated) and the rest. It is saved as a draft: you see it, change it and approve it like one asked for with a sentence.',
    newCreate: 'Create the draft',
    newCreating: 'Creating…',
    ownTitle: 'Edit the part',
    ownIntro: 'Change the text of an approved part. It is checked like an approval and, if it does not pass, nothing changes. The name cannot be changed.',
    ownBuiltin: 'This part comes with the program: it cannot be changed.',
    ownMissing: 'That part no longer exists.',
    ownLoadFailed: 'The part could not be read.',
    ownSave: 'Save the part',
    ownSaved: 'Part saved: the catalog has the change.',
    removePartTitle: 'Delete the part',
    removePartMessage: 'is deleted from your parts folder and leaves the catalog.',
    removePartAction: 'Delete',
    forceTitle: 'The part is in use',
    forceMessage: 'If you delete it anyway, the pieces and styles that use it are left without it and stop being valid until you give them another part.',
    forceAction: 'Delete anyway',
    previewButton: 'Preview',
    previewPause: 'Pause',
    previewResume: 'Resume',
    previewFailed: 'It cannot be previewed:',
    previewFrame: 'The part moving, previewed',
    askChangeTitle: 'Ask for a change',
    askChangeHint: 'The assistant changes the text above (saved or not) as you say and leaves the result as a new draft: the original is not touched.',
    askChangeAction: 'Ask for the change',
    askChangeBusy: 'Asking…',
    replace: 'Replace the part',
    replacing: 'Replacing…',
    replaceTitle: 'Replace the part',
    replaceMessage: 'is saved over the approved part with that name and the draft is deleted.',
    replaceAction: 'Replace',
    replaced: 'Part replaced:',
    previewNote: 'An approximation: only the visual part, on a looping 8-second clock with a steady beat and no song. The server\'s images are the reference.',
  },
  piece: {
    missing: 'That piece no longer exists.',
    loadFailed: 'The piece could not be read.',
    drawing: 'The piece is being drawn: it cannot be changed until it ends.',
    createdNotice: 'The piece was made with estimated word times.',
    presetOrigin: 'It started from the style:',
    ownOrigin: 'It started from an own style kept in this browser:',
    promptFailed: 'The piece was made, but the assistant could not be asked for the design and the script:',
    presetGone: 'It started from a style that has since been deleted.',
    tabs: 'Draw and propose',
  },
  design: {
    title: 'Design',
    save: 'Save design',
    saving: 'Saving…',
    saved: 'Design saved.',
    modeOf: 'Mode of the section',
    modes: { dark: 'Dark', light: 'Light' },
    origin: { assistant: 'Proposed by the assistant', fallback: 'Proposed by the fixed rule', user: 'Edited by you' },
    swatches: 'Colours of the design',
    verseStyles: { plain: 'Plain: the words appear and the key one takes the accent', highlight: 'Highlight: the word being sung gets a background and stays marked', karaoke: 'Karaoke: the words already sung turn to the accent', glow: 'Soft glow: each word with a glow and a halo, no background' },
    hitStyles: { plain: 'Plain', metal: 'Metal: metallic letters with a shine crossing them', glow: 'Glow: letters in the accent with light around them' },
    concept: 'Concept',
    conceptPlaceholder: 'The visual idea each scene comes back to',
    conceptCount: (n, max) => `${n} of ${max} characters`,
  },
  render: {
    title: 'Draw',
    forecast: 'Forecast of how long it takes: {time}',
    forecastNote: 'It is a forecast, not a promise: it is corrected by how long the earlier drawings took on that machine.',
    draw: 'Draw the piece',
    again: 'Draw again',
    working: 'Starting…',
    progress: 'Progress',
    video: 'The piece\'s video',
    download: 'Download the video',
    failed: 'It could not be drawn:',
    finishedTitle: 'Piece done',
    failedTitle: 'The piece failed',
    finishedBody: '{title} is drawn.',
    failedBody: '{title} could not be drawn.',
  },
  propose: {
    title: 'Propose with the assistant',
    design: 'Propose design',
    script: 'Propose script',
    working: 'Thinking…',
    confirmTitle: 'Replace what is there',
    confirmDesign: 'The proposal replaces the current design.',
    confirmDesignEdited: 'You edited this design: the proposal replaces it all the same.',
    confirmScript: 'The proposal replaces the current script, including what you changed and have not saved.',
    action: 'Propose',
    done: { design: 'Design proposed.', script: 'Script proposed.' },
    source: { assistant: 'The assistant proposed it.', fallback: 'It came from the fixed rule (there is no assistant, or it gave no answer that was valid). It is not an error.' },
    replaced: 'Parts the level does not support, replaced by simpler ones:',
    replacedItem: '{piece}: {from} → {to}',
    both: 'Propose design and script',
    confirmBoth: 'The proposal replaces the current design and script, also what you edited. It is written in the background and can take a while.',
    model: 'Assistant model',
    modelDefault: (name) => `The server's (${name})`,
    modelNoFit: 'does not fit the memory now',
    promptHint: 'The assistant reads it for the design and for the script. Proposing replaces the text the piece keeps.',
    counter: (n, max) => `${n} of ${max} characters`,
    proposingNote: 'A proposal is being written: until it ends the piece cannot be edited and another cannot be asked.',
    modelUsed: (name) => `Model: ${name}`,
    reason: (why) => `Why not the assistant: ${why}`,
  },
  proposal: {
    title: "The assistant's proposal",
    states: {
      waiting: 'Waiting for a run to end so it can write (up to 15 minutes).',
      writing: 'The assistant is writing the design and the script…',
      done: 'The proposal is done.',
      failed: 'The proposal failed.',
    },
    model: (name) => `Model: ${name}`,
    elapsed: (time) => `Running for ${time}`,
    design: 'Design',
    script: 'Script',
    assistant: 'written by the assistant',
    rule: (reason) => `written by the fixed rule. ${reason}`,
    ruleNoReason: 'written by the fixed rule (not an error).',
    error: (why) => `Reason: ${why}`,
  },
  songMap: {
    title: 'Song map',
    tempo: '{bpm} beats per minute',
    estimated: 'The word times are an estimate: the server spread the lyrics over their sections.',
    heard: 'The word times were heard in the song.',
    legend: 'The sections, beats, words and loudness of the song, over time.',
    summary: '{sections} sections · {beats} beats · {words} words',
    sync: 'Sync words with the voice',
    syncing: 'Listening…',
    syncWait: 'The server is listening to the song. It takes about a third of its length (around {time}).',
    syncDone: 'Words synced: the times were heard in the song.',
    syncNotice: 'The words were not heard:',
    syncWarning: 'Your script was kept and may need adjusting to the new sections:',
  },
  stage: {
    title: 'Stage',
    hint: 'The characters and the background come from the server\'s library. x, y and size are percentages of the frame.',
    background: 'Background',
    character: 'Character',
    pose: 'Pose',
    expression: 'Expression',
    action: 'Action',
    x: 'x (%)',
    y: 'y (%)',
    size: 'Size (%)',
    add: 'Add character',
    remove: 'Remove character',
    none: '(none)',
    empty: 'This piece has no characters.',
  },
  script: {
    title: 'Script',
    hint: 'The pieces of the script cover the song with no gap: moving a cut moves the one of the neighbouring piece.',
    save: 'Save script',
    saving: 'Saving…',
    saved: 'Script saved.',
    discard: 'Discard changes',
    piece: 'Piece',
    part: 'Part',
    mode: 'Mode',
    start: 'Starts (s)',
    end: 'Ends (s)',
    keyword: 'Keyword',
    none: '(none)',
    hitWord: 'Word hit',
    hitAt: 'Enters at (s)',
    hitLength: 'Lasts (s)',
    aboveLevel: '(needs a higher level)',
    covers: 'The pieces cover the whole song.',
    showOnMap: 'Show on the map',
    extras: 'Extra parts',
    extrasHint: 'They are drawn beside the main one, on top and in this order: up to three, none repeated from the piece.',
    extraPart: 'Extra part',
    addExtra: 'Add an extra part',
    removeExtra: 'Remove',
    pieceDesign: 'Design of this piece',
    pieceDesignHint: 'What you set replaces the song\'s design for this piece alone; what you leave empty stays the song\'s.',
    giveDesign: 'Give it a design of its own',
    backToSong: 'Back to the song\'s design',
    songValue: 'The song: {value}',
  },
};

const TEXTS: Record<Lang, Texts> = { es, en };

export const textsFor = (lang: Lang): Texts => TEXTS[lang];
