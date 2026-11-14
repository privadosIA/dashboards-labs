import type { Lang } from '@lab/forms-kit';

import type { GenerationMode, KindId } from '../kinds/kinds';

/** What a kind says about itself: what its dataset holds, what generating it does, and what the suggestion emphasises. */
export interface KindTexts {
  name: string;
  what: string;
  does: string;
  emphasis: string;
}

/** Every text the studio's screens show, in each language (the shell's title and language label are the dashboard's own). Add a key here and TypeScript asks for both languages. */
export interface Texts {
  nav: { studio: string; presets: string; providers: string };
  loading: string;
  retry: string;
  unknownError: string;
  providersPage: { title: string; intro: string };
  page: {
    title: string;
    intro: string;
    stepKind: string;
    stepEngines: string;
    stepBrief: string;
    stepResult: string;
    steps: { brief: string; presets: string; generate: string; result: string };
    stepsLabel: string;
    stepDone: string;
    pinnedNote: (n: number) => string;
    openPresets: string;
    backToBrief: string;
    toBrief: string;
    assistantTitle: string;
    assistantHint: string;
    consent: (name: string, address: string) => string;
    generate: (examples: number) => string;
    generateAgain: (examples: number) => string;
    generating: (done: number, total: number) => string;
    stop: string;
    stopped: (n: number) => string;
    external: (name: string) => string;
    examplesNote: (n: number, pinned: boolean) => string;
    noExamples: string;
    noExamplesPinOnly: string;
    whyOff: { empty: string; noScenes: string; over: (limit: number) => string; noAssistant: string };
    assistantLine: (name: string, model: string) => string;
    assistantRouting: string;
    assistantChange: string;
    noAssistant: string;
    goProviders: string;
    kindMore: string;
    enginesChosen: (id: string) => string;
    warning: {
      'examples-inline': (n: number) => string;
      'kept-as-written': (line: number) => string;
      server: (detail: string) => string;
      'no-plan': string;
    };
    failure: Record<'busy' | 'refused' | 'unavailable' | 'consent' | 'unreachable', string>;
    failureWith: (reason: string, detail: string) => string;
    draftFound: string;
    restore: string;
    discard: string;
    songHint: string;
    presetBrief: string;
  };
  presetsPage: {
    title: string;
    intro: string;
    importTitle: string;
    importHint: string;
    chooseFile: string;
    importing: string;
    imported: (added: number, already: number, refused: number) => string;
    refusedAt: (index: number, reason: string) => string;
    notBundle: string;
    exportTitle: string;
    exportOwn: string;
    noOwn: string;
  };
  preview: {
    title: string;
    table: string;
    raw: string;
    rawHint: string;
    nothingCreated: string;
    checking: string;
    server: string;
    counts: { entries: string; imported: string; quiet: string; instrumental: string; rejected: string };
    unreadable: (reason: string) => string;
    rowUnread: string;
    previewFailed: (reason: string) => string;
    columns: { id: string; title: string; text: string; params: string };
    rejectedBecause: (reason: string) => string;
    empty: string;
    problems: string;
    plan: string;
    action: Record<'create' | 'exists' | 'keep-local' | 'impossible', string>;
    reasons: Record<string, string>;
    pieceParts: string;
  };
  actions: {
    title: string;
    download: string;
    create: string;
    creating: string;
    savePreset: string;
    presetSaved: (title: string) => string;
    presetFailed: (reason: string) => string;
    projectId: string;
    created: (n: number, id: string, studio: string) => string;
    studios: { video: string; music: string; motion: string; piece: string };
    imagesMode: string;
    pieceCreated: string;
    pieceNeedsSong: string;
    nothing: string;
    failures: Record<'rejected' | 'taken' | 'invalidName' | 'unreachable', string>;
  };
  presets: {
    title: string;
    kinds: Record<'image' | 'video' | 'motion' | 'music' | 'animation', string>;
    allKinds: string;
    tags: string;
    empty: string;
    count: (shown: number, total: number) => string;
    insert: string;
    pin: string;
    unpin: string;
    pinnedMax: (max: number) => string;
    pinnedTitle: string;
    delete: string;
    deleteFailed: (reason: string) => string;
    loadFailed: (reason: string) => string;
    source: (source: string, licence: string) => string;
    own: string;
    local: string;
    nsfw: string;
  };
  brief: {
    title: string;
    counter: (length: number, limit: number) => string;
    over: (limit: number) => string;
    scenes: (n: number) => string;
    calls: (n: number) => string;
    recommended: (model: string) => string;
    noRecommended: string;
    lookNote: string;
    placeholder: Record<GenerationMode, string>;
    styleLineHint: string;
  };
  engines: {
    title: string;
    loading: string;
    failed: (reason: string) => string;
    noModels: string;
    ready: string;
    stopped: string;
    starting: string;
    unavailable: string;
    start: string;
    starting_: string;
    startFailed: (reason: string) => string;
    sound: string;
    silent: string;
    clip: (seconds: number) => string;
    perClip: (seconds: number) => string;
    perPicture: (seconds: number) => string;
    noMeasurement: string;
    sourceServer: string;
    sourceHistory: string;
    sourceCatalog: (resolution: string, measured: boolean) => string;
    reasons: Record<string, string>;
    chromeOk: string;
    chromeMissing: string;
    parts: (n: number) => string;
    graphicsNote: string;
    pieceStyles: string;
    pieceLevels: string;
    pieceRates: string;
    pieceFeatures: string;
    videoNote: string;
    imagesNote: string;
    songsNote: string;
  };
  kind: { title: string; hint: string; kinds: Record<KindId, KindTexts>; mode: Record<GenerationMode, string>; modeWhy: Record<GenerationMode, string> };
}

const es: Texts = {
  nav: { studio: 'Estudio', presets: 'Presets', providers: 'Proveedores' },
  loading: 'Cargando…',
  retry: 'Reintentar',
  unknownError: 'Algo ha fallado.',
  providersPage: { title: 'Proveedores del asistente', intro: 'El proveedor y el modelo que escriben los datasets, para todo el estudio. Lo que elijas aquí es lo que usa Generar; el enrutado del servidor no se toca.' },
  page: {
    title: 'Generador de datasets',
    intro: 'Escribe una frase, mira el dataset que sale y solo entonces créalo.',
    stepKind: 'Tipo',
    stepEngines: 'Motores',
    stepBrief: 'Texto',
    stepResult: 'Resultado',
    steps: { brief: 'Texto', presets: 'Presets', generate: 'Generar', result: 'Resultado' },
    stepsLabel: 'Pasos del generador',
    stepDone: 'con contenido',
    pinnedNote: (n) => (n === 0 ? 'No has fijado ningún preset como ejemplo.' : n === 1 ? 'Has fijado 1 preset como ejemplo.' : `Has fijado ${n} presets como ejemplos.`),
    openPresets: 'Ver los presets',
    backToBrief: 'Volver al texto',
    toBrief: 'Ir al texto',
    assistantTitle: 'El asistente que escribe',
    assistantHint: 'Un proveedor y un modelo para esta generación: el enrutado del servidor no se toca. Uno externo pide tu consentimiento antes de enviar nada.',
    consent: (name, address) => `«${name}» no es este ordenador: lo que escribas (tu texto, los ejemplos y lo que haga falta para escribir el dataset) saldrá de esta máquina hacia ${address}. Solo se envía si aceptas.`,
    generate: (examples) => (examples ? `Generar (con ${examples === 1 ? '1 ejemplo' : `${examples} ejemplos`})` : 'Generar'),
    generateAgain: (examples) => (examples ? `Generar otra (con ${examples === 1 ? '1 ejemplo' : `${examples} ejemplos`})` : 'Generar otra'),
    generating: (done, total) => `Escribiendo… ${done} de ${total}`,
    stop: 'Parar',
    stopped: (n) => `Parado: se queda lo escrito hasta ahora (${n}).`,
    external: (name) => `«${name}» es externo: lo que escribas saldrá de esta máquina.`,
    examplesNote: (n, pinned) => (pinned ? (n === 1 ? 'Se envía el ejemplo que has fijado.' : `Se envían los ${n} ejemplos que has fijado.`) : n === 1 ? 'Se envía como ejemplo del estilo el preset que mejor encaja.' : `Se envían como ejemplos del estilo los ${n} presets que mejor encajan.`),
    noExamples: 'No se envía ningún ejemplo: ningún preset encaja y no has fijado ninguno.',
    noExamplesPinOnly: 'No se envía ningún ejemplo: este servidor no admite ejemplos elegidos por afinidad, y solo se envían los que tú fijas.',
    whyOff: { empty: 'Escribe algo para poder generar.', noScenes: 'Escribe al menos una línea que sea una escena (una línea «style:» no cuenta).', over: (limit) => `El texto pasa del límite de ${limit} caracteres.`, noAssistant: 'No hay un asistente elegido: ve a Proveedores.' },
    assistantLine: (name, model) => `Asistente: ${name}${model ? ` · ${model}` : ''}`,
    assistantRouting: 'como lo enruta el servidor',
    assistantChange: 'Cambiar',
    noAssistant: 'No hay ningún asistente elegido y no hay un Ollama al que hablar: elige o añade un proveedor en la pestaña Proveedores para poder generar.',
    goProviders: 'Ir a Proveedores',
    kindMore: 'Qué hace este tipo',
    enginesChosen: (id) => `motor elegido: ${id}`,
    warning: {
      'examples-inline': (n) => `Este servidor no admite ejemplos en las llamadas: se han añadido ${n} al texto, y el texto pasa a ser más largo.`,
      'kept-as-written': (line) => `El modelo no quiso escribir la línea ${line}: se queda como la escribiste.`,
      server: (detail) => `El servidor avisa: ${detail}`,
      'no-plan': 'Este servidor no tiene el plan de piezas: escribe el fichero a mano o usa otro servidor.',
    },
    failure: {
      busy: 'El servidor está dibujando otra cosa: espera a que acabe.',
      refused: 'El modelo no ha querido escribirlo: prueba con otro texto u otro modelo.',
      unavailable: 'No hay asistente disponible (¿Ollama sin el modelo o sin memoria?).',
      consent: 'Falta tu consentimiento para usar ese proveedor.',
      unreachable: 'No se llega al servidor. Revisa la conexión.',
    },
    failureWith: (reason, detail) => (detail ? `${reason} (${detail})` : reason),
    draftFound: 'Hay un borrador de la última vez.',
    restore: 'Recuperarlo',
    discard: 'Descartarlo',
    songHint: 'Una canción por generación: para añadir otra, cambia el texto y genera otra vez.',
    presetBrief: 'Se guarda el texto, el negativo, el aspecto y el tipo.',
  },
  presetsPage: {
    title: 'Presets de prompts',
    intro: 'La biblioteca para rellenar el texto y para dar ejemplos de estilo al asistente.',
    importTitle: 'Importar un paquete',
    importHint: 'Un fichero prompt-presets: cada entrada necesita su fuente y su licencia, y la que no las tenga se rechaza.',
    chooseFile: 'Elegir paquete',
    importing: 'Importando…',
    imported: (added, already, refused) => `Importado: ${added} nuevos, ${already} ya estaban, ${refused} rechazados.`,
    refusedAt: (index, reason) => (index < 0 ? reason : `Entrada ${index + 1}: ${reason}`),
    notBundle: 'Ese fichero no es un paquete de presets.',
    exportTitle: 'Exportar los tuyos',
    exportOwn: 'Exportar mis presets',
    noOwn: 'Todavía no tienes presets propios.',
  },
  preview: {
    title: 'Vista previa',
    table: 'Entradas',
    raw: 'El fichero',
    rawHint: 'Edita cualquiera de los dos: se mantienen a la par. Una línea que no se entiende se queda tal cual y se marca.',
    nothingCreated: 'Aquí no se crea nada.',
    checking: 'El servidor lo está leyendo…',
    server: 'Lo que ha entendido el servidor',
    counts: { entries: 'Entradas', imported: 'Importadas', quiet: 'Sin voz', instrumental: 'Instrumentales', rejected: 'Rechazadas' },
    unreadable: (reason) => `El fichero no se puede leer: ${reason}`,
    rowUnread: 'No se entiende esta línea',
    previewFailed: (reason) => `El servidor no ha podido leerlo: ${reason}`,
    columns: { id: 'Id', title: 'Título', text: 'Descripción', params: 'Parámetros' },
    rejectedBecause: (reason) => `Rechazada: ${reason}`,
    empty: 'Todavía no hay nada que ver: genera un dataset.',
    problems: 'Problemas del fichero',
    plan: 'Lo que haría la importación',
    action: { create: 'Se crearía', exists: 'Ya existe', 'keep-local': 'Se guardaría en el navegador', impossible: 'No se puede' },
    reasons: {
      'song-missing': 'la canción no está en la biblioteca: hazla en Música y elígela',
      'parts-missing': 'faltan partes del catálogo',
      'part-no-text': 'la parte no existe y el fichero no trae su texto',
      'draft-invalid': 'el borrador de la parte no es válido',
      'no-address': 'la referencia no tiene dirección',
      'no-ready-reference': 'no hay una referencia lista',
      fitted: 'el guion se ajusta a otra canción',
      'animate-unsupported': 'el servidor no admite fotogramas clave',
      'layers-unsupported': 'el servidor no admite capas',
    },
    pieceParts: 'Las partes que el catálogo no tiene se listan con la petición que pide su borrador.',
  },
  actions: {
    title: 'Qué hacer con él',
    download: 'Descargar',
    create: 'Crear el proyecto',
    creating: 'Creando…',
    savePreset: 'Guardar como preset',
    presetSaved: (title) => `Guardado como preset: «${title}».`,
    presetFailed: (reason) => `No se pudo guardar: ${reason}`,
    projectId: 'Nombre del proyecto',
    created: (n, id, studio) => `${n === 1 ? 'Se ha creado 1 entrada' : `Se han creado ${n} entradas`} en el proyecto ${id}. Lo encuentras en ${studio}.`,
    studios: { video: 'el estudio de Vídeo', music: 'el estudio de Música', motion: 'el estudio de Vídeo', piece: 'Motion Edit' },
    imagesMode: 'Se crea como un proyecto de imágenes (output.mode: images): la importación lo pone, no hay que cambiarlo a mano.',
    pieceCreated: 'La importación ha terminado: lee el informe de arriba.',
    pieceNeedsSong: 'La canción de esta pieza todavía no existe: hazla en el estudio de Música y vuelve a generar o edita el fichero.',
    nothing: 'No hay nada que crear.',
    failures: {
      rejected: 'El servidor no ha podido leer ese dataset.',
      taken: 'Ya hay un proyecto con ese nombre: elige otro. No se ha creado nada.',
      invalidName: 'Ese nombre no vale: usa letras, números y «._-».',
      unreachable: 'No se llega al servidor. Revisa la conexión.',
    },
  },
  presets: {
    title: 'Presets de prompts',
    kinds: { image: 'Imágenes', video: 'Vídeo', motion: 'Gráficos', music: 'Canciones', animation: 'Pieza animada' },
    allKinds: 'Todos',
    tags: 'Etiquetas',
    empty: 'Ningún preset encaja con esa búsqueda.',
    count: (shown, total) => (shown === total ? `${total} presets` : `${shown} de ${total} presets`),
    insert: 'Insertar',
    pin: 'Fijar como ejemplo',
    unpin: 'Quitar el ejemplo',
    pinnedMax: (max) => `Ya hay ${max} ejemplos fijados: quita uno para fijar otro.`,
    pinnedTitle: 'Ejemplos fijados',
    delete: 'Borrar',
    deleteFailed: (reason) => `No se pudo borrar: ${reason}`,
    loadFailed: (reason) => `No se pudieron leer los presets: ${reason}`,
    source: (source, licence) => `${source} · ${licence}`,
    own: 'Tuyo',
    local: 'Sin la biblioteca del servidor: se ven los de muestra y los tuyos, guardados en este navegador.',
    nsfw: 'Para adultos',
  },
  brief: {
    title: 'El texto',
    counter: (length, limit) => `${length} / ${limit}`,
    over: (limit) => `El texto pasa del límite de ${limit} caracteres: acórtalo para poder generar.`,
    scenes: (n) => (n === 1 ? '1 escena' : `${n} escenas`),
    calls: (n) => (n === 1 ? '1 llamada al asistente' : `${n} llamadas al asistente`),
    recommended: (model) => `Modelo recomendado entre los instalados: ${model}.`,
    noRecommended: 'Ningún modelo instalado encaja con este aspecto: se queda el que tengas elegido.',
    lookNote: 'Un aspecto son palabras (en la línea «style:» del final, que puedes editar) más un modelo recomendado.',
    placeholder: {
      lines: 'Una línea por escena:\nLa colmena al amanecer, plano general\nLa abeja dice «buenos días» en una flor\n- plano mudo del prado',
      sentence: 'Una frase: «un explicativo de 60 segundos sobre cómo hacen miel las abejas, tranquilo, documental, cinco o seis escenas»',
      plan: 'Una frase: «un videoclip minimalista sobre una ciudad que despierta»',
      track: 'Una canción: «un tema de verano, guitarra y palmas, alegre, en español»',
    },
    styleLineHint: 'Una línea que empieza por «style:» no es una escena: da palabras de estilo a todas.',
  },
  engines: {
    title: 'Motores de este servidor',
    loading: 'Preguntando al servidor…',
    failed: (reason) => `No se pudo leer: ${reason}`,
    noModels: 'No hay modelos de imagen instalados en este servidor.',
    ready: 'Disponible',
    stopped: 'Parado',
    starting: 'Arrancando',
    unavailable: 'No disponible',
    start: 'Arrancar',
    starting_: 'Arrancando…',
    startFailed: (reason) => `No se pudo arrancar: ${reason}`,
    sound: 'Escribe el sonido',
    silent: 'Sin sonido',
    clip: (seconds) => `clip de ${seconds} s`,
    perClip: (seconds) => `≈ ${seconds} s por clip a la mejor calidad`,
    perPicture: (seconds) => `≈ ${seconds} s por imagen`,
    noMeasurement: 'Aún no hay medición en esta máquina',
    sourceServer: 'según el servidor',
    sourceHistory: 'mediana de tus ejecuciones',
    sourceCatalog: (resolution, measured) => `tabla del catálogo${resolution ? ` a ${resolution}` : ''}, ${measured ? 'medida' : 'estimada'}`,
    reasons: {
      no_gpu: 'no hay una tarjeta con memoria libre',
      not_running: 'el servicio está parado',
      no_consent: 'falta tu consentimiento',
      no_service: 'no hay servicio configurado',
      no_weights: 'faltan los pesos del modelo',
      unreachable: 'el servicio no responde',
      key_rejected: 'el servicio rechaza la clave',
    },
    chromeOk: 'Chrome está en este servidor: dibujará los gráficos al ejecutar.',
    chromeMissing: 'No hay Chrome en este servidor: los gráficos no se podrán dibujar.',
    parts: (n) => (n === 1 ? 'El catálogo tiene 1 parte' : `El catálogo tiene ${n} partes`),
    graphicsNote: 'Un gráfico hecho con una parte del catálogo no necesita ningún modelo.',
    pieceStyles: 'Estilos',
    pieceLevels: 'Niveles',
    pieceRates: 'Fotogramas por segundo',
    pieceFeatures: 'Lo que admite el servidor',
    videoNote: 'El dataset no lleva el motor: lo lleva el proyecto. Aquí se ve qué puede hacer esta máquina ahora.',
    imagesNote: 'El modelo elegido quedará como defaults.model, comentado, para que lo rellenes al crear el proyecto.',
    songsNote: 'El motor elegido da forma al estilo y a las etiquetas de cada pista.',
  },
  kind: {
    title: 'Qué quieres escribir',
    hint: 'Elige el tipo de dataset. Aquí solo se escribe y se revisa: nada se crea hasta que lo pidas.',
    kinds: {
      video: {
        name: 'Escenas de vídeo',
        what: 'Una lista de escenas: la descripción de cada imagen, con su diálogo, su movimiento y su negativo en líneas con marca (Dialogue:, Motion:, Negative:…).',
        does: 'Al crearlo, cada escena se dibuja y se anima con el motor de vídeo que elijas, y la voz se sintetiza si hay diálogo.',
        emphasis: 'La sugerencia insiste en la imagen inicial de cada plano, el movimiento de cámara y lo que se dice.',
      },
      images: {
        name: 'Imágenes',
        what: 'Una lista de imágenes: igual que las escenas, pero el proyecto se ejecuta en modo imágenes y cada una puede tener varias variantes (Variants:).',
        does: 'Al crearlo, cada entrada genera sus imágenes con el modelo elegido; no hay vídeo ni voz.',
        emphasis: 'La sugerencia insiste en el sujeto, la luz, el encuadre y el estilo, y en lo que NO debe salir.',
      },
      graphics: {
        name: 'Gráficos animados',
        what: 'Una lista de gráficos: una página animada o una parte del catálogo, con su duración, sus superposiciones y sus parámetros (Graphic:, Part:, Param…).',
        does: 'Al crearlo, Chrome dibuja cada gráfico cuando el proyecto se ejecuta; una parte del catálogo no necesita ningún modelo.',
        emphasis: 'La sugerencia insiste en el tiempo y en las superposiciones.',
      },
      songs: {
        name: 'Canciones',
        what: 'Una lista de pistas: el estilo, la letra con sus secciones y las etiquetas en el vocabulario del generador (Lyrics:, Tags:, Instrumental…).',
        does: 'Al crearlo, cada pista se genera con el motor de música elegido; se escribe una pista por generación y se añaden más generando otra vez.',
        emphasis: 'La sugerencia insiste en el género, el ánimo y las etiquetas que entiende el motor elegido.',
      },
      piece: {
        name: 'Pieza animada',
        what: 'Un fichero music-motion-dataset: la canción, las opciones de animación y las partes que hacen falta, sin guion.',
        does: 'Al crearlo, la canción y la pieza se preparan en Animación; el guion lo escribe el proponente del servidor cuando la canción existe.',
        emphasis: 'La sugerencia insiste en el concepto, el estilo y las partes que merece la pena tener.',
      },
    },
    mode: { lines: 'Una línea por escena', sentence: 'Una frase', plan: 'Una frase, plan del servidor', track: 'Una pista por generación' },
    modeWhy: {
      lines: 'El servidor todavía no escribe un dataset entero desde una frase: cada línea del texto es una escena y se amplía por separado.',
      sentence: 'El servidor escribe el dataset entero desde tu frase, con su gramática de marcas.',
      plan: 'El servidor planea la pieza desde tu frase; el guion llega después.',
      track: 'El servidor escribe una pista por llamada, con el vocabulario del generador.',
    },
  },
};

const en: Texts = {
  nav: { studio: 'Studio', presets: 'Presets', providers: 'Providers' },
  loading: 'Loading…',
  retry: 'Retry',
  unknownError: 'Something went wrong.',
  providersPage: { title: 'Assistant providers', intro: 'The provider and model that write the datasets, for the whole studio. What you choose here is what Generate uses; the server\'s routing is never changed.' },
  page: {
    title: 'Dataset generator',
    intro: 'Write a sentence, read the dataset that comes out and only then create it.',
    stepKind: 'Kind',
    stepEngines: 'Engines',
    stepBrief: 'Brief',
    stepResult: 'Result',
    steps: { brief: 'Brief', presets: 'Presets', generate: 'Generate', result: 'Result' },
    stepsLabel: 'Generator steps',
    stepDone: 'has content',
    pinnedNote: (n) => (n === 0 ? 'No preset is pinned as an example.' : n === 1 ? '1 preset is pinned as an example.' : `${n} presets are pinned as examples.`),
    openPresets: 'See the presets',
    backToBrief: 'Back to the brief',
    toBrief: 'Go to the brief',
    assistantTitle: 'The assistant that writes',
    assistantHint: 'One provider and model for this generation: the server\'s routing is never changed. An external one asks for your consent before anything is sent.',
    consent: (name, address) => `"${name}" is not this computer: what you write (your text, the examples and what is needed to write the dataset) will leave this machine for ${address}. It is sent only if you accept.`,
    generate: (examples) => (examples ? `Generate (with ${examples === 1 ? '1 example' : `${examples} examples`})` : 'Generate'),
    generateAgain: (examples) => (examples ? `Generate another (with ${examples === 1 ? '1 example' : `${examples} examples`})` : 'Generate another'),
    generating: (done, total) => `Writing… ${done} of ${total}`,
    stop: 'Stop',
    stopped: (n) => `Stopped: what was written so far stays (${n}).`,
    external: (name) => `"${name}" is external: what you write will leave this machine.`,
    examplesNote: (n, pinned) => (pinned ? (n === 1 ? 'The example you pinned is sent.' : `The ${n} examples you pinned are sent.`) : n === 1 ? 'The preset that matches best is sent as an example of the style.' : `The ${n} presets that match best are sent as examples of the style.`),
    noExamples: 'No example is sent: no preset matches and none is pinned.',
    noExamplesPinOnly: 'No example is sent: this server does not take examples picked by match, and only the ones you pin are sent.',
    whyOff: { empty: 'Write something to generate.', noScenes: 'Write at least one line that is a scene (a «style:» line does not count).', over: (limit) => `The brief is over the ${limit}-character limit.`, noAssistant: 'No assistant is chosen: go to Providers.' },
    assistantLine: (name, model) => `Assistant: ${name}${model ? ` · ${model}` : ''}`,
    assistantRouting: 'as the server routes it',
    assistantChange: 'Change',
    noAssistant: 'No assistant is chosen and there is no Ollama to talk to: choose or add a provider in the Providers tab to be able to generate.',
    goProviders: 'Go to Providers',
    kindMore: 'What this kind does',
    enginesChosen: (id) => `engine chosen: ${id}`,
    warning: {
      'examples-inline': (n) => `This server does not take examples on its calls: ${n} were added to the text, which is now longer.`,
      'kept-as-written': (line) => `The model would not write line ${line}: it stays as you wrote it.`,
      server: (detail) => `The server warns: ${detail}`,
      'no-plan': 'This server has no plan for pieces: write the file by hand or use another server.',
    },
    failure: {
      busy: 'The server is drawing something else: wait for it to finish.',
      refused: 'The model would not write it: try another text or another model.',
      unavailable: 'No assistant is available (Ollama without the model, or without memory?).',
      consent: 'Your consent to use that provider is missing.',
      unreachable: 'The server cannot be reached. Check the connection.',
    },
    failureWith: (reason, detail) => (detail ? `${reason} (${detail})` : reason),
    draftFound: 'There is a draft from last time.',
    restore: 'Restore it',
    discard: 'Discard it',
    songHint: 'One song per generation: to add another, change the text and generate again.',
    presetBrief: 'The brief, the negative, the look and the kind are kept.',
  },
  presetsPage: {
    title: 'Prompt presets',
    intro: 'The library to fill the brief from, and to give the assistant examples of the style.',
    importTitle: 'Import a bundle',
    importHint: 'A prompt-presets file: each entry needs its source and its licence, and one without them is refused.',
    chooseFile: 'Choose a bundle',
    importing: 'Importing…',
    imported: (added, already, refused) => `Imported: ${added} new, ${already} were already there, ${refused} refused.`,
    refusedAt: (index, reason) => (index < 0 ? reason : `Entry ${index + 1}: ${reason}`),
    notBundle: 'That file is not a bundle of presets.',
    exportTitle: 'Export your own',
    exportOwn: 'Export my presets',
    noOwn: 'You have no presets of your own yet.',
  },
  preview: {
    title: 'Preview',
    table: 'Entries',
    raw: 'The file',
    rawHint: 'Edit either one: they are kept in step. A line that cannot be read stays as it is and is marked.',
    nothingCreated: 'Nothing is created here.',
    checking: 'The server is reading it…',
    server: 'What the server understood',
    counts: { entries: 'Entries', imported: 'Imported', quiet: 'Silent', instrumental: 'Instrumental', rejected: 'Rejected' },
    unreadable: (reason) => `The file cannot be read: ${reason}`,
    rowUnread: 'This line cannot be read',
    previewFailed: (reason) => `The server could not read it: ${reason}`,
    columns: { id: 'Id', title: 'Title', text: 'Description', params: 'Parameters' },
    rejectedBecause: (reason) => `Rejected: ${reason}`,
    empty: 'Nothing to see yet: generate a dataset.',
    problems: 'Problems in the file',
    plan: 'What the import would do',
    action: { create: 'Would be created', exists: 'Already there', 'keep-local': 'Would be kept in the browser', impossible: 'Cannot be done' },
    reasons: {
      'song-missing': 'the song is not in the library: make it in Music and choose it',
      'parts-missing': 'parts of the catalog are missing',
      'part-no-text': 'the part does not exist and the file brings no text for it',
      'draft-invalid': 'the draft of the part is not valid',
      'no-address': 'the reference has no address',
      'no-ready-reference': 'there is no ready reference',
      fitted: 'the script is fitted to another song',
      'animate-unsupported': 'the server does not take keyframes',
      'layers-unsupported': 'the server does not take layers',
    },
    pieceParts: 'Parts the catalog lacks are listed with the request that asks for their draft.',
  },
  actions: {
    title: 'What to do with it',
    download: 'Download',
    create: 'Create the project',
    creating: 'Creating…',
    savePreset: 'Save as preset',
    presetSaved: (title) => `Saved as a preset: “${title}”.`,
    presetFailed: (reason) => `Could not save it: ${reason}`,
    projectId: 'Project name',
    created: (n, id, studio) => `${n === 1 ? '1 entry was' : `${n} entries were`} created in the project ${id}. You will find it in ${studio}.`,
    studios: { video: 'the Video studio', music: 'the Music studio', motion: 'the Video studio', piece: 'Motion Edit' },
    imagesMode: 'It is created as an images project (output.mode: images): the import sets it, nothing to change by hand.',
    pieceCreated: 'The import has finished: read the report above.',
    pieceNeedsSong: 'This piece\'s song does not exist yet: make it in the Music studio and generate again, or edit the file.',
    nothing: 'There is nothing to create.',
    failures: {
      rejected: 'The server could not read that dataset.',
      taken: 'There is already a project with that name: choose another. Nothing was created.',
      invalidName: 'That name is not valid: use letters, numbers and “._-”.',
      unreachable: 'The server cannot be reached. Check the connection.',
    },
  },
  presets: {
    title: 'Prompt presets',
    kinds: { image: 'Images', video: 'Video', motion: 'Graphics', music: 'Songs', animation: 'Animated piece' },
    allKinds: 'All',
    tags: 'Tags',
    empty: 'No preset matches that search.',
    count: (shown, total) => (shown === total ? `${total} presets` : `${shown} of ${total} presets`),
    insert: 'Insert',
    pin: 'Pin as example',
    unpin: 'Unpin the example',
    pinnedMax: (max) => `${max} examples are already pinned: unpin one to pin another.`,
    pinnedTitle: 'Pinned examples',
    delete: 'Delete',
    deleteFailed: (reason) => `Could not delete it: ${reason}`,
    loadFailed: (reason) => `Could not read the presets: ${reason}`,
    source: (source, licence) => `${source} · ${licence}`,
    own: 'Yours',
    local: 'No library on the server: the sample and your own are shown, kept in this browser.',
    nsfw: 'Adult',
  },
  brief: {
    title: 'The brief',
    counter: (length, limit) => `${length} / ${limit}`,
    over: (limit) => `The brief is over the ${limit}-character limit: shorten it to generate.`,
    scenes: (n) => (n === 1 ? '1 scene' : `${n} scenes`),
    calls: (n) => (n === 1 ? '1 assistant call' : `${n} assistant calls`),
    recommended: (model) => `Recommended model among the installed ones: ${model}.`,
    noRecommended: 'No installed model suits this look: the one you have chosen stays.',
    lookNote: 'A look is words (in the «style:» line at the end, which you can edit) plus a recommended model.',
    placeholder: {
      lines: 'One line per scene:\nThe hive at dawn, wide shot\nThe bee says "good morning" on a flower\n- a silent shot of the meadow',
      sentence: 'One sentence: "a 60-second explainer about how bees make honey, calm, documentary, five or six scenes"',
      plan: 'One sentence: "a minimalist music video about a city waking up"',
      track: 'One song: "a summer tune, guitar and handclaps, cheerful, in Spanish"',
    },
    styleLineHint: 'A line starting with «style:» is not a scene: it gives style words to all of them.',
  },
  engines: {
    title: 'This server\'s engines',
    loading: 'Asking the server…',
    failed: (reason) => `Could not read it: ${reason}`,
    noModels: 'No image models are installed on this server.',
    ready: 'Available',
    stopped: 'Stopped',
    starting: 'Starting',
    unavailable: 'Not available',
    start: 'Start',
    starting_: 'Starting…',
    startFailed: (reason) => `Could not start it: ${reason}`,
    sound: 'Writes the sound',
    silent: 'No sound',
    clip: (seconds) => `${seconds} s clip`,
    perClip: (seconds) => `≈ ${seconds} s per clip at best quality`,
    perPicture: (seconds) => `≈ ${seconds} s per picture`,
    noMeasurement: 'No measurement yet on this machine',
    sourceServer: 'from the server',
    sourceHistory: 'median of your runs',
    sourceCatalog: (resolution, measured) => `catalog table${resolution ? ` at ${resolution}` : ''}, ${measured ? 'measured' : 'estimated'}`,
    reasons: {
      no_gpu: 'no card with free memory',
      not_running: 'the service is stopped',
      no_consent: 'your consent is missing',
      no_service: 'no service is configured',
      no_weights: 'the model weights are missing',
      unreachable: 'the service does not answer',
      key_rejected: 'the service rejects the key',
    },
    chromeOk: 'Chrome is on this server: it will draw the graphics when the project runs.',
    chromeMissing: 'There is no Chrome on this server: the graphics could not be drawn.',
    parts: (n) => (n === 1 ? 'The catalog has 1 part' : `The catalog has ${n} parts`),
    graphicsNote: 'A graphic made from a part of the catalog needs no model at all.',
    pieceStyles: 'Styles',
    pieceLevels: 'Levels',
    pieceRates: 'Frames per second',
    pieceFeatures: 'What the server supports',
    videoNote: 'The dataset carries no engine: the project does. This shows what this machine can do now.',
    imagesNote: 'The chosen model will be left as a commented defaults.model for you to fill when the project is created.',
    songsNote: 'The chosen engine shapes the style and the tags of each track.',
  },
  kind: {
    title: 'What do you want to write',
    hint: 'Choose the kind of dataset. Here you only write and read: nothing is created until you ask.',
    kinds: {
      video: {
        name: 'Video scenes',
        what: 'A list of scenes: the description of each picture, with its dialogue, its motion and its negative in marker lines (Dialogue:, Motion:, Negative:…).',
        does: 'When created, each scene is drawn and animated with the video engine you choose, and the voice is synthesised when there is dialogue.',
        emphasis: 'The suggestion stresses the first picture of each shot, the camera movement and what is said.',
      },
      images: {
        name: 'Images',
        what: 'A list of pictures: like scenes, but the project runs in images mode and each one can have several variants (Variants:).',
        does: 'When created, each entry makes its pictures with the model you choose; there is no video and no voice.',
        emphasis: 'The suggestion stresses the subject, the light, the framing and the style, and what must NOT appear.',
      },
      graphics: {
        name: 'Animated graphics',
        what: 'A list of graphics: an animated page or a part of the catalog, with its duration, its overlays and its parameters (Graphic:, Part:, Param…).',
        does: 'When created, Chrome draws each graphic when the project runs; a part of the catalog needs no model at all.',
        emphasis: 'The suggestion stresses timing and overlays.',
      },
      songs: {
        name: 'Songs',
        what: 'A list of tracks: the style, the lyrics with their sections and the tags in the generator\'s vocabulary (Lyrics:, Tags:, Instrumental…).',
        does: 'When created, each track is made with the music engine you choose; one track is written per generation and more are added by generating again.',
        emphasis: 'The suggestion stresses genre, mood and the tags the chosen engine understands.',
      },
      piece: {
        name: 'Animated piece',
        what: 'A music-motion-dataset file: the song, the animation choices and the parts that are needed, without a script.',
        does: 'When created, the song and the piece are prepared in Animation; the script is written by the server\'s proposer once the song exists.',
        emphasis: 'The suggestion stresses the concept, the style and the parts worth having.',
      },
    },
    mode: { lines: 'One line per scene', sentence: 'One sentence', plan: 'One sentence, the server\'s plan', track: 'One track per generation' },
    modeWhy: {
      lines: 'The server does not yet write a whole dataset from one sentence: each line of the text is a scene and is expanded on its own.',
      sentence: 'The server writes the whole dataset from your sentence, in its own marker grammar.',
      plan: 'The server plans the piece from your sentence; the script comes later.',
      track: 'The server writes one track per call, in the generator\'s vocabulary.',
    },
  },
};

const TEXTS: Record<Lang, Texts> = { es, en };

export const textsFor = (lang: Lang): Texts => TEXTS[lang];
