import type { ToolId, VideoEditState } from '../video-edit/model';
import type { GenerationState, InputKind } from '../video/model';
import type { Problem } from '../video/validate';
import type { Lang } from './language';

/** Every text the dashboard shows, in each language. Add a key here and TypeScript asks for both languages. */
export interface Texts {
  title: string;
  language: string;
  /** What follows the name of a model that cannot be used. */
  unavailable: string;
  tabs: { label: string; create: string; edit: string };
  editTools: { title: string; retouch: { name: string; hint: string }; pickImage: string };
  /** The tools of the server's Edit video list and the dialog each opens. */
  videoTools: {
    loading: string;
    unreadable: string;
    retry: string;
    names: Record<ToolId, string>;
    hints: Record<ToolId, string>;
    /** What the person should know before sending, per tool (the server's own notes come on top). */
    warnings: Partial<Record<ToolId, readonly string[]>>;
    dialog: {
      video: string;
      chooseVideo: string;
      videoPicked: string;
      notAVideo: string;
      videoRequired: string;
      image: string;
      chooseImage: string;
      imagePicked: string;
      imageRequired: string;
      motions: string;
      motionHint: string;
      motionEmpty: string;
      motionsUnreadable: string;
      motionPreparing: string;
      motionFailed: string;
      motionUse: string;
      motionChosen: string;
      motionRemove: string;
      settings: string;
      generate: string;
      generating: string;
      cancel: string;
      failed: string;
      /** `{name}` is the setting that was left blank. */
      settingRequired: string;
    };
    /** The history card of an edit. */
    edit: { sound: string; silent: string; notes: string; /** `{n}` is how many times the video was made longer. */ extended: string; states: Record<VideoEditState, string>; viewerTitle: string };
  };
  /** The end image, the references and what the generation used. `{n}`, `{max}`, `{name}` and `{kind}` are filled in. */
  inputs: {
    frameStart: string;
    frameEnd: string;
    framesNote: string;
    references: string;
    referencesHint: string;
    images: string;
    videos: string;
    audios: string;
    add: string;
    count: string;
    maxReached: string;
    maxSeconds: string;
    tooLong: string;
    wrongType: string;
    moveUp: string;
    moveDown: string;
    remove: string;
    picture: string;
    video: string;
    audio: string;
    allFull: string;
    kept: string;
    loading: string;
    loadFailed: string;
    /** Each kind of input, as the history and the viewer name it. */
    kinds: Record<InputKind, string>;
    historyTitle: string;
    /** What stops Generate, per problem of the inputs. */
    problems: Partial<Record<Problem, string>>;
  };
  panel: {
    title: string;
    change: string;
    headerKind: string;
    model: string;
    duration: string;
    durationOther: string;
    durationRange: string;
    durationWhole: string;
    aspectRatio: string;
    quality: string;
    seconds: string;
    startImage: string;
    chooseImage: string;
    imageHint: string;
    dropHint: string;
    removeImage: string;
    notAnImage: string;
    imageTooBig: string;
    estimate: string;
    generate: string;
    createFailed: string;
    /** Under Audio when the chosen model writes no sound. */
    soundOff: string;
    /** Under the Sound field: `{left}` characters remain of `{max}`. */
    soundCount: string;
    /** The prompt and the sound are `{over}` characters over the limit of `{max}`. */
    promptTooLong: string;
  };
  history: {
    title: string;
    empty: string;
    states: Record<GenerationState, string>;
    open: string;
    download: string;
    repeat: string;
    remove: string;
    simulated: string;
  };
  retouch: {
    button: string;
    title: string;
    original: string;
    retouch: string;
    retouching: string;
    variants: string;
    variant: string;
    use: string;
    cancel: string;
    simulated: string;
    failed: string;
  };
  viewer: { title: string; close: string };
  confirm: { title: string; message: string; cancel: string; remove: string };
  /** The Motion library screen of the Edit tab. `{n}`, `{from}` and `{to}` are filled in. */
  motionLibrary: {
    name: string;
    hint: string;
    title: string;
    close: string;
    open: string;
    unreadable: string;
    retry: string;
    limitsTitle: string;
    limits: readonly string[];
    addTitle: string;
    chooseFile: string;
    clearFile: string;
    noFile: string;
    add: string;
    adding: string;
    bothChosen: string;
    refused: string;
    seconds: string;
    peopleOne: string;
    peopleMany: string;
    removeTitle: string;
    removeMessage: string;
    startTitle: string;
    startTakes: string;
  };
  /** What the studio says when a generation finishes (also the title of the browser notification). */
  notice: { ready: string; failed: string; view: string };
  demo: { title: string; failNext: string };
}

const es: Texts = {
  title: 'Video Studio',
  language: 'Idioma',
  unavailable: '(no disponible)',
  tabs: { label: 'Modo', create: 'Crear vídeo', edit: 'Editar vídeo' },
  editTools: { title: 'Herramientas de edición', retouch: { name: 'Retocar imagen', hint: 'Cambia una imagen antes de animarla' }, pickImage: 'Elegir imagen' },
  videoTools: {
    loading: 'Leyendo las herramientas de vídeo…',
    unreadable: 'No se pudieron leer las herramientas de vídeo del servidor.',
    retry: 'Reintentar',
    names: { scale: 'Escalar', interpolate: 'Más fotogramas por segundo', reframe: 'Reencuadrar', 'remove-background': 'Quitar el fondo', depth: 'Profundidad', extend: 'Alargar', 'motion-control': 'Motion Control' },
    hints: {
      scale: 'Hace el vídeo más grande y conserva el sonido',
      interpolate: 'Añade fotogramas para que se mueva con más fluidez',
      reframe: 'Cambia la proporción recortando o con bandas',
      'remove-background': 'Recorta a las personas y pone otro fondo',
      depth: 'Un vídeo con la profundidad de la escena',
      extend: 'Hace el vídeo más largo',
      'motion-control': 'Mueve a las personas de una imagen como las de un vídeo',
    },
    warnings: {
      'motion-control': [
        'Tarda unos 330 s y hace clips de 2 s sin sonido.',
        'Es blando: la identidad de la cara no está garantizada.',
        'El prompt manda más que la fuerza: describe a las personas y el lugar como los muestra la imagen, con luz natural. «Bright» quema la imagen.',
        'La forma del clip sigue a la imagen de referencia (832×480, 480×832 o 640×640).',
      ],
      extend: ['Hace un clip de lo que el motor da solo (unos 2 a 2,3 s), aunque pidas más segundos.', 'La calidad baja cada vez que se alarga el mismo vídeo.'],
      'remove-background': ['Si no hay nadie en el vídeo, termina bien con una nota y el vídeo sin cambios.'],
    },
    dialog: {
      video: 'Vídeo',
      chooseVideo: 'Subir un vídeo',
      videoPicked: 'Vídeo elegido:',
      notAVideo: 'Ese fichero no es un vídeo (mp4, mov, webm o mkv).',
      videoRequired: 'Elige el vídeo que quieres editar.',
      image: 'Imagen de referencia',
      chooseImage: 'Subir una imagen',
      imagePicked: 'Imagen elegida:',
      imageRequired: 'Elige la imagen de referencia.',
      motions: 'Biblioteca de movimientos',
      motionHint: 'Usa un movimiento de la biblioteca en lugar de un vídeo.',
      motionEmpty: 'La biblioteca está vacía: usa un vídeo o añade un movimiento desde la biblioteca.',
      motionsUnreadable: 'No se pudo leer la biblioteca de movimientos.',
      motionPreparing: 'Preparando…',
      motionFailed: 'Falló:',
      motionUse: 'Usar',
      motionChosen: 'Elegido',
      motionRemove: 'Quitar de la biblioteca',
      settings: 'Ajustes',
      generate: 'Generar',
      generating: 'Enviando…',
      cancel: 'Cancelar',
      failed: 'No se pudo editar:',
      settingRequired: 'Rellena «{name}».',
    },
    edit: { sound: 'Con sonido', silent: 'Sin sonido', notes: 'Avisos', extended: 'Alargado ×{n}', states: { queued: 'En cola', running: 'Editando', done: 'Listo', failed: 'Falló', cancelled: 'Cancelada' }, viewerTitle: 'Vídeo editado' },
  },
  inputs: {
    frameStart: 'Inicio',
    frameEnd: 'Final',
    framesNote: 'La imagen final es opcional: el clip se reproduce una vez y mantiene su último fotograma hasta completar la duración.',
    references: 'Referencias',
    referencesHint: 'En el prompt, las imágenes se nombran <Picture 1>, <Picture 2>… en este orden. La primera ancla la escena.',
    images: 'Imágenes',
    videos: 'Vídeos',
    audios: 'Audios',
    add: 'Añadir',
    count: '{n} de {max}',
    maxReached: 'Este modelo admite como máximo {max}.',
    maxSeconds: 'hasta {n} s cada uno',
    tooLong: '«{name}» dura más de {n} s.',
    wrongType: '«{name}» no es un fichero de este tipo.',
    moveUp: 'Subir',
    moveDown: 'Bajar',
    remove: 'Quitar',
    picture: 'Imagen {n}',
    video: 'Vídeo',
    audio: 'Audio',
    allFull: 'Has llegado al máximo de este modelo en todos los tipos.',
    kept: 'Guardado por el servidor',
    loading: 'Cargando los ficheros…',
    loadFailed: 'No se pudieron cargar los ficheros de esa generación: elígelos otra vez.',
    kinds: { start_image: 'Imagen inicial', end_image: 'Imagen final', reference_image: 'Imagen de referencia', reference_video: 'Vídeo de referencia', reference_audio: 'Audio de referencia' },
    historyTitle: 'Entradas',
    problems: {
      'end-image-needs-start': 'La imagen final necesita la imagen inicial.',
      'references-mixed': 'Las referencias no se mezclan con la imagen inicial ni con la final.',
      'reference-image-required': 'Hace falta al menos una imagen de referencia.',
      'reference-images-max': 'Hay más imágenes de referencia de las que admite el modelo.',
      'reference-videos-max': 'Hay más vídeos de referencia de los que admite el modelo.',
      'reference-audios-max': 'Hay más audios de referencia de los que admite el modelo.',
      'reference-video-seconds': 'Un vídeo de referencia dura más de lo que admite el modelo.',
      'reference-audio-seconds': 'Un audio de referencia dura más de lo que admite el modelo.',
      'reuse-unavailable': 'Los ficheros de esa generación ya no están guardados.',
    },
  },
  panel: {
    change: 'Cambiar',
    headerKind: 'Vídeo',
    model: 'Modelo',
    duration: 'Duración',
    durationOther: 'Otra duración (s)',
    durationRange: 'La duración debe estar entre 4 y 30 segundos.',
    durationWhole: 'La duración debe ser un número entero de segundos.',
    aspectRatio: 'Relación',
    quality: 'Calidad',
    seconds: '{n} s',
    title: 'Crear vídeo',
    startImage: 'Imagen inicial (opcional)',
    chooseImage: 'Elegir imagen',
    imageHint: 'Una imagen de hasta 5 MB',
    dropHint: 'o arrástrala hasta aquí',
    removeImage: 'Borrar',
    notAnImage: 'Ese archivo no es una imagen.',
    imageTooBig: 'La imagen pesa más de 5 MB.',
    estimate: 'Estimación',
    generate: 'Generar',
    createFailed: 'No se pudo crear la generación:',
    soundOff: 'Este modelo no genera sonido.',
    soundCount: 'Quedan {left} caracteres de {max}',
    promptTooLong: 'El prompt y el sonido se pasan {over} caracteres del límite de {max}.',
  },
  history: {
    title: 'Historial',
    empty: 'Aún no hay generaciones. Describe un vídeo y pulsa «Generar».',
    states: { queued: 'En cola', running: 'Generando', done: 'Listo', failed: 'Falló' },
    open: 'Ver',
    download: 'Descargar',
    repeat: 'Repetir',
    remove: 'Borrar',
    simulated: 'Vídeo simulado: este estudio aún no está conectado al servidor.',
  },
  retouch: {
    button: 'Retocar',
    title: 'Retocar imagen',
    original: 'Original',
    retouch: 'Retocar',
    retouching: 'Retocando…',
    variants: 'Resultados',
    variant: 'Variante',
    use: 'Usar esta',
    cancel: 'Cancelar',
    simulated: 'Retoque simulado: este estudio aún no está conectado al servidor y devuelve la imagen original.',
    failed: 'No se pudo retocar la imagen:',
  },
  viewer: { title: 'Vídeo', close: 'Cerrar' },
  confirm: { title: 'Borrar generación', message: '¿Seguro que quieres borrar esta generación? No se puede deshacer.', cancel: 'Cancelar', remove: 'Borrar' },
  motionLibrary: {
    name: 'Biblioteca de movimientos',
    hint: 'Los vídeos de personas moviéndose que usa Motion Control',
    title: 'Biblioteca de movimientos',
    close: 'Cerrar',
    open: 'Abrir la biblioteca',
    unreadable: 'No se pudo leer la biblioteca de movimientos.',
    retry: 'Reintentar',
    limitsTitle: 'Antes de añadir un vídeo',
    limits: ['Dura de 2,1 a 30 segundos.', 'Sale una persona (si se tocan, cuentan como una).', 'El servicio de visión del servidor tiene que estar en marcha.'],
    addTitle: 'Añadir un movimiento',
    chooseFile: 'Elegir un vídeo',
    clearFile: 'Quitar el vídeo',
    noFile: 'Ningún vídeo elegido',
    add: 'Añadir a la biblioteca',
    adding: 'Añadiendo…',
    bothChosen: 'Elige un vídeo o una dirección, no los dos.',
    refused: 'No se pudo añadir el movimiento:',
    seconds: '{n} s',
    peopleOne: '1 persona',
    peopleMany: '{n} personas',
    removeTitle: 'Quitar movimiento',
    removeMessage: '¿Seguro que quieres quitar este movimiento de la biblioteca? No se puede deshacer.',
    startTitle: 'Dónde empieza',
    startTakes: 'Se usan los segundos {from} a {to} del movimiento.',
  },
  notice: { ready: 'Vídeo listo', failed: 'La generación ha fallado', view: 'Ver' },
  demo: { title: 'Demostración', failNext: 'Hacer que la próxima generación falle' },
};

const en: Texts = {
  title: 'Video Studio',
  language: 'Language',
  unavailable: '(unavailable)',
  tabs: { label: 'Mode', create: 'Create video', edit: 'Edit video' },
  editTools: { title: 'Editing tools', retouch: { name: 'Retouch image', hint: 'Change an image before animating it' }, pickImage: 'Choose image' },
  videoTools: {
    loading: 'Reading the video tools…',
    unreadable: 'The video tools could not be read from the server.',
    retry: 'Try again',
    names: { scale: 'Scale', interpolate: 'More frames per second', reframe: 'Reframe', 'remove-background': 'Remove background', depth: 'Depth', extend: 'Extend', 'motion-control': 'Motion Control' },
    hints: {
      scale: 'Makes the video larger, keeping its sound',
      interpolate: 'Adds frames so it moves more smoothly',
      reframe: 'Changes the aspect ratio by cropping or padding',
      'remove-background': 'Cuts the people out and puts another background',
      depth: 'A video of the depth of the scene',
      extend: 'Makes the video longer',
      'motion-control': 'Moves the people of a picture like those of a video',
    },
    warnings: {
      'motion-control': [
        'It takes about 330 s and makes 2 s clips without sound.',
        'It is soft: the identity of the face is not guaranteed.',
        'The prompt matters more than the strength: describe the people and the place as the image shows them, in natural light. “Bright” burns the image.',
        'The shape of the clip follows the reference image (832×480, 480×832 or 640×640).',
      ],
      extend: ['It makes a clip of what the engine gives on its own (about 2 to 2.3 s), even if you ask for more seconds.', 'The quality drops each time the same video is extended.'],
      'remove-background': ['If nobody is in the video, it ends fine with a note and the video unchanged.'],
    },
    dialog: {
      video: 'Video',
      chooseVideo: 'Upload a video',
      videoPicked: 'Video chosen:',
      notAVideo: 'That file is not a video (mp4, mov, webm or mkv).',
      videoRequired: 'Choose the video you want to edit.',
      image: 'Reference image',
      chooseImage: 'Upload an image',
      imagePicked: 'Image chosen:',
      imageRequired: 'Choose the reference image.',
      motions: 'Library of motions',
      motionHint: 'Use a motion of the library instead of a video.',
      motionEmpty: 'The library is empty: use a video or add a motion from the library.',
      motionsUnreadable: 'The library of motions could not be read.',
      motionPreparing: 'Preparing…',
      motionFailed: 'Failed:',
      motionUse: 'Use',
      motionChosen: 'Chosen',
      motionRemove: 'Remove from the library',
      settings: 'Settings',
      generate: 'Generate',
      generating: 'Sending…',
      cancel: 'Cancel',
      failed: 'Could not edit:',
      settingRequired: 'Fill in “{name}”.',
    },
    edit: { sound: 'With sound', silent: 'No sound', notes: 'Notices', extended: 'Extended ×{n}', states: { queued: 'Queued', running: 'Editing', done: 'Done', failed: 'Failed', cancelled: 'Cancelled' }, viewerTitle: 'Edited video' },
  },
  inputs: {
    frameStart: 'Start',
    frameEnd: 'End',
    framesNote: 'The end image is optional: the clip plays once and holds its last frame to fill the duration.',
    references: 'References',
    referencesHint: 'In the prompt, images are named <Picture 1>, <Picture 2>… in this order. The first one anchors the scene.',
    images: 'Images',
    videos: 'Videos',
    audios: 'Audios',
    add: 'Add',
    count: '{n} of {max}',
    maxReached: 'This model takes at most {max}.',
    maxSeconds: 'up to {n} s each',
    tooLong: '“{name}” is longer than {n} s.',
    wrongType: '“{name}” is not a file of this kind.',
    moveUp: 'Move up',
    moveDown: 'Move down',
    remove: 'Remove',
    picture: 'Picture {n}',
    video: 'Video',
    audio: 'Audio',
    allFull: 'This model is at its maximum in every kind.',
    kept: 'Kept by the server',
    loading: 'Loading the files…',
    loadFailed: 'The files of that generation could not be loaded: choose them again.',
    kinds: { start_image: 'Start image', end_image: 'End image', reference_image: 'Reference image', reference_video: 'Reference video', reference_audio: 'Reference audio' },
    historyTitle: 'Inputs',
    problems: {
      'end-image-needs-start': 'The end image needs the start image.',
      'references-mixed': 'References cannot be mixed with a start or an end image.',
      'reference-image-required': 'At least one reference image is needed.',
      'reference-images-max': 'There are more reference images than this model takes.',
      'reference-videos-max': 'There are more reference videos than this model takes.',
      'reference-audios-max': 'There are more reference audios than this model takes.',
      'reference-video-seconds': 'A reference video is longer than this model takes.',
      'reference-audio-seconds': 'A reference audio is longer than this model takes.',
      'reuse-unavailable': 'The files of that generation are no longer kept.',
    },
  },
  panel: {
    change: 'Change',
    headerKind: 'Video',
    model: 'Model',
    duration: 'Duration',
    durationOther: 'Other duration (s)',
    durationRange: 'The duration must be from 4 to 30 seconds.',
    durationWhole: 'The duration must be a whole number of seconds.',
    aspectRatio: 'Aspect ratio',
    quality: 'Quality',
    seconds: '{n} s',
    title: 'Create video',
    startImage: 'Start image (optional)',
    chooseImage: 'Choose image',
    imageHint: 'An image up to 5 MB',
    dropHint: 'or drag it here',
    removeImage: 'Delete',
    notAnImage: 'That file is not an image.',
    imageTooBig: 'The image is larger than 5 MB.',
    estimate: 'Estimate',
    generate: 'Generate',
    createFailed: 'The generation could not be created:',
    soundOff: 'This model makes no sound.',
    soundCount: '{left} characters left of {max}',
    promptTooLong: 'The prompt and the sound are {over} characters over the {max} limit.',
  },
  history: {
    title: 'History',
    empty: 'No generations yet. Describe a video and press "Generate".',
    states: { queued: 'Queued', running: 'Generating', done: 'Done', failed: 'Failed' },
    open: 'View',
    download: 'Download',
    repeat: 'Repeat',
    remove: 'Delete',
    simulated: 'Simulated video: this studio is not connected to the server yet.',
  },
  retouch: {
    button: 'Retouch',
    title: 'Retouch image',
    original: 'Original',
    retouch: 'Retouch',
    retouching: 'Retouching…',
    variants: 'Results',
    variant: 'Variant',
    use: 'Use this one',
    cancel: 'Cancel',
    simulated: 'Simulated retouch: this studio is not connected to the server yet and gives the original image back.',
    failed: 'The image could not be retouched:',
  },
  viewer: { title: 'Video', close: 'Close' },
  confirm: { title: 'Delete generation', message: 'Do you really want to delete this generation? This cannot be undone.', cancel: 'Cancel', remove: 'Delete' },
  motionLibrary: {
    name: 'Motion library',
    hint: 'The videos of people moving that Motion Control uses',
    title: 'Motion library',
    close: 'Close',
    open: 'Open the library',
    unreadable: 'The library of motions could not be read.',
    retry: 'Retry',
    limitsTitle: 'Before adding a video',
    limits: ['It lasts from 2.1 to 30 seconds.', 'One person appears in it (people who touch count as one).', 'The server\'s vision service must be running.'],
    addTitle: 'Add a motion',
    chooseFile: 'Choose a video',
    clearFile: 'Remove the video',
    noFile: 'No video chosen',
    add: 'Add to the library',
    adding: 'Adding…',
    bothChosen: 'Choose a video or an address, not both.',
    refused: 'Could not add the motion:',
    seconds: '{n} s',
    peopleOne: '1 person',
    peopleMany: '{n} people',
    removeTitle: 'Remove motion',
    removeMessage: 'Do you really want to remove this motion from the library? This cannot be undone.',
    startTitle: 'Where it starts',
    startTakes: 'Seconds {from} to {to} of the motion are used.',
  },
  notice: { ready: 'Video ready', failed: 'The generation failed', view: 'View' },
  demo: { title: 'Demo', failNext: 'Make the next generation fail' },
};

const TEXTS: Record<Lang, Texts> = { es, en };

export const textsFor = (lang: Lang): Texts => TEXTS[lang];
