import type { Lang } from '@lab/forms-kit';

/** Every text the dashboard shows, in each language. Add a key here and TypeScript asks for both languages. */
export interface Texts {
  nav: { pieces: string; flow: string };
  flow: {
    title: string;
    intro: string;
    plan: {
      sentence: string;
      sentenceHint: string;
      /** How much of the sentence's room is used: `12 of 2000 characters`. */
      sentenceCount: (n: number, max: number) => string;
      make: string;
      making: string;
      planTitle: string;
      planHint: string;
      start: string;
      noModels: string;
      takesTime: string;
      warningsTitle: string;
      notUsed: (reason: string) => string;
      writeFailed: (reason: string) => string;
      serverDefault: string;
      invalidParts: (lines: string) => string;
      tooLong: (max: number) => string;
      generators: Record<'ace-step' | 'heartmula' | 'diffrhythm2', string>;
    };
    song: {
      title: string;
      checking: string;
      engineDown: (generator: string, reason: string) => string;
      startEngine: (generator: string) => string;
      starting: string;
      useOther: (generator: string) => string;
      sent: (generator: string, title: string, style: string) => string;
      queued: (position: number | undefined) => string;
      running: string;
      listen: string;
      length: (seconds: number) => string;
      regenerate: string;
      editTexts: string;
      applyAndRegenerate: string;
      cancelEdit: string;
      titleLabel: string;
      lyricsLabel: string;
      styleLabel: string;
      pickExisting: string;
      pickTitle: string;
      noLibrarySongs: string;
      pick: string;
      continue: string;
      waitingLibrary: (seconds: number) => string;
      lag: string;
      retry: string;
      failed: (reason: string) => string;
    };
    map: {
      title: string;
      making: string;
      sent: (title: string, style: string, level: string, fps: number, size: string) => string;
      summary: (seconds: number, bpm: number, sections: number, words: number) => string;
      estimated: string;
      heard: string;
      transcribe: string;
      transcribing: string;
      transcribeFailed: (reason: string) => string;
      auto: string;
      continue: string;
      failed: (reason: string) => string;
      retry: string;
    };
    bar: {
      label: (step: 'design' | 'script') => string;
      back: string;
      continue: string;
      saving: string;
      unsaved: string;
    };
    propose: {
      proposingDesign: string;
      proposingScript: string;
      sent: (prompt: string, model: string, provider: string) => string;
      byAssistant: (model: string) => string;
      byRule: (reason: string) => string;
      replacements: (n: number) => string;
      designSummary: (concept: string) => string;
      fonts: (display: string, body: string) => string;
      scriptSummary: (pieces: number, lines: number) => string;
      again: string;
      editInEditor: string;
      openScript: string;
      auto: string;
      continue: string;
      stale: string;
      keep: string;
      failed: (reason: string) => string;
      retry: string;
      busy: string;
      againTitle: string;
      againSubmit: string;
      againCancel: string;
      serverDefault: string;
    };
    parts: {
      sent: (count: number, model: string, provider: string) => string;
      writing: (name: string) => string;
      there: string;
      ready: string;
      failed: (reason: string) => string;
      approve: string;
      askAgain: string;
      askSubmit: string;
      askCancel: string;
      drop: string;
      approved: (name: string) => string;
      dropped: string;
      noPreview: string;
      suggest: string;
      backToScript: string;
      auto: string;
      continue: string;
      skip: string;
      retry: string;
      stepFailed: (reason: string) => string;
      problem: (reason: string) => string;
    };
    render: {
      estimate: (seconds: number, frames: number, fps: number, size: string) => string;
      estimateNote: string;
      draw: string;
      drawing: (percent: number) => string;
      queued: string;
      failed: (reason: string) => string;
      retry: string;
      video: string;
      continue: string;
      busy: string;
    };
    done: {
      title: string;
      video: string;
      noVideo: string;
      exportDataset: string;
      exported: (name: string) => string;
      exportFailed: (reason: string) => string;
      openPiece: string;
      newFlow: string;
      attempts: string;
      attemptSong: (title: string) => string;
      attemptPiece: (id: string) => string;
      open: string;
    };
    reason: {
      gone: string;
      goneNamed: (name: string) => string;
      interrupted: string;
      noResult: string;
    };
    page: {
      steps: Record<'plan' | 'song' | 'map' | 'design' | 'script' | 'parts' | 'render' | 'done', string>;
      status: Record<'pending' | 'running' | 'waiting' | 'done' | 'failed' | 'skipped' | 'stale', string>;
      back: string;
      line: {
        song: (title: string, seconds: number) => string;
        map: (seconds: number, bpm: number) => string;
        design: (author: string) => string;
        script: (author: string) => string;
        parts: (count: number) => string;
        render: string;
        skipped: string;
      };
      author: { assistant: string; rule: string };
      failedBanner: (step: string) => string;
      goBack: (step: string) => string;
      notFound: (id: string) => string;
      notFoundHint: string;
      toList: string;
      notice: { dropped: (n: number) => string; notKept: string };
      resuming: string;
    };
    list: {
      title: string;
      empty: string;
      resume: string;
      delete: string;
      deleteAsk: (prompt: string) => string;
      export: string;
      import: string;
      importBad: string;
      defaultsTitle: string;
      defaultsHint: string;
      defaults: Record<'map' | 'design' | 'parts', string>;
      updated: (when: string) => string;
      at: (step: string) => string;
      newTitle: string;
    };
  };
  loading: string;
  retry: string;
  unknownError: string;
  pieces: {
    title: string;
    intro: string;
    empty: string;
    emptyHint: string;
    open: string;
    song: string;
    created: string;
    loadExample: string;
    exampleLoaded: string;
    states: Record<'draft' | 'queued' | 'running' | 'done' | 'failed', string>;
    drawing: (percent: number) => string;
    format: (width: number, height: number, fps: number) => string;
  };
  importer: {
    open: string;
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
    summary: (c: Record<'create' | 'exists' | 'keep-local' | 'impossible', number>) => string;
    columns: { kind: string; item: string; action: string; why: string };
    kinds: Record<'song' | 'reference' | 'style' | 'part' | 'animation', string>;
    actions: Record<'create' | 'exists' | 'keep-local' | 'impossible', string>;
    reasons: Record<'no-address' | 'song-missing' | 'parts-missing' | 'no-ready-reference' | 'part-no-text' | 'draft-invalid' | 'fitted' | 'animate-unsupported' | 'layers-unsupported', (detail: string) => string>;
    songLabel: string;
    songOfFile: (title: string, found: boolean) => string;
    songHint: string;
    openAnimation: string;
    nothingToDo: string;
    approvalNote: string;
    dropAnimate: string;
    confirm: string;
    cancel: string;
    running: string;
    stop: string;
    states: Record<'created' | 'exists' | 'kept-local' | 'failed' | 'skipped', string>;
    pending: string;
    doneTitle: string;
    done: (c: Record<'created' | 'exists' | 'kept-local' | 'failed' | 'skipped', number>) => string;
    another: string;
    close: string;
  };
  newPart: {
    open: string;
    openHint: string;
    title: string;
    close: string;
    describe: string;
    request: string;
    requestHint: string;
    picture: string;
    pictureHint: string;
    clearPicture: string;
    ask: string;
    asking: string;
    drafts: string;
    draftsNone: string;
    reopen: string;
    states: { writing: string; ready: string; failed: string };
    attempts: (n: number) => string;
    writingNote: string;
    back: string;
    preview: string;
    manifest: string;
    fragment: string;
    template: string;
    save: string;
    saving: string;
    saved: string;
    problems: string;
    retry: string;
    approve: string;
    approving: string;
    approveWarning: string;
    approved: (name: string) => string;
    remove: string;
    removeAsk: string;
    guideTitle: string;
    guide: readonly string[];
    reason: string;
  };
  help: {
    title: string;
    close: string;
    open: string;
    groups: readonly { readonly name: string; readonly rows: readonly { readonly keys: string; readonly does: string }[] }[];
  };
  editor: {
    back: string;
    loading: string;
    previewProblem: (reason: string) => string;
    notFound: (id: string) => string;
    notFoundHint: string;
    loadFailed: string;
    drawing: (percent: number) => string;
    proposing: string;
    regions: { layers: string; library: string; preview: string; inspector: string; timeline: string };
    enlargePreview: string;
    closePreview: string;
  };
  code: {
    tabs: { label: string; visual: string; code: string; vector: string };
    pane: { label: string; loading: string; failed: string; retry: string };
    /** The status line above the code: how many errors it has, or that it maps. */
    status: { ok: string; errors: (n: number) => string; warnings: (n: number) => string };
    paused: string;
    goToCode: string;
    revert: string;
    revertAsk: string;
    replaced: string;
    saveWithErrors: string;
    hint: string;
  };
  vector: {
    /** Why the Vector tab is off, by cause. */
    off: { notVector: string; noBlock: string; loading: string };
    dirty: string;
    toolbar: string;
    save: string;
    saveAsNew: string;
    discard: string;
    discardAsk: string;
    help: string;
    /** A line above the editor: which part it is editing, or that it is a new one. */
    editing: (name: string) => string;
    creating: string;
    saved: (name: string) => string;
    open: string;
    openHint: string;
    notSvg: (file: string) => string;
    cannotOpen: (reason: string) => string;
    notVectorPart: (name: string) => string;
    replacesUses: (n: number) => string;
    leave: { title: string; text: (what: string) => string; save: string; discard: string; stay: string };
    helpRows: readonly { readonly keys: string; readonly does: string }[];
    helpTitle: string;
  };
  actions: {
    export: string;
    exporting: string;
    exported: (name: string) => string;
    exportFailed: string;
    render: string;
    rendering: string;
    estimate: (time: string, frames: number) => string;
    progress: (percent: number) => string;
    video: string;
    renderFailed: string;
    failedPiece: string;
  };
  editing: {
    undo: string;
    redo: string;
    save: string;
    saving: string;
    saved: string;
    unsaved: string;
    draftFound: (when: string) => string;
    draftChanges: (pieces: number, design: boolean, layers: boolean) => string;
    draftMoved: string;
    draftRestore: string;
    draftDismiss: string;
    discard: string;
    discardAsk: string;
    proposalAsk: string;
    leaveAsk: string;
    locked: string;
    refusedAt: (id: string) => string;
    refusedDesign: string;
    part: string;
    mode: string;
    modeAuto: (mode: string) => string;
    lines: string;
    lineText: string;
    lineStart: string;
    lineEnd: string;
    lineKeyword: string;
    noKeyword: string;
    removeLine: string;
    addFromSong: string;
    addFromSongNone: string;
    chooseLine: string;
    addFree: string;
    freeHint: string;
    hit: string;
    hitWord: string;
    hitNone: string;
    hitAt: string;
    hitLength: string;
    extras: string;
    addExtra: string;
    chooseExtra: string;
    removeExtra: string;
    extrasFull: string;
    extrasNone: string;
    stage: string;
    songDesign: string;
    ownDesign: string;
    noParts: string;
    split: string;
    splitHint: string;
    removePiece: string;
    removeExtraPart: string;
    removeText: string;
    removePieceHint: string;
    removeSlot: string;
    removeSlotHint: string;
    newText: string;
    tooShort: string;
    lastPiece: string;
    alreadyHas: (part: string) => string;
    noRoom: string;
    layersNotTaken: string;
    layersBlocked: string;
    removeAllLayers: string;
    textNotInLayer: string;
    nothingSelected: string;
  };
  inspector: {
    piece: (id: string) => string;
    extra: (n: number, part: string) => string;
    song: string;
    part: string;
    description: string;
    levels: string;
    replaced: (level: string) => string;
    notInCatalog: string;
    params: string;
    noParams: string;
    mode: string;
    modes: Record<'dark' | 'light', string>;
    modeFrom: Record<'piece' | 'section' | 'default', string>;
    lines: string;
    noLines: string;
    keyword: (word: string) => string;
    hit: string;
    noHit: string;
    hitLine: (word: string, at: number, length: number) => string;
    stage: string;
    noStage: string;
    background: string;
    character: (name: string, x: number, y: number, size: number, action: string) => string;
    ownDesign: string;
    sameDesign: string;
    design: { colours: string; dark: string; light: string; accent: string; fonts: string; display: string; body: string; modes: string; defaultMode: string; concept: string; verseStyle: string; hitStyle: string; none: string };
    animate: {
      title: string;
      animate: string;
      stop: string;
      removeAll: string;
      atPlayhead: (value: string) => string;
      keyframe: (n: number, time: string, value: string) => string;
      time: string;
      timeItem: string;
      value: string;
      ease: string;
      eases: Record<'linear' | 'in' | 'out' | 'in-out' | 'step', string>;
      removeKeyframe: string;
      why: string;
      unsupported: string;
      on: string;
      off: string;
    };
    item: {
      title: (layer: string, n: number) => string;
      part: string;
      from: string;
      to: string;
      length: (seconds: number) => string;
      heavy: (parts: number, most: number) => string;
      remove: string;
      removeLayer: string;
    };
    hint: string;
  };
}

const es: Texts = {
  nav: { pieces: 'Piezas', flow: 'Flujo guiado' },
  flow: {
    title: 'Flujo guiado',
    intro: 'De una frase a un vídeo, parando después de cada paso.',
    plan: {
      sentence: 'Tu frase',
      sentenceHint: 'Una frase con lo que quieres: la canción, la animación y, si quieres, las partes. No se crea nada hasta que pulses Empezar.',
      sentenceCount: (n, max) => `${n} de ${max} caracteres`,
      make: 'Preparar el plan',
      making: 'Escribiendo el plan…',
      planTitle: 'El plan',
      planHint: 'Edita lo que quieras. Nada se ha creado en el servidor todavía.',
      start: 'Empezar',
      noModels: 'El asistente no está disponible: el plan se puede empezar igualmente y las propuestas usarán las reglas fijas.',
      takesTime: 'El plan se escribe con dos llamadas al asistente: en una CPU puede tardar uno o dos minutos.',
      warningsTitle: 'El servidor avisa:',
      notUsed: (reason) => `No se usó el plan en una llamada (${reason}): el plan se hizo como siempre, con la canción escrita aparte y los valores de costumbre.`,
      writeFailed: (reason) => `El asistente no pudo escribir la canción (${reason}). Rellena los campos tú o empieza con ellos vacíos.`,
      serverDefault: 'El del servidor',
      invalidParts: (lines) => `Estas líneas de partes no valen (nombre en minúsculas, con guiones, sin repetir): ${lines}`,
      tooLong: (max) => `La frase puede tener hasta ${max} caracteres.`,
      generators: { 'ace-step': 'ACE-Step', heartmula: 'HeartMuLa', diffrhythm2: 'DiffRhythm2' },
    },
    song: {
      title: 'Canción',
      checking: 'Comprobando qué generadores se pueden usar…',
      engineDown: (generator, reason) => `${generator} no se puede usar ahora (${reason}).`,
      startEngine: (generator) => `Arrancar ${generator}`,
      starting: 'Arrancando… vuelve a comprobar en un momento.',
      useOther: (generator) => `Usar ${generator}`,
      sent: (generator, title, style) => `Enviado al servidor: «${title}» con ${generator}, estilo «${style}».`,
      queued: (position) => (position ? `En cola (puesto ${position})…` : 'En cola…'),
      running: 'Generando la canción…',
      listen: 'Escúchala',
      length: (seconds) => `${seconds} s`,
      regenerate: 'Regenerar',
      editTexts: 'Editar textos y regenerar',
      applyAndRegenerate: 'Regenerar con estos textos',
      cancelEdit: 'Cancelar',
      titleLabel: 'Título',
      lyricsLabel: 'Letra',
      styleLabel: 'Estilo',
      pickExisting: 'Elegir una canción que ya existe',
      pickTitle: 'Canciones de la biblioteca',
      noLibrarySongs: 'La biblioteca no tiene canciones todavía.',
      pick: 'Usar esta',
      continue: 'Continuar',
      waitingLibrary: (seconds) => `Esperando a que la biblioteca de animación liste la canción… ${seconds} s`,
      lag: 'La biblioteca todavía no lista la canción.',
      retry: 'Reintentar',
      failed: (reason) => `La canción no salió: ${reason}`,
    },
    map: {
      title: 'Mapa de la canción',
      making: 'Creando la pieza y su mapa de la canción…',
      sent: (title, style, level, fps, size) => `Enviado al servidor: pieza de «${title}», estilo ${style}, nivel ${level}, ${fps} fps, ${size}.`,
      summary: (seconds, bpm, sections, words) => `${seconds} s · ${bpm} bpm · ${sections} secciones · ${words} palabras`,
      estimated: 'Los tiempos de las palabras son una estimación (repartidas por las secciones).',
      heard: 'Los tiempos de las palabras se han oído en la canción.',
      transcribe: 'Transcribir (oír las palabras)',
      transcribing: 'Oyendo las palabras…',
      transcribeFailed: (reason) => `No se pudieron oír las palabras: ${reason}`,
      auto: 'No parar aquí',
      continue: 'Continuar',
      failed: (reason) => `No se pudo crear la pieza: ${reason}`,
      retry: 'Reintentar',
    },    bar: {
      label: (step) => `Flujo guiado · ${step === 'design' ? 'Diseño' : 'Guion'}`,
      back: 'Volver al flujo',
      continue: 'Continuar',
      saving: 'Guardando…',
      unsaved: 'Hay cambios sin guardar: Continuar los guarda primero.',
    },    propose: {
      proposingDesign: 'Escribiendo el diseño…',
      proposingScript: 'Escribiendo el guion…',
      sent: (prompt, model, provider) => `Enviado al servidor: «${prompt}» con el modelo ${model || 'del servidor'}${provider ? ` del proveedor ${provider}` : ''}.`,
      byAssistant: (model) => `Lo escribió el asistente${model ? ` (${model})` : ''}.`,
      byRule: (reason) => `Lo escribió la regla fija${reason ? `: ${reason}` : ''}.`,
      replacements: (n) => (n === 0 ? 'Ninguna parte se cambió por el nivel.' : `${n} partes se cambiaron por el nivel.`),
      designSummary: (concept) => `Concepto: ${concept || '—'}`,
      fonts: (display, body) => `Letras: ${display} / ${body}`,
      scriptSummary: (pieces, lines) => `${pieces} piezas · ${lines} líneas de texto`,
      again: 'Proponer otra vez',
      editInEditor: 'Editar en el editor',
      openScript: 'Abrir el guion en el editor',
      auto: 'No parar aquí',
      continue: 'Continuar',
      stale: 'El guion es de antes de cambiar el diseño: puedes conservarlo o proponerlo otra vez.',
      keep: 'Conservar el guion',
      failed: (reason) => `No se pudo escribir: ${reason}`,
      retry: 'Reintentar',
      busy: 'El servidor está dibujando otra cosa: se reintenta cada 10 s.',
      againTitle: 'Otra propuesta',
      againSubmit: 'Proponer',
      againCancel: 'Cancelar',
      serverDefault: 'El del servidor',
    },    parts: {
      sent: (count, model, provider) => `Enviado al servidor: ${count} borradores de partes con el modelo ${model || 'del servidor'}${provider ? ` del proveedor ${provider}` : ''}.`,
      writing: (name) => `Escribiendo «${name}»…`,
      there: 'Ya está en el catálogo.',
      ready: 'Borrador listo: mira las vistas previas.',
      failed: (reason) => `El borrador falló: ${reason}`,
      approve: 'Aprobar',
      askAgain: 'Pedirlo otra vez',
      askSubmit: 'Pedir',
      askCancel: 'Cancelar',
      drop: 'Descartar',
      approved: (name) => `Aprobada: ya está en el catálogo como «${name}».`,
      dropped: 'Descartada.',
      noPreview: 'Sin vista previa.',
      suggest: 'Hay partes aprobadas. Vuelve a la revisión del guion para usarlas: el flujo nunca las añade solo.',
      backToScript: 'Volver al guion',
      auto: 'No parar aquí',
      continue: 'Continuar',
      skip: 'Saltar las partes',
      retry: 'Reintentar',
      stepFailed: (reason) => `No se pudieron pedir las partes: ${reason}`,
      problem: (reason) => `No se pudo: ${reason}`,
    },
    render: {
      estimate: (seconds, frames, fps, size) => `Estimación (puede no acertar): unos ${seconds} s de dibujo, ${frames} fotogramas a ${fps} fps, ${size}.`,
      estimateNote: 'Dibujar usa el servidor durante minutos y no se puede parar aquí: el flujo nunca lo hace solo.',
      draw: 'Dibujar',
      drawing: (percent) => `Dibujando… ${percent} %`,
      queued: 'En cola…',
      failed: (reason) => `El dibujo falló: ${reason}`,
      retry: 'Reintentar',
      video: 'El vídeo',
      continue: 'Terminar',
      busy: 'El servidor está dibujando otra cosa: se reintenta cada 10 s.',
    },
    done: {
      title: 'Hecho',
      video: 'El vídeo',
      noVideo: 'Todavía no hay vídeo.',
      exportDataset: 'Exportar el dataset',
      exported: (name) => `Guardado como ${name}.`,
      exportFailed: (reason) => `No se pudo exportar: ${reason}`,
      openPiece: 'Abrir la pieza',
      newFlow: 'Nuevo flujo a partir de este',
      attempts: 'Intentos anteriores',
      attemptSong: (title) => `Canción «${title}»`,
      attemptPiece: (id) => `Pieza ${id}`,
      open: 'Abrir',
    },    reason: {
      gone: 'Ya no está en el servidor.',
      goneNamed: (name) => `«${name}» ya no está en el servidor.`,
      interrupted: 'Se cerró la pestaña mientras esto se hacía: vuelve a intentarlo.',
      noResult: 'Terminó sin dar resultado.',
    },
    page: {
      steps: { plan: 'Plan', song: 'Canción', map: 'Mapa de la canción', design: 'Diseño', script: 'Guion', parts: 'Partes', render: 'Dibujo', done: 'Hecho' },
      status: { pending: 'Pendiente', running: 'En marcha', waiting: 'En revisión', done: 'Hecho', failed: 'Falló', skipped: 'Saltado', stale: 'Desfasado' },
      back: 'Volver aquí',
      line: {
        song: (title, seconds) => `«${title}» · ${seconds} s`,
        map: (seconds, bpm) => `${seconds} s · ${bpm} bpm`,
        design: (author) => `Diseño escrito por ${author}`,
        script: (author) => `Guion escrito por ${author}`,
        parts: (count) => `Partes: ${count}`,
        render: 'Dibujado',
        skipped: 'Saltado',
      },
      author: { assistant: 'el asistente', rule: 'la regla fija' },
      failedBanner: (step) => `El paso «${step}» falló.`,
      goBack: (step) => `Volver a «${step}»`,
      notFound: (id) => `No hay ningún flujo «${id}» en este navegador.`,
      notFoundHint: 'Los flujos se guardan en el navegador: si cambiaste de navegador, impórtalo desde el archivo.',
      toList: 'Ver los flujos',
      notice: { dropped: (n) => `Se descartaron ${n} flujos antiguos para no pasar de 20.`, notKept: 'El navegador no deja guardar el flujo: sigue aquí, pero se perderá al cerrar la pestaña.' },
      resuming: 'Comprobando en el servidor dónde está cada cosa…',
    },
    list: {
      title: 'Tus flujos',
      empty: 'Todavía no hay flujos guardados.',
      resume: 'Seguir',
      delete: 'Borrar',
      deleteAsk: (prompt) => `¿Borrar el flujo «${prompt}»? Lo hecho en el servidor no se borra.`,
      export: 'Exportar',
      import: 'Importar un flujo',
      importBad: 'Ese archivo no es un flujo.',
      defaultsTitle: 'No parar en estos pasos',
      defaultsHint: 'Para los flujos nuevos. La canción, el guion y el dibujo siempre paran.',
      defaults: { map: 'Mapa de la canción', design: 'Diseño', parts: 'Partes' },
      updated: (when) => `Actualizado ${when}`,
      at: (step) => `en «${step}»`,
      newTitle: 'Un flujo nuevo',
    },
  },
  loading: 'Cargando…',
  retry: 'Reintentar',
  unknownError: 'No se pudo hablar con el servidor.',
  pieces: {
    title: 'Piezas',
    intro: 'Abre una pieza para verla en el navegador sobre su canción. Las piezas se crean en video-anim o en dashboard-full.',
    empty: 'El servidor no tiene piezas.',
    emptyHint: 'Crea una en video-anim; aparecerá aquí.',
    open: 'Abrir',
    song: 'Canción',
    created: 'Creada',
    loadExample: 'Cargar ejemplo',
    exampleLoaded: 'Ejemplo cargado.',
    states: { draft: 'Borrador', queued: 'En cola', running: 'Dibujando', done: 'Lista', failed: 'Fallida' },
    drawing: (p) => `Dibujando ${p}%`,
    format: (w, h, fps) => `${w}×${h} · ${fps} fps`,
  },
  importer: {
    open: 'Importar un dataset',
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
    summary: (c) => `${c.create} por crear, ${c['keep-local']} para guardar en el navegador, ${c.exists} que ya están y ${c.impossible} que no se pueden.`,
    columns: { kind: 'Tipo', item: 'Elemento', action: 'Qué pasará', why: 'Motivo' },
    kinds: { song: 'Canción', reference: 'Referencia', style: 'Estilo', part: 'Parte', animation: 'Animación' },
    actions: { create: 'Se crea', exists: 'Ya está', 'keep-local': 'Se guarda en el navegador', impossible: 'No se puede' },
    reasons: {
      'no-address': () => 'Se subió como vídeo y no tiene dirección: no se puede volver a hacer.',
      'song-missing': (d) => `La canción «${d}» no está en la biblioteca.`,
      'parts-missing': (d) => `Usa partes que el catálogo aún no tiene: ${d}. Apruébalas en video-anim e importa otra vez.`,
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
    approvalNote: 'Las partes se crean como borradores, que se aprueban en video-anim: la importación no aprueba nada.',
    dropAnimate: 'Crear la animación sin lo que este servidor no admite (fotogramas clave o capas)',
    confirm: 'Importar',
    cancel: 'Cancelar',
    running: 'Importando… las referencias tardan unos segundos en analizarse.',
    stop: 'Parar',
    states: { created: 'Creado', exists: 'Ya estaba', 'kept-local': 'Guardado en el navegador', failed: 'Falló', skipped: 'Sin hacer' },
    pending: 'Esperando',
    doneTitle: 'Importación terminada',
    done: (c) => `${c.created} creados, ${c.exists} ya estaban, ${c['kept-local']} guardados en el navegador, ${c.failed} fallaron y ${c.skipped} sin hacer.`,
    another: 'Importar otro fichero',
    close: 'Cerrar',
  },
  newPart: {
    open: 'Nueva parte…',
    openHint: 'Hacer una parte nueva: la escribe el asistente o la escribes tú, la pruebas y la apruebas aquí mismo',
    title: 'Nueva parte',
    close: 'Cerrar',
    describe: 'Qué tiene que dibujar',
    request: 'Descripción de la parte',
    requestHint: 'De 1 a 500 caracteres. Por ejemplo: una fila de barras que saltan con el pulso.',
    picture: 'Imagen (opcional)',
    pictureHint: 'Un png, jpg o webp de hasta 20 MB: el asistente la mira y dibuja algo parecido.',
    clearPicture: 'Quitar la imagen',
    ask: 'Pedir la parte',
    asking: 'Pidiendo…',
    drafts: 'Borradores que ya hay',
    draftsNone: 'No hay borradores.',
    reopen: 'Abrir',
    states: { writing: 'Escribiéndose', ready: 'Lista', failed: 'Falló' },
    attempts: (n) => (n === 1 ? '1 intento' : `${n} intentos`),
    writingNote: 'El asistente la está escribiendo y el servidor la comprueba: puede tardar un minuto. Puedes cerrar la ventana; el borrador sigue en el servidor.',
    back: 'Otra parte',
    preview: 'Vista previa',
    manifest: 'Manifiesto (JSON)',
    fragment: 'Fragmento (HTML)',
    template: 'Empezar por la plantilla',
    save: 'Guardar los cambios',
    saving: 'Guardando…',
    saved: 'Guardado: el servidor la aceptó y dibujó otra vista previa.',
    problems: 'El servidor no la acepta:',
    retry: 'Otro intento',
    approve: 'Aprobar',
    approving: 'Aprobando…',
    approveWarning: 'Una parte aprobada entra en el catálogo y desde aquí no se puede editar ni quitar.',
    approved: (n) => `La parte «${n}» está en la biblioteca.`,
    remove: 'Borrar el borrador',
    removeAsk: '¿Borrar este borrador?',
    guideTitle: 'Cómo es una parte',
    guide: [
      'El manifiesto dice el nombre (en minúsculas y con guiones, que no tenga ya el catálogo), la descripción, los niveles y los parámetros con sus límites.',
      'El fragmento lee sus parámetros de window.__params, usa tamaños en vh, los colores var(--accent), var(--fg) y var(--bg) y la letra var(--display).',
      'Para moverse define window.__partSeek = function (t, b) { … }: t son los segundos de la pieza y b el pulso (b.number y b.position, de 0 a 1). Dibuja solo a partir de ellos.',
      'No se admiten transiciones ni animaciones de CSS (el reloj dibuja los fotogramas) ni parámetros animables: eso solo lo tienen las partes del servidor.',
    ],
    reason: 'Motivo:',
  },
  help: {
    title: 'Atajos del editor',
    close: 'Cerrar la ayuda',
    open: 'Atajos (?)',
    groups: [
      {
        name: 'Reproducir',
        rows: [
          { keys: 'Espacio', does: 'Reproducir o pausar' },
          { keys: 'Inicio / Fin', does: 'Ir al principio o al final' },
          { keys: '← / →', does: 'Un fotograma atrás o adelante (con Mayús, un segundo)' },
        ],
      },
      {
        name: 'Editar',
        rows: [
          { keys: 'S', does: 'Dividir la pieza en el cursor' },
          { keys: 'Supr', does: 'Vaciar la pieza elegida; si ya está vacía, quitar el hueco. También quita una parte extra o un texto' },
          { keys: 'Ctrl+Z', does: 'Deshacer' },
          { keys: 'Ctrl+Mayús+Z / Ctrl+Y', does: 'Rehacer' },
          { keys: 'Ctrl+S', does: 'Guardar' },
          { keys: 'Esc', does: 'Quitar la selección y volver al diseño de la canción' },
        ],
      },
      {
        name: 'Línea de tiempo',
        rows: [
          { keys: 'Arrastrar un corte', does: 'Mover el corte entre dos piezas' },
          { keys: 'Arrastrar un bloque', does: 'Mover sus dos cortes a la vez' },
          { keys: 'Mayús + arrastrar un bloque', does: 'Soltarlo sobre otro para intercambiarlos' },
          { keys: '← / → en un corte o un bloque', does: 'Moverlo 0,1 s (1 s con Mayús, 0,01 s con Alt); Tab llega a cada uno' },
          { keys: '← / → en un fotograma clave', does: 'Moverlo igual, sin salir de la pieza ni pasar a sus vecinos' },
          { keys: '↑ / ↓ en un extra', does: 'Llevarlo al carril de arriba o de abajo' },
          { keys: '[ / ] en un bloque', does: 'Intercambiar lo que dibuja con la pieza de antes o de después' },
          { keys: '⇄ en la biblioteca', does: 'Poner la parte como la de la pieza elegida, sin arrastrar' },
          { keys: '▤ en la biblioteca', does: 'Hacer de la parte un elemento de capa donde está el cursor, sin arrastrar' },
          { keys: 'M', does: 'Activar o desactivar el imán de compás' },
          { keys: 'Alt', does: 'Suspender el imán mientras se arrastra' },
          { keys: '+ / −', does: 'Acercar o alejar (también Ctrl y la rueda)' },
        ],
      },
      {
        name: 'Elemento de una capa',
        rows: [
          { keys: '← / →', does: 'Mover el elemento elegido una décima de segundo (un segundo con Mayús)' },
          { keys: 'Alt + ← / →', does: 'Cambiar dónde acaba (una décima; con Mayús, un segundo)' },
          { keys: 'Ctrl+D', does: 'Copiarlo justo detrás, con lo que quepa hasta el siguiente elemento' },
          { keys: 'Supr', does: 'Quitarlo (o quitar el fotograma clave elegido)' },
        ],
      },
      {
        name: 'Código',
        rows: [
          { keys: 'Pestaña Código', does: 'Escribir el guion como código tipado: es otra vista del mismo guion' },
          { keys: 'Ctrl+Z', does: 'Con el cursor en el código deshace texto; fuera de él deshace el guion y el código se escribe de nuevo' },
          { keys: 'Ctrl+Espacio', does: 'Completar partes, parámetros y opciones desde el catálogo' },
          { keys: 'Clic en un bloque', does: 'Resalta su piece(...) en el código; el cursor en un piece(...) elige su bloque' },
        ],
      },
      {
        name: 'Ayuda',
        rows: [{ keys: '?', does: 'Abrir esta ayuda' }],
      },
    ],
  },
  editor: {
    back: 'Piezas',
    loading: 'Abriendo la pieza…',
    previewProblem: (reason) => `El servidor no dibuja esta versión (${reason}); se ve la vista aproximada.`,
    notFound: (id) => `No hay ninguna pieza con el id «${id}».`,
    notFoundHint: 'Puede que se haya borrado, o que estés en otro servidor.',
    loadFailed: 'No se pudo abrir la pieza:',
    drawing: (p) => `El servidor está dibujando esta pieza (${p}%). Puedes seguir viéndola.`,
    proposing: 'El asistente está escribiendo una propuesta para esta pieza.',
    regions: { layers: 'Piezas', library: 'Biblioteca', preview: 'Vista previa', inspector: 'Inspector', timeline: 'Línea de tiempo' },
    enlargePreview: 'Ampliar la vista previa',
    closePreview: 'Cerrar la vista previa',
  },
  code: {
    tabs: { label: 'Vista del guion', visual: 'Visual', code: 'Código', vector: 'Vector' },
    pane: { label: 'Código del guion', loading: 'Abriendo el editor de código…', failed: 'No se pudo abrir el editor de código:', retry: 'Reintentar' },
    status: {
      ok: 'El código se aplica al guion.',
      errors: (n) => (n === 1 ? '1 error: el guion no cambia hasta que se arregle.' : `${n} errores: el guion no cambia hasta que se arreglen.`),
      warnings: (n) => (n === 1 ? '1 aviso' : `${n} avisos`),
    },
    paused: 'El código tiene cambios que aún no se pueden aplicar: la edición visual espera y la vista previa sigue con el último guion bueno.',
    goToCode: 'Ir al código',
    revert: 'Descartar el código',
    revertAsk: '¿Descartar lo escrito en el código y volver a escribirlo desde el guion?',
    replaced: 'Se han reemplazado los comentarios y el formato que habías escrito en el código: el código es una vista del guion y se escribe de nuevo al cambiarlo desde lo visual.',
    saveWithErrors: 'El código tiene errores. ¿Guardar el último guion que sí se pudo aplicar?',
    hint: 'Tipos y completado vienen del catálogo; los rangos y las longitudes los marca el editor unos instantes después de teclear.',
  },
  vector: {
    off: { notVector: 'No es una parte vectorial', noBlock: 'Elige una parte en la línea de tiempo', loading: 'Leyendo la parte…' },
    dirty: 'cambios sin guardar',
    toolbar: 'Herramientas de la parte vectorial',
    save: 'Guardar',
    saveAsNew: 'Guardar como nueva',
    discard: 'Descartar',
    discardAsk: '¿Descartar los cambios de la parte vectorial?',
    help: 'Ayuda',
    editing: (name) => `Editando la parte vectorial «${name}»`,
    creating: 'Parte vectorial nueva',
    saved: (name) => `La parte «${name}» está guardada en el catálogo y la vista previa se ha rehecho.`,
    open: 'Nueva parte vectorial…',
    openHint: 'Hacer una parte nueva a partir de un SVG: la animas con fotogramas clave y con el compás, y la envías al catálogo',
    notSvg: (file) => `«${file}» no es un SVG.`,
    cannotOpen: (reason) => `No se pudo abrir el SVG: ${reason}`,
    notVectorPart: (name) => `«${name}» no es una parte vectorial: no lleva su modelo dentro.`,
    replacesUses: (n) => (n === 1 ? 'La usa 1 pieza del guion abierto; el servidor no dice cuántas más.' : `La usan ${n} piezas del guion abierto; el servidor no dice cuántas más.`),
    leave: {
      title: 'Hay cambios en la parte vectorial',
      text: (what) => `${what} tiene cambios sin guardar. Son aparte de los del guion.`,
      save: 'Guardar',
      discard: 'Descartar',
      stay: 'Quedarme',
    },
    helpTitle: 'Pestaña Vector',
    helpRows: [
      { keys: 'Vector', does: 'Edita la parte vectorial elegida; los cambios de la parte y los del guion se guardan por separado (el punto de la pestaña avisa)' },
      { keys: 'Guardar', does: 'Reemplaza la parte en el catálogo y rehace la vista previa de las escenas que la usan' },
      { keys: 'Compás', does: 'Los enlaces al compás se ven en el lienzo con los pulsos de esta pieza; el reproductor de la pestaña va en silencio' },
    ],
  },
  actions: {
    export: 'Exportar dataset',
    exporting: 'Exportando…',
    exported: (n) => `Guardado como ${n}.`,
    exportFailed: 'No se pudo exportar:',
    render: 'Dibujar vídeo',
    rendering: 'Dibujando…',
    estimate: (t, f) => `Estimación (puede variar): ${t} · ${f} fotogramas`,
    progress: (p) => `${p}% dibujado`,
    video: 'Ver el vídeo',
    renderFailed: 'No se pudo empezar a dibujar:',
    failedPiece: 'El dibujo falló:',
  },
  editing: {
    undo: 'Deshacer',
    redo: 'Rehacer',
    save: 'Guardar',
    saving: 'Guardando…',
    saved: 'Guardado en el servidor.',
    unsaved: 'Cambios sin guardar',
    draftFound: (when) => `Hay un borrador sin guardar de ${when}, guardado en este navegador.`,
    draftChanges: (pieces, design, layers) => {
      const parts = [pieces > 0 ? `${pieces} ${pieces === 1 ? 'pieza' : 'piezas'}` : '', design ? 'el diseño' : '', layers ? 'las capas' : ''].filter(Boolean);
      return parts.length ? `Cambia ${parts.join(', ')}.` : '';
    },
    draftMoved: 'La pieza cambió en el servidor después de empezar el borrador: si lo recuperas y guardas, pisarás esos cambios.',
    draftRestore: 'Recuperarlo',
    draftDismiss: 'Descartarlo',
    discard: 'Descartar cambios',
    discardAsk: '¿Descartar los cambios sin guardar y volver a lo que tiene el servidor?',
    proposalAsk: 'El asistente ha terminado una propuesta, pero tienes cambios sin guardar. ¿Cargar la propuesta y descartar tus cambios? (Cancelar conserva los tuyos.)',
    leaveAsk: 'Hay cambios sin guardar. ¿Salir y perderlos?',
    locked: 'Mientras el servidor dibuja o el asistente escribe, no se puede editar.',
    refusedAt: (id) => `El servidor rechazó la pieza ${id}:`,
    refusedDesign: 'El servidor rechazó el diseño:',
    part: 'Parte',
    mode: 'Modo',
    modeAuto: (m) => `El de su sección (${m})`,
    lines: 'Letra que aparece',
    lineText: 'Texto',
    lineStart: 'Desde (s)',
    lineEnd: 'Hasta (s)',
    lineKeyword: 'Palabra clave',
    noKeyword: 'Ninguna',
    removeLine: 'Quitar línea',
    addFromSong: 'Añadir una línea de la canción',
    addFromSongNone: 'No quedan líneas de la canción en esta pieza.',
    chooseLine: 'Elige una línea…',
    addFree: 'Añadir texto propio',
    freeHint: 'Un texto que escribes tú, con el momento en que aparece.',
    hit: 'Palabra a pantalla completa',
    hitWord: 'Palabra',
    hitNone: 'Ninguna',
    hitAt: 'Aparece en (s)',
    hitLength: 'Dura (s)',
    extras: 'Partes extra',
    addExtra: 'Añadir',
    chooseExtra: 'Elige una parte…',
    removeExtra: 'Quitar',
    extrasFull: 'Una pieza lleva como mucho tres partes extra.',
    extrasNone: 'Sin partes extra.',
    stage: 'Escenario',
    songDesign: 'Diseño de la canción',
    ownDesign: 'Diseño propio de la pieza',
    noParts: 'El servidor no tiene partes.',
    split: 'Dividir',
    splitHint: 'Divide la pieza en el cursor (S)',
    removePiece: 'Quitar pieza',
    removeExtraPart: 'Quitar parte extra',
    removeText: 'Quitar texto',
    removePieceHint: 'Vacía la pieza elegida: se queda en blanco y puedes poner en su sitio lo que quieras (Supr). Si ya está vacía, la quita y su tiempo pasa a la anterior',
    removeSlot: 'Quitar hueco',
    removeSlotHint: 'Quita el hueco: su tiempo pasa a la pieza anterior (Supr)',
    newText: 'Texto nuevo',
    tooShort: 'Cada mitad tiene que durar al menos medio segundo: mueve el cursor.',
    lastPiece: 'La última pieza que queda no se puede quitar.',
    alreadyHas: (p) => `Esta pieza ya dibuja «${p}».`,
    noRoom: 'No cabe un elemento ahí: hay otro encima o queda menos de medio segundo libre.',
    layersNotTaken: 'El servidor no admite capas.',
    layersBlocked: 'El servidor no admite capas: quita las capas para poder guardar.',
    removeAllLayers: 'Quitar todas las capas',
    textNotInLayer: 'Un texto no va en una capa: suéltalo sobre una pieza.',
    nothingSelected: 'Elige una pieza primero.',
  },
  inspector: {
    piece: (id) => `Pieza ${id}`,
    extra: (n, part) => `Extra ${n}: ${part}`,
    song: 'Diseño de la canción',
    part: 'Parte',
    description: 'Qué hace',
    levels: 'Niveles',
    replaced: (level) => `No admite el nivel ${level}: se cambia por otra más sencilla al dibujar`,
    notInCatalog: 'Esta parte no está en el catálogo del servidor',
    params: 'Parámetros',
    noParams: 'Esta parte no tiene parámetros.',
    mode: 'Modo',
    modes: { dark: 'Oscuro', light: 'Claro' },
    modeFrom: { piece: 'fijado en la pieza', section: 'el de su sección', default: 'el de la canción' },
    lines: 'Letra',
    noLines: 'Sin letra en esta pieza.',
    keyword: (w) => `palabra clave: ${w}`,
    hit: 'Palabra a pantalla completa',
    noHit: 'Ninguna.',
    hitLine: (w, at, len) => `«${w}» a los ${at} s, durante ${len} s`,
    stage: 'Escenario',
    noStage: 'Sin escenario.',
    background: 'Fondo',
    character: (name, x, y, size, action) => `${name} en ${x}%, ${y}% · tamaño ${size}%${action ? ` · ${action}` : ''}`,
    ownDesign: 'Diseño propio de la pieza',
    sameDesign: 'Usa el diseño de la canción.',
    design: { colours: 'Colores', dark: 'Oscuro', light: 'Claro', accent: 'Acento', fonts: 'Tipografías', display: 'Titulares', body: 'Texto', modes: 'Modo por sección', defaultMode: 'Modo por defecto', concept: 'Idea', verseStyle: 'Verso', hitStyle: 'Palabra grande', none: 'normal' },
    animate: {
      title: 'Animación',
      animate: 'Animar',
      stop: 'Dejar de animar',
      removeAll: 'Quitar todos los fotogramas clave',
      atPlayhead: (v) => `En el cursor: ${v}`,
      keyframe: (n, t, v) => `Fotograma ${n}: ${v} a los ${t}`,
      time: 'Segundo de la pieza',
      timeItem: 'Segundo del elemento',
      value: 'Valor',
      ease: 'Hacia el siguiente',
      eases: { linear: 'Lineal', in: 'Empieza despacio', out: 'Acaba despacio', 'in-out': 'Despacio en los dos extremos', step: 'Salto' },
      removeKeyframe: 'Quitar este fotograma',
      why: 'Solo se pueden animar los parámetros que la parte lee mientras dibuja; los demás se fijan al cargarla.',
      unsupported: 'El servidor no admite parámetros animados: quita los fotogramas clave para poder guardar.',
      on: 'sí',
      off: 'no',
    },
    item: {
      title: (layer, n) => `Capa «${layer}», elemento ${n}`,
      part: 'Parte',
      from: 'Desde (s)',
      to: 'Hasta (s)',
      length: (s) => `Dura ${s} s; se dibuja sobre todas las piezas que toca.`,
      heavy: (parts, most) => `La página de alguna pieza dibuja ${parts} partes (el servidor admite ${most}): el vídeo tardará más.`,
      remove: 'Quitar este elemento',
      removeLayer: 'Quitar esta capa y sus elementos',
    },
    hint: 'Selecciona una pieza en la línea de tiempo o en las capas para editarla. Los cambios se guardan con Guardar.',
  },
};

const en: Texts = {
  nav: { pieces: 'Pieces', flow: 'Guided flow' },
  flow: {
    title: 'Guided flow',
    intro: 'From one sentence to a video, stopping after each step.',
    plan: {
      sentence: 'Your sentence',
      sentenceHint: 'One sentence with what you want: the song, the animation and, if you like, the parts. Nothing is created until you press Start.',
      sentenceCount: (n, max) => `${n} of ${max} characters`,
      make: 'Make the plan',
      making: 'Writing the plan…',
      planTitle: 'The plan',
      planHint: 'Edit anything. Nothing has been created on the server yet.',
      start: 'Start',
      noModels: 'The assistant is not available: the plan can still be started and the proposals will use the fixed rules.',
      takesTime: 'The plan is written with two assistant calls: on a CPU it can take a minute or two.',
      warningsTitle: 'The server warns:',
      notUsed: (reason) => `The one-call plan was not used (${reason}): the plan was made the usual way, with the song written apart and the usual values.`,
      writeFailed: (reason) => `The assistant could not write the song (${reason}). Fill the fields yourself or start with them empty.`,
      serverDefault: "The server's own",
      invalidParts: (lines) => `These part lines are not valid (lowercase name with hyphens, no repeats): ${lines}`,
      tooLong: (max) => `The sentence can have up to ${max} characters.`,
      generators: { 'ace-step': 'ACE-Step', heartmula: 'HeartMuLa', diffrhythm2: 'DiffRhythm2' },
    },
    song: {
      title: 'Song',
      checking: 'Checking which generators can be used…',
      engineDown: (generator, reason) => `${generator} cannot be used now (${reason}).`,
      startEngine: (generator) => `Start ${generator}`,
      starting: 'Starting… check again in a moment.',
      useOther: (generator) => `Use ${generator}`,
      sent: (generator, title, style) => `Sent to the server: "${title}" with ${generator}, style "${style}".`,
      queued: (position) => (position ? `Queued (place ${position})…` : 'Queued…'),
      running: 'Making the song…',
      listen: 'Listen to it',
      length: (seconds) => `${seconds} s`,
      regenerate: 'Regenerate',
      editTexts: 'Edit texts and regenerate',
      applyAndRegenerate: 'Regenerate with these texts',
      cancelEdit: 'Cancel',
      titleLabel: 'Title',
      lyricsLabel: 'Lyrics',
      styleLabel: 'Style',
      pickExisting: 'Pick an existing song',
      pickTitle: "The library's songs",
      noLibrarySongs: 'The library has no songs yet.',
      pick: 'Use this one',
      continue: 'Continue',
      waitingLibrary: (seconds) => `Waiting for the animation library to list the song… ${seconds} s`,
      lag: 'The library does not list the song yet.',
      retry: 'Retry',
      failed: (reason) => `The song did not come out: ${reason}`,
    },
    map: {
      title: 'Song map',
      making: 'Making the piece and its song map…',
      sent: (title, style, level, fps, size) => `Sent to the server: a piece of "${title}", ${style} style, ${level} level, ${fps} fps, ${size}.`,
      summary: (seconds, bpm, sections, words) => `${seconds} s · ${bpm} bpm · ${sections} sections · ${words} words`,
      estimated: 'The word times are an estimate (spread over the sections).',
      heard: 'The word times were heard in the song.',
      transcribe: 'Transcribe (hear the words)',
      transcribing: 'Hearing the words…',
      transcribeFailed: (reason) => `The words could not be heard: ${reason}`,
      auto: 'Do not stop here',
      continue: 'Continue',
      failed: (reason) => `The piece could not be made: ${reason}`,
      retry: 'Retry',
    },    bar: {
      label: (step) => `Guided flow · ${step === 'design' ? 'Design' : 'Script'}`,
      back: 'Back to the flow',
      continue: 'Continue',
      saving: 'Saving…',
      unsaved: 'There are unsaved changes: Continue saves them first.',
    },    propose: {
      proposingDesign: 'Writing the design…',
      proposingScript: 'Writing the script…',
      sent: (prompt, model, provider) => `Sent to the server: "${prompt}" with ${model ? `the model ${model}` : "the server's own model"}${provider ? ` of the provider ${provider}` : ''}.`,
      byAssistant: (model) => `Written by the assistant${model ? ` (${model})` : ''}.`,
      byRule: (reason) => `Written by the fixed rule${reason ? `: ${reason}` : ''}.`,
      replacements: (n) => (n === 0 ? 'No part was swapped for the level.' : `${n} parts were swapped for the level.`),
      designSummary: (concept) => `Concept: ${concept || '—'}`,
      fonts: (display, body) => `Fonts: ${display} / ${body}`,
      scriptSummary: (pieces, lines) => `${pieces} pieces · ${lines} lines of text`,
      again: 'Propose again',
      editInEditor: 'Edit in the editor',
      openScript: 'Open the script in the editor',
      auto: 'Do not stop here',
      continue: 'Continue',
      stale: 'The script is from before the design changed: keep it or propose it again.',
      keep: 'Keep the script',
      failed: (reason) => `It could not be written: ${reason}`,
      retry: 'Retry',
      busy: 'The server is drawing something else: trying again every 10 s.',
      againTitle: 'Another proposal',
      againSubmit: 'Propose',
      againCancel: 'Cancel',
      serverDefault: "The server's own",
    },    parts: {
      sent: (count, model, provider) => `Sent to the server: ${count} part drafts with ${model ? `the model ${model}` : "the server's own model"}${provider ? ` of the provider ${provider}` : ''}.`,
      writing: (name) => `Writing "${name}"…`,
      there: 'Already in the catalog.',
      ready: 'Draft ready: look at the previews.',
      failed: (reason) => `The draft failed: ${reason}`,
      approve: 'Approve',
      askAgain: 'Ask again',
      askSubmit: 'Ask',
      askCancel: 'Cancel',
      drop: 'Drop',
      approved: (name) => `Approved: it is in the catalog as "${name}".`,
      dropped: 'Dropped.',
      noPreview: 'No preview.',
      suggest: 'Some parts are approved. Go back to the Script review to use them: the flow never adds them by itself.',
      backToScript: 'Back to the Script',
      auto: 'Do not stop here',
      continue: 'Continue',
      skip: 'Skip the parts',
      retry: 'Retry',
      stepFailed: (reason) => `The parts could not be asked for: ${reason}`,
      problem: (reason) => `It did not work: ${reason}`,
    },
    render: {
      estimate: (seconds, frames, fps, size) => `Estimate (it may be off): about ${seconds} s of drawing, ${frames} frames at ${fps} fps, ${size}.`,
      estimateNote: 'Drawing uses the server for minutes and cannot be stopped from here: the flow never does it by itself.',
      draw: 'Draw',
      drawing: (percent) => `Drawing… ${percent} %`,
      queued: 'Queued…',
      failed: (reason) => `The drawing failed: ${reason}`,
      retry: 'Retry',
      video: 'The video',
      continue: 'Finish',
      busy: 'The server is drawing something else: trying again every 10 s.',
    },
    done: {
      title: 'Done',
      video: 'The video',
      noVideo: 'There is no video yet.',
      exportDataset: 'Export dataset',
      exported: (name) => `Saved as ${name}.`,
      exportFailed: (reason) => `It could not be exported: ${reason}`,
      openPiece: 'Open the piece',
      newFlow: 'New flow from this one',
      attempts: 'Earlier attempts',
      attemptSong: (title) => `Song "${title}"`,
      attemptPiece: (id) => `Piece ${id}`,
      open: 'Open',
    },    reason: {
      gone: 'It is no longer on the server.',
      goneNamed: (name) => `"${name}" is no longer on the server.`,
      interrupted: 'The tab was closed while this was running: try it again.',
      noResult: 'It ended without a result.',
    },
    page: {
      steps: { plan: 'Plan', song: 'Song', map: 'Song map', design: 'Design', script: 'Script', parts: 'Parts', render: 'Render', done: 'Done' },
      status: { pending: 'Pending', running: 'Running', waiting: 'In review', done: 'Done', failed: 'Failed', skipped: 'Skipped', stale: 'Out of date' },
      back: 'Back to this',
      line: {
        song: (title, seconds) => `"${title}" · ${seconds} s`,
        map: (seconds, bpm) => `${seconds} s · ${bpm} bpm`,
        design: (author) => `Design written by ${author}`,
        script: (author) => `Script written by ${author}`,
        parts: (count) => `Parts: ${count}`,
        render: 'Drawn',
        skipped: 'Skipped',
      },
      author: { assistant: 'the assistant', rule: 'the fixed rule' },
      failedBanner: (step) => `The "${step}" step failed.`,
      goBack: (step) => `Back to "${step}"`,
      notFound: (id) => `There is no flow "${id}" in this browser.`,
      notFoundHint: 'Flows are kept in the browser: if you changed browser, import it from the file.',
      toList: 'See the flows',
      notice: { dropped: (n) => `${n} older flows were dropped to stay within 20.`, notKept: 'The browser will not keep the flow: it stays here, but it will be lost when the tab closes.' },
      resuming: 'Checking on the server where each thing is…',
    },
    list: {
      title: 'Your flows',
      empty: 'There are no kept flows yet.',
      resume: 'Resume',
      delete: 'Delete',
      deleteAsk: (prompt) => `Delete the flow "${prompt}"? What it made on the server is not deleted.`,
      export: 'Export',
      import: 'Import a flow',
      importBad: 'That file is not a flow.',
      defaultsTitle: 'Do not stop at these steps',
      defaultsHint: 'For new flows. The song, the script and the render always stop.',
      defaults: { map: 'Song map', design: 'Design', parts: 'Parts' },
      updated: (when) => `Updated ${when}`,
      at: (step) => `at "${step}"`,
      newTitle: 'A new flow',
    },
  },
  loading: 'Loading…',
  retry: 'Retry',
  unknownError: 'Could not reach the server.',
  pieces: {
    title: 'Pieces',
    intro: 'Open a piece to see it in the browser over its song. Pieces are made in video-anim or in dashboard-full.',
    empty: 'The server has no pieces.',
    emptyHint: 'Make one in video-anim; it will show up here.',
    open: 'Open',
    song: 'Song',
    created: 'Created',
    loadExample: 'Load example',
    exampleLoaded: 'Example loaded.',
    states: { draft: 'Draft', queued: 'Queued', running: 'Drawing', done: 'Ready', failed: 'Failed' },
    drawing: (p) => `Drawing ${p}%`,
    format: (w, h, fps) => `${w}×${h} · ${fps} fps`,
  },
  importer: {
    open: 'Import a dataset',
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
    summary: (c) => `${c.create} to create, ${c['keep-local']} to keep in the browser, ${c.exists} already there and ${c.impossible} that cannot be done.`,
    columns: { kind: 'Kind', item: 'Item', action: 'What will happen', why: 'Why' },
    kinds: { song: 'Song', reference: 'Reference', style: 'Style', part: 'Part', animation: 'Animation' },
    actions: { create: 'Will be created', exists: 'Already there', 'keep-local': 'Kept in the browser', impossible: 'Cannot be done' },
    reasons: {
      'no-address': () => 'It was uploaded as a video and has no address: it cannot be made again.',
      'song-missing': (d) => `The song "${d}" is not in the library.`,
      'parts-missing': (d) => `It uses parts the catalog does not have yet: ${d}. Approve them in video-anim and import again.`,
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
    approvalNote: 'Parts are made as drafts, which are approved in video-anim: importing approves nothing.',
    dropAnimate: 'Make the animation without what this server does not take (keyframes or layers)',
    confirm: 'Import',
    cancel: 'Cancel',
    running: 'Importing… references take a few seconds to be analysed.',
    stop: 'Stop',
    states: { created: 'Created', exists: 'Already there', 'kept-local': 'Kept in the browser', failed: 'Failed', skipped: 'Not done' },
    pending: 'Waiting',
    doneTitle: 'Import finished',
    done: (c) => `${c.created} created, ${c.exists} already there, ${c['kept-local']} kept in the browser, ${c.failed} failed and ${c.skipped} not done.`,
    another: 'Import another file',
    close: 'Close',
  },
  newPart: {
    open: 'New part…',
    openHint: 'Make a new part: the assistant writes it or you do, you try it and approve it right here',
    title: 'New part',
    close: 'Close',
    describe: 'What it has to draw',
    request: 'Description of the part',
    requestHint: '1 to 500 characters. For example: a row of bars that jump on the beat.',
    picture: 'Picture (optional)',
    pictureHint: 'A png, jpg or webp of up to 20 MB: the assistant looks at it and draws something like it.',
    clearPicture: 'Remove the picture',
    ask: 'Ask for the part',
    asking: 'Asking…',
    drafts: 'Drafts that exist',
    draftsNone: 'There are no drafts.',
    reopen: 'Open',
    states: { writing: 'Being written', ready: 'Ready', failed: 'Failed' },
    attempts: (n) => (n === 1 ? '1 attempt' : `${n} attempts`),
    writingNote: 'The assistant is writing it and the server is checking it: it can take a minute. You can close the window; the draft stays in the server.',
    back: 'Another part',
    preview: 'Preview',
    manifest: 'Manifest (JSON)',
    fragment: 'Fragment (HTML)',
    template: 'Start from the template',
    save: 'Save the changes',
    saving: 'Saving…',
    saved: 'Saved: the server took it and drew another preview.',
    problems: 'The server does not accept it:',
    retry: 'Another attempt',
    approve: 'Approve',
    approving: 'Approving…',
    approveWarning: 'An approved part enters the catalog and cannot be edited or removed from here.',
    approved: (n) => `The part "${n}" is in the library.`,
    remove: 'Delete the draft',
    removeAsk: 'Delete this draft?',
    guideTitle: 'What a part is like',
    guide: [
      'The manifest gives the name (lowercase with dashes, one the catalog does not have yet), the description, the levels and the parameters with their limits.',
      'The fragment reads its parameters from window.__params, sizes things in vh, uses the colours var(--accent), var(--fg) and var(--bg) and the typeface var(--display).',
      'To move it defines window.__partSeek = function (t, b) { … }: t is the seconds of the piece and b the beat (b.number and b.position, from 0 to 1). Draw from those only.',
      'CSS transitions and animations are not allowed (the clock draws the frames), nor are animatable parameters: only the server\'s own parts have them.',
    ],
    reason: 'Reason:',
  },
  help: {
    title: 'Editor shortcuts',
    close: 'Close the help',
    open: 'Shortcuts (?)',
    groups: [
      {
        name: 'Playback',
        rows: [
          { keys: 'Space', does: 'Play or pause' },
          { keys: 'Home / End', does: 'Go to the start or the end' },
          { keys: '← / →', does: 'One frame back or forward (with Shift, one second)' },
        ],
      },
      {
        name: 'Editing',
        rows: [
          { keys: 'S', does: 'Split the piece at the playhead' },
          { keys: 'Del', does: 'Empty the chosen piece; if it is already empty, remove the slot. It also removes an extra part or a text' },
          { keys: 'Ctrl+Z', does: 'Undo' },
          { keys: 'Ctrl+Shift+Z / Ctrl+Y', does: 'Redo' },
          { keys: 'Ctrl+S', does: 'Save' },
          { keys: 'Esc', does: 'Clear the selection and go back to the song design' },
        ],
      },
      {
        name: 'Timeline',
        rows: [
          { keys: 'Drag a cut', does: 'Move the cut between two pieces' },
          { keys: 'Drag a block', does: 'Move both its cuts at once' },
          { keys: 'Shift + drag a block', does: 'Drop it on another one to swap them' },
          { keys: '← / → on a cut or a block', does: 'Move it 0.1 s (1 s with Shift, 0.01 s with Alt); Tab reaches each one' },
          { keys: '← / → on a keyframe', does: 'Move it the same way, inside the piece and short of its neighbours' },
          { keys: '↑ / ↓ on an extra', does: 'Take it to the lane above or below' },
          { keys: '[ / ] on a block', does: 'Swap what it draws with the piece before or after it' },
          { keys: '⇄ in the library', does: 'Make the part the one of the chosen piece, with no drag' },
          { keys: '▤ in the library', does: 'Make the part a layer item where the playhead is, with no drag' },
          { keys: 'M', does: 'Turn the beat magnet on or off' },
          { keys: 'Alt', does: 'Suspend the magnet while dragging' },
          { keys: '+ / −', does: 'Zoom in or out (also Ctrl and the wheel)' },
        ],
      },
      {
        name: 'Item of a layer',
        rows: [
          { keys: '← / →', does: 'Move the chosen item a tenth of a second (a second with Shift)' },
          { keys: 'Alt + ← / →', does: 'Change where it ends (a tenth; with Shift, a second)' },
          { keys: 'Ctrl+D', does: 'Copy it right after, as long as there is room before the next item' },
          { keys: 'Del', does: 'Remove it (or the chosen keyframe)' },
        ],
      },
      {
        name: 'Code',
        rows: [
          { keys: 'Code tab', does: 'Write the script as typed code: it is another view of the same script' },
          { keys: 'Ctrl+Z', does: 'With the cursor in the code it undoes text; elsewhere it undoes the script and the code is written again' },
          { keys: 'Ctrl+Space', does: 'Complete parts, parameters and options from the catalog' },
          { keys: 'Click a block', does: 'Highlights its piece(...) in the code; the cursor in a piece(...) selects its block' },
        ],
      },
      {
        name: 'Help',
        rows: [{ keys: '?', does: 'Open this help' }],
      },
    ],
  },
  editor: {
    back: 'Pieces',
    loading: 'Opening the piece…',
    previewProblem: (reason) => `The server does not draw this version (${reason}); the approximate view is shown.`,
    notFound: (id) => `There is no piece with the id "${id}".`,
    notFoundHint: 'It may have been deleted, or you may be on another server.',
    loadFailed: 'The piece could not be opened:',
    drawing: (p) => `The server is drawing this piece (${p}%). You can keep looking at it.`,
    proposing: 'The assistant is writing a proposal for this piece.',
    regions: { layers: 'Pieces', library: 'Library', preview: 'Preview', inspector: 'Inspector', timeline: 'Timeline' },
    enlargePreview: 'Enlarge the preview',
    closePreview: 'Close the preview',
  },
  code: {
    tabs: { label: 'Script view', visual: 'Visual', code: 'Code', vector: 'Vector' },
    pane: { label: 'Script code', loading: 'Opening the code editor…', failed: 'The code editor could not be opened:', retry: 'Try again' },
    status: {
      ok: 'The code is applied to the script.',
      errors: (n) => (n === 1 ? '1 error: the script does not change until it is fixed.' : `${n} errors: the script does not change until they are fixed.`),
      warnings: (n) => (n === 1 ? '1 warning' : `${n} warnings`),
    },
    paused: 'The code has changes that cannot be applied yet: visual editing waits and the preview keeps the last good script.',
    goToCode: 'Go to the code',
    revert: 'Discard the code',
    revertAsk: 'Discard what is written in the code and write it again from the script?',
    replaced: 'The comments and formatting you had written in the code were replaced: the code is a view of the script and is written again when it is changed from the visual side.',
    saveWithErrors: 'The code has errors. Save the last script that could be applied?',
    hint: 'Types and completion come from the catalog; ranges and lengths are marked by the editor a moment after you type.',
  },
  vector: {
    off: { notVector: 'Not a vector part', noBlock: 'Pick a part on the timeline', loading: 'Reading the part…' },
    dirty: 'unsaved changes',
    toolbar: 'Vector part tools',
    save: 'Save',
    saveAsNew: 'Save as new',
    discard: 'Discard',
    discardAsk: 'Discard the changes to the vector part?',
    help: 'Help',
    editing: (name) => `Editing the vector part “${name}”`,
    creating: 'New vector part',
    saved: (name) => `The part “${name}” is saved in the catalog and the preview was rebuilt.`,
    open: 'New vector part…',
    openHint: 'Make a new part from an SVG: animate it with keyframes and with the beat, and send it to the catalog',
    notSvg: (file) => `“${file}” is not an SVG.`,
    cannotOpen: (reason) => `The SVG could not be opened: ${reason}`,
    notVectorPart: (name) => `“${name}” is not a vector part: it carries no model.`,
    replacesUses: (n) => (n === 1 ? '1 piece of the open script uses it; the server does not say how many more.' : `${n} pieces of the open script use it; the server does not say how many more.`),
    leave: {
      title: 'The vector part has changes',
      text: (what) => `${what} has unsaved changes. They are apart from the script’s.`,
      save: 'Save',
      discard: 'Discard',
      stay: 'Stay',
    },
    helpTitle: 'Vector tab',
    helpRows: [
      { keys: 'Vector', does: 'Edits the chosen vector part; the part’s changes and the script’s are saved apart (the dot on the tab says so)' },
      { keys: 'Save', does: 'Replaces the part in the catalog and rebuilds the preview of the scenes that use it' },
      { keys: 'Beat', does: 'Beat links show on the canvas with this piece’s beats; the tab’s transport is silent' },
    ],
  },
  actions: {
    export: 'Export dataset',
    exporting: 'Exporting…',
    exported: (n) => `Saved as ${n}.`,
    exportFailed: 'Could not export:',
    render: 'Draw video',
    rendering: 'Drawing…',
    estimate: (t, f) => `Estimate (may vary): ${t} · ${f} frames`,
    progress: (p) => `${p}% drawn`,
    video: 'Watch the video',
    renderFailed: 'Could not start drawing:',
    failedPiece: 'The drawing failed:',
  },
  editing: {
    undo: 'Undo',
    redo: 'Redo',
    save: 'Save',
    saving: 'Saving…',
    saved: 'Saved on the server.',
    unsaved: 'Unsaved changes',
    draftFound: (when) => `There is an unsaved draft from ${when}, kept in this browser.`,
    draftChanges: (pieces, design, layers) => {
      const parts = [pieces > 0 ? `${pieces} ${pieces === 1 ? 'piece' : 'pieces'}` : '', design ? 'the design' : '', layers ? 'the layers' : ''].filter(Boolean);
      return parts.length ? `It changes ${parts.join(', ')}.` : '';
    },
    draftMoved: 'The piece changed on the server after the draft was started: if you restore it and save, you will overwrite those changes.',
    draftRestore: 'Restore it',
    draftDismiss: 'Discard it',
    discard: 'Discard changes',
    discardAsk: 'Discard the unsaved changes and go back to what the server has?',
    proposalAsk: 'The assistant has finished a proposal, but you have unsaved changes. Load the proposal and discard your changes? (Cancel keeps yours.)',
    leaveAsk: 'There are unsaved changes. Leave and lose them?',
    locked: 'While the server draws or the assistant writes, nothing can be edited.',
    refusedAt: (id) => `The server refused piece ${id}:`,
    refusedDesign: 'The server refused the design:',
    part: 'Part',
    mode: 'Mode',
    modeAuto: (m) => `Its section's (${m})`,
    lines: 'Lyrics shown',
    lineText: 'Text',
    lineStart: 'From (s)',
    lineEnd: 'To (s)',
    lineKeyword: 'Keyword',
    noKeyword: 'None',
    removeLine: 'Remove line',
    addFromSong: 'Add a line of the song',
    addFromSongNone: 'No lines of the song are left in this piece.',
    chooseLine: 'Choose a line…',
    addFree: 'Add your own text',
    freeHint: 'A text you write, with the moment it appears.',
    hit: 'Full-screen word',
    hitWord: 'Word',
    hitNone: 'None',
    hitAt: 'Appears at (s)',
    hitLength: 'Lasts (s)',
    extras: 'Extra parts',
    addExtra: 'Add',
    chooseExtra: 'Choose a part…',
    removeExtra: 'Remove',
    extrasFull: 'A piece carries three extra parts at most.',
    extrasNone: 'No extra parts.',
    stage: 'Stage',
    songDesign: "The song's design",
    ownDesign: "The piece's own design",
    noParts: 'The server has no parts.',
    split: 'Split',
    splitHint: 'Splits the piece at the playhead (S)',
    removePiece: 'Remove piece',
    removeExtraPart: 'Remove extra part',
    removeText: 'Remove text',
    removePieceHint: 'Empties the chosen piece: it is left blank and you can put whatever you want in its place (Del). If it is already empty, it is removed and its time goes to the one before',
    removeSlot: 'Remove slot',
    removeSlotHint: 'Removes the slot: its time goes to the piece before (Del)',
    newText: 'New text',
    tooShort: 'Each half must last at least half a second: move the playhead.',
    lastPiece: 'The last piece left cannot be removed.',
    alreadyHas: (p) => `This piece already draws "${p}".`,
    noRoom: 'An item does not fit there: another is in the way or less than half a second is free.',
    layersNotTaken: 'The server does not accept layers.',
    layersBlocked: 'The server does not accept layers: remove the layers to be able to save.',
    removeAllLayers: 'Remove all layers',
    textNotInLayer: 'A text does not go on a layer: drop it on a piece.',
    nothingSelected: 'Choose a piece first.',
  },
  inspector: {
    piece: (id) => `Piece ${id}`,
    extra: (n, part) => `Extra ${n}: ${part}`,
    song: "The song's design",
    part: 'Part',
    description: 'What it does',
    levels: 'Levels',
    replaced: (level) => `It does not support level ${level}: a simpler part replaces it when drawn`,
    notInCatalog: "This part is not in the server's catalog",
    params: 'Parameters',
    noParams: 'This part has no parameters.',
    mode: 'Mode',
    modes: { dark: 'Dark', light: 'Light' },
    modeFrom: { piece: 'set on the piece', section: "its section's", default: "the song's" },
    lines: 'Lyrics',
    noLines: 'No lyrics in this piece.',
    keyword: (w) => `keyword: ${w}`,
    hit: 'Full-screen word',
    noHit: 'None.',
    hitLine: (w, at, len) => `"${w}" at ${at} s, for ${len} s`,
    stage: 'Stage',
    noStage: 'No stage.',
    background: 'Background',
    character: (name, x, y, size, action) => `${name} at ${x}%, ${y}% · size ${size}%${action ? ` · ${action}` : ''}`,
    ownDesign: "The piece's own design",
    sameDesign: "Uses the song's design.",
    design: { colours: 'Colours', dark: 'Dark', light: 'Light', accent: 'Accent', fonts: 'Fonts', display: 'Headlines', body: 'Text', modes: 'Mode by section', defaultMode: 'Default mode', concept: 'Idea', verseStyle: 'Verse', hitStyle: 'Big word', none: 'plain' },
    animate: {
      title: 'Animation',
      animate: 'Animate',
      stop: 'Stop animating',
      removeAll: 'Remove all keyframes',
      atPlayhead: (v) => `At the playhead: ${v}`,
      keyframe: (n, t, v) => `Keyframe ${n}: ${v} at ${t}`,
      time: 'Second of the piece',
      timeItem: 'Second of the item',
      value: 'Value',
      ease: 'Towards the next one',
      eases: { linear: 'Linear', in: 'Starts slowly', out: 'Ends slowly', 'in-out': 'Slow at both ends', step: 'Jump' },
      removeKeyframe: 'Remove this keyframe',
      why: 'Only the parameters the part reads while it draws can be animated; the others are fixed when it loads.',
      unsupported: 'The server does not accept animated parameters: remove the keyframes to be able to save.',
      on: 'yes',
      off: 'no',
    },
    item: {
      title: (layer, n) => `Layer "${layer}", item ${n}`,
      part: 'Part',
      from: 'From (s)',
      to: 'To (s)',
      length: (s) => `Lasts ${s} s; it is drawn over every piece it touches.`,
      heavy: (parts, most) => `The page of some piece draws ${parts} parts (the server takes ${most}): the video will take longer.`,
      remove: 'Remove this item',
      removeLayer: 'Remove this layer and its items',
    },
    hint: 'Select a piece on the timeline or in the layers to edit it. Changes are saved with Save.',
  },
};

const TEXTS: Record<Lang, Texts> = { es, en };

export const textsFor = (lang: Lang): Texts => TEXTS[lang];
