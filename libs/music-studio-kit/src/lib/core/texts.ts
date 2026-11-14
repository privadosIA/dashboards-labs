import type { Lang } from '@lab/forms-kit';

/** What can stop a song from being generated, in the words of a list of things to do. */
type Blocker = 'title.required' | 'title.tooLong' | 'lyrics.required' | 'style.required' | 'prompt.required' | 'prompt.tooLong' | 'generator.unavailable';

/** Every text the dashboard shows outside its forms, in each language. Add a key here and TypeScript asks for both languages. */
export interface Texts {
  title: string;
  language: string;
  loading: string;
  retry: string;
  unknownError: string;
  studio: {
    composerLabel: string;
    songsTitle: string;
  };
  composer: {
    modeLabel: string;
    easy: string;
    custom: string;
    generate: string;
    generating: string;
    /** "To generate:" and then the things still to do, joined with commas. */
    toGenerate: string;
    todo: Record<Blocker, string>;
    unavailable: string;
    stopped: string;
    start: string;
    starting: string;
    engineReasons: Record<string, string>;
    unknownReason: string;
    refused: string;
    failed: string;
  };
  capture: {
    title: string;
    hint: string;
    button: string;
    listening: string;
    heardTitle: string;
    /** "{bpm} BPM": `{bpm}` is replaced by the tempo. */
    tempo: string;
    added: string;
    noTags: string;
    noGenre: string;
    fromUrl: string;
    methods: Record<'whisper' | 'clap' | 'muq', string>;
    reasons: Record<string, string>;
    unknownReason: string;
    errors: Record<'unavailable' | 'busy' | 'tooLong' | 'unreadable' | 'timeout' | 'badUrl' | 'unknown', string>;
  };
  ai: {
    example: string;
    title: string;
    description: string;
    close: string;
    replaces: string;
    tipsTitle: string;
    tips: [string, string, string, string];
    generate: string;
  };
  custom: {
    structureTags: string;
    structureTagsHint: string;
    aiGenerator: string;
    writing: string;
    errors: Record<'unavailable' | 'busy' | 'refused' | 'unknown', string>;
  };
  songs: {
    loading: string;
    empty: string;
    emptyHint: string;
    queued: string;
    /** "In queue, position {n}": `{n}` is replaced by the position. */
    queuedAt: string;
    running: string;
    cancelled: string;
    cancel: string;
    retry: string;
    download: string;
    remove: string;
    player: string;
    actionFailed: string;
  };
  confirm: {
    title: string;
    message: string;
    cancel: string;
    remove: string;
  };
  engines: {
    /** The header button and the title of the panel. */
    button: string;
    title: string;
    lead: string;
    close: string;
    /** What each engine is for. */
    roles: Record<'heartmula' | 'diffrhythm2' | 'clap' | 'muq', string>;
    states: Record<'running' | 'starting' | 'stopped' | 'ready' | 'unavailable', string>;
    start: string;
    stop: string;
    reasons: Record<string, string>;
    unknownReason: string;
    /** What a refused start or stop says: a run uses the engine, the server cannot run it, or nothing answered. */
    errors: Record<'busy' | 'refused' | 'failed', string>;
    unreadable: string;
    /** The link of the capture dialog that opens the panel. */
    open: string;
  };
  easy: {
    examples: string;
    exampleList: [string, string, string];
    instrumental: string;
    instrumentalHint: string;
  };
  style: {
    pick: string;
    done: string;
    popular: string;
    categories: Record<string, string>;
  };
}

const es: Texts = {
  title: 'Music Studio',
  language: 'Idioma',
  loading: 'Cargando…',
  retry: 'Reintentar',
  unknownError: 'No se pudo hablar con el servidor.',
  studio: {
    composerLabel: 'Crear una canción',
    songsTitle: 'Mis canciones',
  },
  composer: {
    modeLabel: 'Modo',
    easy: 'Fácil',
    custom: 'Personalizado',
    generate: 'Generar',
    generating: 'Generando…',
    toGenerate: 'Para generar:',
    todo: {
      'title.required': 'escribe el título',
      'title.tooLong': 'acorta el título',
      'lyrics.required': 'escribe la letra',
      'style.required': 'elige al menos una etiqueta de estilo',
      'prompt.required': 'describe la música',
      'prompt.tooLong': 'acorta la descripción',
      'generator.unavailable': 'elige un generador disponible',
    },
    unavailable: '(no disponible)',
    stopped: '(parado)',
    start: 'Arrancar el generador',
    starting: 'Arrancando…',
    engineReasons: {
      no_weights: 'Faltan los pesos del modelo.',
      no_gpu: 'No hay una tarjeta con memoria libre.',
      unreachable: 'El servicio del generador no responde.',
      no_consent: 'Falta aceptar su uso en los ajustes del servidor.',
      key_rejected: 'El servicio rechazó la clave.',
      not_running: 'El generador está parado: arráncalo desde el servidor.',
    },
    unknownReason: 'El servidor no puede usarlo ahora.',
    refused: 'El servidor no acepta esta canción.',
    failed: 'No se pudo pedir la canción al servidor.',
  },
  capture: {
    title: 'Capturar el estilo de una canción o un vídeo',
    hint: 'Importa un audio o un vídeo, o pega un enlace de YouTube: el servidor lo escucha y el estilo que oiga se añade al del formulario.',
    button: 'Importar',
    listening: 'Escuchando…',
    heardTitle: 'Suena así:',
    tempo: '{bpm} BPM',
    added: 'Añadido al estilo:',
    noTags: 'No se reconoció ninguna etiqueta del vocabulario: el estilo no ha cambiado.',
    noGenre: 'El asistente no supo ponerle género: esto describe solo el sonido.',
    fromUrl: 'Capturar de YouTube',
    methods: {
      whisper: 'Letra (Whisper)',
      clap: 'Sonido (LAION-CLAP)',
      muq: 'Sonido y estilo (MuQ-MuLan)',
    },
    reasons: { not_running: 'no está en marcha', no_service: 'sin servicio', no_weights: 'faltan los pesos', unreachable: 'no responde' },
    unknownReason: 'no disponible',
    errors: {
      unavailable: 'El servidor no puede escuchar ahora (le falta el modelo de voz o el asistente).',
      busy: 'El servidor está ocupado con otra tarea; prueba en un momento.',
      tooLong: 'El archivo es demasiado largo o pesado para escucharlo.',
      unreadable: 'No se pudo leer ese archivo: prueba con un audio o un vídeo normal.',
      timeout: 'Tardó demasiado en escucharlo.',
      badUrl: 'Solo se aceptan direcciones de un vídeo de YouTube (no listas).',
      unknown: 'No se pudo escuchar el archivo.',
    },
  },
  ai: {
    example: 'Ej.: una canción de desamor sobre la lluvia de verano…',
    title: 'Generador de letras con IA',
    description: 'Describe la letra que quieres generar.',
    close: 'Cerrar',
    replaces: 'La letra que hay ahora se sustituirá por la nueva.',
    tipsTitle: 'Consejos para mejores resultados:',
    tips: [
      'Incluye el tono emocional (triste, alegre, enérgico, romántico)',
      'Menciona la historia o el tema que quieres transmitir',
      'Indica el género o estilo musical si tienes preferencia',
      'Añade escenarios o imágenes concretas que quieras incluir',
    ],
    generate: 'Generar letra',
  },
  custom: {
    structureTags: 'Etiquetas de estructura',
    structureTagsHint: 'Se inserta en la letra, en una línea propia.',
    aiGenerator: 'Generador IA',
    writing: 'Escribiendo…',
    errors: {
      unavailable: 'El asistente no está disponible en el servidor (hace falta Ollama).',
      busy: 'El servidor está ocupado con otra tarea; prueba en un momento.',
      refused: 'El modelo del asistente se negó a escribirlo. Prueba con otro texto.',
      unknown: 'No se pudo hablar con el asistente.',
    },
  },
  songs: {
    loading: 'Cargando tus canciones…',
    empty: 'Aún no hay canciones',
    emptyHint: 'Escribe una canción y pulsa «Generar» para crear la primera.',
    queued: 'En cola',
    queuedAt: 'En cola, puesto {n}',
    running: 'Generando…',
    cancelled: 'Cancelada',
    cancel: 'Cancelar',
    retry: 'Reintentar',
    download: 'Descargar',
    remove: 'Borrar',
    player: 'Reproducir',
    actionFailed: 'No se pudo hacer. Inténtalo de nuevo.',
  },
  confirm: {
    title: '¿Borrar la canción?',
    message: 'Se borra del servidor y no se puede recuperar.',
    cancel: 'Cancelar',
    remove: 'Borrar',
  },
  engines: {
    button: 'Motores',
    title: 'Motores de música',
    lead: 'Lo que el servidor puede arrancar para hacer o escuchar música. Un motor parado se arranca aquí y tarda un momento en estar listo.',
    close: 'Cerrar',
    roles: { heartmula: 'Hace canciones con letra', diffrhythm2: 'Hace canciones con letra, en inglés', clap: 'Oye el sonido de un audio', muq: 'Compara el sonido con el estilo' },
    states: { running: 'En marcha', starting: 'Arrancando…', stopped: 'Parado', ready: 'Disponible', unavailable: 'No disponible' },
    start: 'Arrancar',
    stop: 'Parar',
    reasons: {
      no_weights: 'Faltan los pesos del modelo.',
      no_gpu: 'No hay una tarjeta con memoria libre.',
      no_service: 'Falta el programa en el servidor.',
      unreachable: 'El servicio no responde.',
      no_consent: 'Falta aceptar su uso en los ajustes del servidor.',
      key_rejected: 'El servicio rechazó la clave.',
      not_running: 'Está parado.',
    },
    unknownReason: 'El servidor no puede usarlo ahora.',
    errors: { busy: 'Un trabajo lo está usando: espera a que acabe.', refused: 'El servidor no puede arrancarlo ahora.', failed: 'No se pudo hacer: el servidor no respondió.' },
    unreadable: 'No se pudo leer el estado de los motores.',
    open: 'Abrir los motores para arrancarlo',
  },
  easy: {
    examples: 'Ejemplos rápidos',
    exampleList: [
      'Tropical house con tambores metálicos y ambiente de playa en verano',
      'Himno de rock potente con guitarra eléctrica y batería marcada',
      'Indie rock melancólico con voz emotiva y guitarra suave',
    ],
    instrumental: 'Instrumental',
    instrumentalHint: 'Música pura, sin voces',
  },
  style: {
    pick: 'Elegir etiquetas de estilo',
    done: 'Listo',
    popular: 'Populares',
    categories: {
      genre: 'Género',
      mood: 'Ánimo',
      instrument: 'Instrumento',
      tempo: 'Tempo',
      vocal: 'Voz',
      era: 'Época',
      production: 'Producción',
    },
  },
};

const en: Texts = {
  title: 'Music Studio',
  language: 'Language',
  loading: 'Loading…',
  retry: 'Retry',
  unknownError: 'Could not reach the server.',
  studio: {
    composerLabel: 'Create a song',
    songsTitle: 'My songs',
  },
  composer: {
    modeLabel: 'Mode',
    easy: 'Easy',
    custom: 'Custom',
    generate: 'Generate',
    generating: 'Generating…',
    toGenerate: 'To generate:',
    todo: {
      'title.required': 'write a title',
      'title.tooLong': 'shorten the title',
      'lyrics.required': 'write the lyrics',
      'style.required': 'pick at least one style tag',
      'prompt.required': 'describe the music',
      'prompt.tooLong': 'shorten the description',
      'generator.unavailable': 'choose a generator that is available',
    },
    unavailable: '(not available)',
    stopped: '(stopped)',
    start: 'Start the generator',
    starting: 'Starting…',
    engineReasons: {
      no_weights: 'The model weights are missing.',
      no_gpu: 'No card has free memory.',
      unreachable: 'The generator service does not answer.',
      no_consent: 'Its use has to be accepted in the server settings.',
      key_rejected: 'The service rejected the key.',
      not_running: 'The generator is stopped: start it from the server.',
    },
    unknownReason: 'The server cannot use it now.',
    refused: 'The server does not accept this song.',
    failed: 'The song could not be asked of the server.',
  },
  capture: {
    title: 'Capture the style of a song or a video',
    hint: 'Import an audio or a video file, or paste a YouTube link: the server listens to it and the style it hears is added to the form.',
    button: 'Import',
    listening: 'Listening…',
    heardTitle: 'It sounds like:',
    tempo: '{bpm} BPM',
    added: 'Added to the style:',
    noTags: 'No tag of the vocabulary was recognised: the style has not changed.',
    noGenre: 'The assistant could not name a genre: this describes only the sound.',
    fromUrl: 'Capture from YouTube',
    methods: {
      whisper: 'Words (Whisper)',
      clap: 'Sound (LAION-CLAP)',
      muq: 'Sound and style (MuQ-MuLan)',
    },
    reasons: { not_running: 'not running', no_service: 'no service', no_weights: 'weights missing', unreachable: 'does not answer' },
    unknownReason: 'not available',
    errors: {
      unavailable: 'The server cannot listen now (it lacks the speech model or the assistant).',
      busy: 'The server is busy with another task; try again in a moment.',
      tooLong: 'The file is too long or too big to listen to.',
      unreadable: 'That file could not be read: try an ordinary audio or video file.',
      timeout: 'It took too long to listen.',
      badUrl: 'Only the address of one YouTube video is accepted (no playlists).',
      unknown: 'Could not listen to the file.',
    },
  },
  ai: {
    example: 'E.g., A heartbreak song about summer rain…',
    title: 'AI Lyrics Generator',
    description: 'Describe the lyrics you want to generate.',
    close: 'Close',
    replaces: 'The lyrics there now will be replaced by the new ones.',
    tipsTitle: 'Tips for better results:',
    tips: [
      'Include the emotional tone (sad, happy, energetic, romantic)',
      'Mention the story or theme you want to convey',
      'Specify the music genre or style if you have a preference',
      "Add any specific scenarios or imagery you'd like included",
    ],
    generate: 'Generate Lyrics',
  },
  custom: {
    structureTags: 'Structure Tags',
    structureTagsHint: 'Inserted in the lyrics, on a line of its own.',
    aiGenerator: 'AI Generator',
    writing: 'Writing…',
    errors: {
      unavailable: 'The assistant is not available on the server (it needs Ollama).',
      busy: 'The server is busy with another task; try again in a moment.',
      refused: 'The assistant model declined to write it. Try another text.',
      unknown: 'Could not reach the assistant.',
    },
  },
  songs: {
    loading: 'Loading your songs…',
    empty: 'No songs yet',
    emptyHint: 'Write a song and press "Generate" to make the first one.',
    queued: 'Queued',
    queuedAt: 'Queued, position {n}',
    running: 'Generating…',
    cancelled: 'Cancelled',
    cancel: 'Cancel',
    retry: 'Try again',
    download: 'Download',
    remove: 'Delete',
    player: 'Play',
    actionFailed: 'That did not work. Try again.',
  },
  confirm: {
    title: 'Delete the song?',
    message: 'It is deleted from the server and cannot be recovered.',
    cancel: 'Cancel',
    remove: 'Delete',
  },
  engines: {
    button: 'Engines',
    title: 'Music engines',
    lead: 'What the server can start to make or hear music. A stopped engine is started here and takes a moment to be ready.',
    close: 'Close',
    roles: { heartmula: 'Makes songs with lyrics', diffrhythm2: 'Makes songs with lyrics, in English', clap: 'Hears the sound of an audio', muq: 'Compares the sound with the style' },
    states: { running: 'Running', starting: 'Starting…', stopped: 'Stopped', ready: 'Available', unavailable: 'Not available' },
    start: 'Start',
    stop: 'Stop',
    reasons: {
      no_weights: 'The model weights are missing.',
      no_gpu: 'No card has free memory.',
      no_service: 'The program is missing on the server.',
      unreachable: 'The service does not answer.',
      no_consent: 'Its use has to be accepted in the server settings.',
      key_rejected: 'The service rejected the key.',
      not_running: 'It is stopped.',
    },
    unknownReason: 'The server cannot use it now.',
    errors: { busy: 'A job is using it: wait for it to finish.', refused: 'The server cannot start it now.', failed: 'It could not be done: the server did not answer.' },
    unreadable: 'The state of the engines could not be read.',
    open: 'Open the engines to start it',
  },
  easy: {
    examples: 'Quick Examples',
    exampleList: [
      'Tropical house with steel drums and summer beach vibes',
      'Powerful rock anthem with electric guitar and driving drums',
      'Melancholic indie rock with emotional vocals and gentle guitar',
    ],
    instrumental: 'Instrumental',
    instrumentalHint: 'Pure music without vocals',
  },
  style: {
    pick: 'Pick style tags',
    done: 'Done',
    popular: 'Popular',
    categories: {
      genre: 'Genre',
      mood: 'Mood',
      instrument: 'Instrument',
      tempo: 'Tempo',
      vocal: 'Vocal',
      era: 'Era',
      production: 'Production',
    },
  },
};

const TEXTS: Record<Lang, Texts> = { es, en };

export const textsFor = (lang: Lang): Texts => TEXTS[lang];
