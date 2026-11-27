import type { Lang } from '@lab/forms-kit';

/** The texts of the library screens and the picker, in both languages. What the server says about a refusal is shown as it is said. */
export interface Texts {
  state: Record<'available' | 'installing' | 'installed' | 'failed', string>;
  packs: {
    title: string;
    intro: string;
    loading: string;
    empty: string;
    unavailable: string;
    install: string;
    cancel: string;
    remove: string;
    removeAsk: (name: string) => string;
    removeYes: string;
    removeNo: string;
    retry: string;
    import: string;
    models: (n: number) => string;
    progress: (done: number, total: number) => string;
    size: (bytes: number) => string;
    licence: (licence: string) => string;
    by: (author: string) => string;
    attribution: string;
    imported: string;
    generated: string;
    donate: string;
    donateLink: string;
    page: string;
    skipped: (n: number) => string;
    failedWhy: string;
    importHint: string;
  };
  importer: {
    title: string;
    zip: string;
    pickZip: string;
    noZip: string;
    send: string;
    sending: string;
    cancel: string;
    note: string;
  };
  catalog: {
    title: string;
    intro: string;
    loading: string;
    empty: string;
    noPacks: string;
    allPacks: string;
    pack: string;
    allTags: string;
    tag: string;
    search: string;
    onlyClips: string;
    clips: (n: number) => string;
    noClips: string;
    triangles: (n: number) => string;
    noPreview: string;
    previewAlt: (name: string) => string;
    attribution: string;
    licence: (licence: string) => string;
    by: (author: string) => string;
    use: string;
    source: string;
    allSources: string;
    sources: Record<'catalog' | 'user' | 'generated', string>;
    engine: string;
    allEngines: string;
    madeFrom: string;
    madeWith: (engine: string, version: string) => string;
    madeAt: (iso: string) => string;
    adult: string;
  };
  picker: {
    title: (place: string) => string;
    name: string;
    nameHint: string;
    add: string;
    close: string;
    added: (name: string, pictures: number) => string;
    already: (name: string) => string;
  };
  viewer: {
    open: string;
    openModel: (name: string) => string;
    title: (name: string) => string;
    close: string;
    loading: string;
    progress: (loaded: string, total: string) => string;
    stage: (name: string) => string;
    keys: string;
    reset: string;
    play: string;
    pause: string;
    wireframe: string;
    clip: string;
    noClips: string;
    info: string;
    name: string;
    pack: string;
    licence: string;
    author: string;
    triangles: string;
    fileSize: string;
    prompt: string;
    engine: string;
    notServed: string;
    unreadable: (why: string) => string;
    noWebgl: string;
    noPictures: string;
    failed: (why: string) => string;
    retry: string;
    thumbnailAlt: (name: string) => string;
    noThumbnail: string;
  };
  making: {
    title: string;
    intro: string;
    loading: string;
    engines: {
      title: string;
      ready: string;
      local: string;
      external: string;
      externalNote: string;
      container: Record<'stopped' | 'starting' | 'running', string>;
      start: string;
      stop: string;
      install: string;
      /** The button of a backend that lacks something: install what it needs. */
      installFor: string;
      version: (version: string) => string;
      licence: (licence: string) => string;
      gaveUp: string;
      reasons: Record<string, string>;
      unknownReason: (reason: string) => string;
    };
    backends: {
      title: string;
      names: Record<string, string>;
      inUse: string;
      saved: string;
      byDefault: string;
      ready: string;
      lacks: (items: string, bytes?: number) => string;
      missing: Record<string, string>;
      use: string;
      useDefault: string;
      choose: string;
    };
    plan: {
      title: (engine: string) => string;
      backend: (name: string) => string;
      parts: string;
      part: Record<string, string>;
      unknownPart: (part: string) => string;
      noParts: string;
      again: string;
      files: string;
      size: (bytes: number) => string;
      licence: (licence: string) => string;
      /** The licence that needs the person's acceptance: its words, the tick and what it is for. */
      licenceTitle: string;
      commercial: Record<'yes' | 'conditions' | 'no' | 'unknown', string>;
      licenceRead: string;
      licenceRecorded: string;
      licenceAgree: (name: string) => string;
      licenceNeeded: string;
      free: (bytes: number) => string;
      path: (path: string) => string;
      gated: string;
      key: string;
      noRoom: string;
      confirm: string;
      cancel: string;
      loading: string;
    };
    job: {
      title: (engine: string) => string;
      state: Record<'running' | 'done' | 'failed' | 'cancelled', string>;
      cancel: string;
      failedWhy: string;
      now: (part: string) => string;
    };
    generate: {
      open: string;
      title: string;
      fromText: string;
      fromPicture: string;
      picture: string;
      noPicture: string;
      tooBig: string;
      needOne: string;
      largest: string;
      send: string;
      sending: string;
      cancel: string;
      blocked: string;
    };
    generations: {
      title: string;
      empty: string;
      state: Record<'queued' | 'running' | 'done' | 'failed' | 'cancelled', string>;
      step: Record<'picture' | 'model', string>;
      fromPicture: string;
      cancel: string;
      remove: string;
      removeNote: string;
      relabel: string;
      model: (id: string) => string;
    };
  };
  failed: (status: number) => string;
}

const kb = (bytes: number): string => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} kB`);

const es: Texts = {
  state: { available: 'Disponible', installing: 'Instalando', installed: 'Instalado', failed: 'Falló' },
  packs: {
    title: 'Packs de modelos 3D',
    intro: 'Un pack es un conjunto de modelos .glb con sus animaciones. Se instala en el servidor y desde ahí se copia un modelo a un proyecto o a una pieza.',
    loading: 'Leyendo los packs…',
    empty: 'El servidor no tiene ningún pack.',
    unavailable: 'Este servidor todavía no tiene la biblioteca 3D.',
    install: 'Instalar',
    cancel: 'Cancelar instalación',
    remove: 'Quitar',
    removeAsk: (name) => `¿Quitar «${name}»? Los modelos que ya copiaste a proyectos o piezas se quedan.`,
    removeYes: 'Sí, quitar',
    removeNo: 'No',
    retry: 'Reintentar',
    import: 'Importar un zip',
    models: (n) => (n === 1 ? '1 modelo' : `${n} modelos`),
    progress: (done, total) => `${kb(done)} de ${kb(total)}`,
    size: kb,
    licence: (licence) => `Licencia: ${licence}`,
    by: (author) => `de ${author}`,
    attribution: 'Pide citar al autor',
    imported: 'Importado',
    generated: 'Hecho por los motores',
    donate: 'Kenney publica estos packs gratis y pide donativos.',
    donateLink: 'Apoyar a Kenney',
    page: 'Página del pack',
    skipped: (n) => (n === 1 ? '1 archivo se dejó fuera' : `${n} archivos se dejaron fuera`),
    failedWhy: 'Por qué falló',
    importHint: 'Si la instalación falla, descarga el zip en un navegador e impórtalo.',
  },
  importer: {
    title: 'Importar un pack desde un zip',
    zip: 'Archivo zip',
    pickZip: 'Elegir el zip',
    noZip: 'Elige el zip del pack.',
    send: 'Importar',
    sending: 'Importando…',
    cancel: 'Cancelar',
    note: 'El servidor guarda la licencia que escribas, la muestra con cada modelo y no la juzga.',
  },
  catalog: {
    title: 'Modelos',
    intro: 'Los modelos de los packs instalados. Elige uno para copiarlo con sus imágenes.',
    loading: 'Leyendo los modelos…',
    empty: 'Ningún modelo coincide.',
    noPacks: 'Todavía no hay ningún pack instalado: instala uno en la lista de packs.',
    allPacks: 'Todos los packs',
    pack: 'Pack',
    allTags: 'Todas las etiquetas',
    tag: 'Etiqueta',
    search: 'Buscar por nombre o etiqueta',
    onlyClips: 'Solo con animaciones',
    clips: (n) => (n === 1 ? '1 animación' : `${n} animaciones`),
    noClips: 'Sin animaciones',
    triangles: (n) => `${n.toLocaleString('es')} triángulos`,
    noPreview: 'Sin imagen: el pack no la trae y hace falta Blender para dibujarla.',
    previewAlt: (name) => `Vista previa de ${name}`,
    attribution: 'Pide citar al autor',
    licence: (licence) => `Licencia: ${licence}`,
    by: (author) => `de ${author}`,
    use: 'Usar',
    source: 'Origen',
    allSources: 'Todos',
    sources: { catalog: 'Paquetes', user: 'Importados', generated: 'Generados' },
    engine: 'Motor',
    allEngines: 'Todos los motores',
    madeFrom: 'Hecho a partir de',
    madeWith: (engine, version) => `Hecho con ${engine} (${version})`,
    madeAt: (iso) => `el ${String(iso).slice(0, 10)}`,
    adult: 'Para mayores de 18 años',
  },
  picker: {
    title: (place) => `Añadir un modelo a ${place}`,
    name: 'Nombre del archivo (opcional)',
    nameHint: 'Termina en .glb; sin nombre se usa el del modelo.',
    add: 'Añadir',
    close: 'Cerrar',
    added: (name, pictures) => `«${name}» añadido${pictures ? ` con ${pictures} ${pictures === 1 ? 'imagen' : 'imágenes'}` : ''}.`,
    already: (name) => `«${name}» ya estaba.`,
  },
  viewer: {
    open: 'Ver en 3D',
    openModel: (name) => `Ver ${name} en 3D`,
    title: (name) => `Modelo ${name}`,
    close: 'Cerrar',
    loading: 'Leyendo el modelo…',
    progress: (loaded, total) => `${loaded} de ${total}`,
    stage: (name) => `Vista 3D de ${name}`,
    keys: 'Flechas: girar. Más y menos: acercar y alejar. Cero: volver a la vista inicial.',
    reset: 'Vista inicial',
    play: 'Reproducir',
    pause: 'Pausar',
    wireframe: 'Malla',
    clip: 'Animación',
    noClips: 'Este modelo no tiene animaciones.',
    info: 'Datos del modelo',
    name: 'Nombre',
    pack: 'Pack',
    licence: 'Licencia',
    author: 'Autor',
    triangles: 'Triángulos',
    fileSize: 'Tamaño del archivo',
    prompt: 'Hecho a partir de',
    engine: 'Motor',
    notServed: 'Este servidor todavía no sirve el archivo del modelo: para verlo en 3D hace falta un servidor que lo sirva. Mientras tanto se muestra su imagen.',
    unreadable: (why) => `No se ha podido leer el modelo${why ? `: ${why}` : ''}. Se muestra su imagen.`,
    noWebgl: 'Este navegador no puede dibujar en 3D (WebGL). Se muestra la imagen del modelo.',
    noPictures: 'Este modelo usa imágenes (texturas) que el servidor no sirve con el archivo: se dibuja en gris, sin su color.',
    failed: (why) => `No se ha podido descargar el modelo${why ? `: ${why}` : ''}.`,
    retry: 'Reintentar',
    thumbnailAlt: (name) => `Imagen de ${name}`,
    noThumbnail: 'Sin imagen',
  },
  making: {
    title: 'Hacer modelos 3D',
    intro: 'El servidor puede hacer un modelo a partir de un texto o de una imagen con sus propios motores. Lo que hace entra en la biblioteca, desde donde se copia a un proyecto o a una pieza como cualquier otro modelo.',
    loading: 'Leyendo los motores…',
    engines: {
      title: 'Motores',
      ready: 'Listo',
      local: 'Funciona en este servidor',
      external: 'Servicio externo',
      externalNote: 'Se gestiona donde funciona: desde aquí no se puede arrancar, parar ni instalar.',
      container: { stopped: 'Servicio parado', starting: 'Servicio arrancando…', running: 'Servicio en marcha' },
      start: 'Arrancar',
      stop: 'Parar',
      install: 'Instalar lo que falta',
      installFor: 'Instalar lo que falta',
      version: (v) => `Versión ${v}`,
      licence: (l) => `Licencia: ${l}`,
      gaveUp: 'El servicio no arrancó a tiempo. Vuelve a preguntar por los motores o mira el servidor.',
      reasons: {
        no_docker: 'Docker no responde en el servidor.',
        no_image: 'La imagen del servicio 3D no está construida.',
        no_gpu_runtime: 'Docker no tiene el soporte de GPU.',
        no_weights: 'Los pesos del motor no están descargados.',
        no_service: 'El servicio .NET del motor no está instalado.',
        no_gpu: 'No hay ninguna GPU disponible.',
        not_running: 'Todo está listo, pero el servicio del motor está parado.',
        unreachable: 'El servicio 3D no responde.',
        not_built: 'La imagen se construyó sin este motor.',
        key_missing: 'No hay una clave de Hugging Face guardada: guarda en los tokens del servidor la de una cuenta que haya aceptado la licencia.',
        key_rejected: 'Hugging Face no conoce la clave guardada.',
        licence_not_accepted: 'La licencia de los pesos no se ha aceptado con la cuenta de la clave guardada.',
        no_disk: 'No hay espacio en el disco para los pesos.',
        no_image_model: 'No hay ningún modelo de imagen instalado en esta máquina: da una imagen en lugar de un texto.',
      },
      unknownReason: (reason) => `Ahora no se puede usar (${reason}).`,
    },
    backends: {
      title: 'Cómo funciona',
      names: { dotnet: 'Servicio .NET', docker: 'Contenedor Docker' },
      inUse: 'En uso',
      saved: 'Elegido por ti',
      byDefault: 'Por defecto',
      ready: 'Tiene todo lo necesario',
      lacks: (items, bytes) => `Falta: ${items}${bytes ? ` (unos ${kb(bytes)})` : ''}`,
      missing: { service: 'el servicio', weights: 'los pesos', docker: 'Docker', image: 'la imagen', gpu_runtime: 'el soporte de GPU' },
      use: 'Usar este',
      useDefault: 'Volver al de por defecto',
      choose: 'Con qué funciona',
    },
    plan: {
      title: (engine) => `Instalar lo que falta de ${engine}`,
      backend: (name) => `Para: ${name}`,
      parts: 'Qué se instala',
      part: { service: 'El servicio .NET', image: 'La imagen de Docker', weights: 'Los pesos' },
      unknownPart: (part) => `Parte «${part}»`,
      noParts: 'Marca al menos una parte.',
      again: 'Mirando qué hace falta…',
      files: 'Ficheros que faltan',
      size: (bytes) => `Unos ${kb(bytes)}`,
      licence: (licence) => `Licencia: ${licence}`,
      licenceTitle: 'Licencia que hay que aceptar',
      commercial: { yes: 'Permite el uso comercial.', conditions: 'El uso comercial tiene condiciones: léelas.', no: 'No permite el uso comercial.', unknown: 'No se sabe si permite el uso comercial.' },
      licenceRead: 'Leer la licencia',
      licenceRecorded: 'Este servidor ya guardó una aceptación de esta licencia. Aun así, confirma que la has leído.',
      licenceAgree: (name) => `He leído la licencia «${name}» y la acepto`,
      licenceNeeded: 'El servidor no instala este motor sin tu aceptación: marca la casilla para poder instalar.',
      free: (bytes) => `Libre en el disco: ${kb(bytes)}`,
      path: (path) => `Van a ${path}`,
      gated: 'Estos pesos están en un repositorio que pide a cada cuenta aceptar su licencia. Hazlo con tu propia cuenta de Hugging Face y guarda la clave de esa cuenta en los tokens del servidor: esta página nunca acepta una licencia ni pide una clave.',
      key: 'Lee la licencia antes de descargar: cumplirla es cosa tuya.',
      noRoom: 'El disco no tiene espacio para esta descarga.',
      confirm: 'Instalar',
      cancel: 'Ahora no',
      loading: 'Preguntando al servidor qué hace falta…',
    },
    job: {
      title: (engine) => `Instalación de ${engine}`,
      state: { running: 'Instalando', done: 'Instalado', failed: 'Falló', cancelled: 'Cancelado' },
      cancel: 'Cancelar la instalación',
      failedWhy: 'Por qué falló',
      now: (part) => `Ahora: ${part}`,
    },
    generate: {
      open: 'Hacer un modelo',
      title: 'Hacer un modelo 3D',
      fromText: 'A partir de un texto',
      fromPicture: 'A partir de una imagen',
      picture: 'Imagen',
      noPicture: 'Elige la imagen del objeto.',
      tooBig: 'La imagen pesa más de 20 MB.',
      needOne: 'Da un texto o una imagen.',
      largest: 'Un modelo generado no tiene tamaño real: al colocarlo en una escena, dale el tamaño por su dimensión mayor.',
      send: 'Hacerlo',
      sending: 'Enviando…',
      cancel: 'Cancelar',
      blocked: 'Ahora no se puede usar ningún motor: arranca o instala uno antes.',
    },
    generations: {
      title: 'Generaciones',
      empty: 'Todavía no se ha hecho nada.',
      state: { queued: 'En espera', running: 'Haciéndose', done: 'Hecha', failed: 'Falló', cancelled: 'Cancelada' },
      step: { picture: 'Dibujando la imagen', model: 'Haciendo el modelo' },
      fromPicture: 'A partir de una imagen',
      cancel: 'Cancelar',
      remove: 'Quitar de la lista',
      removeNote: 'El modelo sigue en la biblioteca.',
      relabel: 'Etiqueta',
      model: (id) => `Modelo ${id}`,
    },
  },
  failed: (status) => `El servidor respondió ${status}.`,
};

const en: Texts = {
  state: { available: 'Available', installing: 'Installing', installed: 'Installed', failed: 'Failed' },
  packs: {
    title: '3D model packs',
    intro: 'A pack is a set of .glb models with their animations. It installs on the server, and from there a model is copied to a project or a piece.',
    loading: 'Reading the packs…',
    empty: 'The server has no packs.',
    unavailable: 'This server does not have the 3D library yet.',
    install: 'Install',
    cancel: 'Cancel install',
    remove: 'Remove',
    removeAsk: (name) => `Remove “${name}”? The models you already copied to projects or pieces stay.`,
    removeYes: 'Yes, remove',
    removeNo: 'No',
    retry: 'Try again',
    import: 'Import a zip',
    models: (n) => (n === 1 ? '1 model' : `${n} models`),
    progress: (done, total) => `${kb(done)} of ${kb(total)}`,
    size: kb,
    licence: (licence) => `Licence: ${licence}`,
    by: (author) => `by ${author}`,
    attribution: 'Asks for the author to be named',
    imported: 'Imported',
    generated: 'Made by the engines',
    donate: 'Kenney publishes these packs for free and asks for donations.',
    donateLink: 'Support Kenney',
    page: "The pack's page",
    skipped: (n) => (n === 1 ? '1 file was left out' : `${n} files were left out`),
    failedWhy: 'Why it failed',
    importHint: 'If the install fails, download the zip in a browser and import it.',
  },
  importer: {
    title: 'Import a pack from a zip',
    zip: 'Zip file',
    pickZip: 'Choose the zip',
    noZip: 'Choose the zip of the pack.',
    send: 'Import',
    sending: 'Importing…',
    cancel: 'Cancel',
    note: 'The server keeps the licence you write, shows it with every model and does not judge it.',
  },
  catalog: {
    title: 'Models',
    intro: 'The models of the installed packs. Pick one to copy it with its pictures.',
    loading: 'Reading the models…',
    empty: 'No model matches.',
    noPacks: 'No pack is installed yet: install one in the list of packs.',
    allPacks: 'All packs',
    pack: 'Pack',
    allTags: 'All tags',
    tag: 'Tag',
    search: 'Search by name or tag',
    onlyClips: 'Only with animations',
    clips: (n) => (n === 1 ? '1 animation' : `${n} animations`),
    noClips: 'No animations',
    triangles: (n) => `${n.toLocaleString('en')} triangles`,
    noPreview: 'No picture: the pack has none and Blender is needed to draw one.',
    previewAlt: (name) => `Preview of ${name}`,
    attribution: 'Asks for the author to be named',
    licence: (licence) => `Licence: ${licence}`,
    by: (author) => `by ${author}`,
    use: 'Use',
    source: 'Source',
    allSources: 'All',
    sources: { catalog: 'Packs', user: 'Imported', generated: 'Generated' },
    engine: 'Engine',
    allEngines: 'All engines',
    madeFrom: 'Made from',
    madeWith: (engine, version) => `Made with ${engine} (${version})`,
    madeAt: (iso) => `on ${String(iso).slice(0, 10)}`,
    adult: 'For people of 18 or older',
  },
  picker: {
    title: (place) => `Add a model to ${place}`,
    name: 'File name (optional)',
    nameHint: 'Ends in .glb; without a name the model’s own is used.',
    add: 'Add',
    close: 'Close',
    added: (name, pictures) => `“${name}” added${pictures ? ` with ${pictures} ${pictures === 1 ? 'picture' : 'pictures'}` : ''}.`,
    already: (name) => `“${name}” was already there.`,
  },
  viewer: {
    open: 'View in 3D',
    openModel: (name) => `View ${name} in 3D`,
    title: (name) => `Model ${name}`,
    close: 'Close',
    loading: 'Reading the model…',
    progress: (loaded, total) => `${loaded} of ${total}`,
    stage: (name) => `3D view of ${name}`,
    keys: 'Arrow keys: turn. Plus and minus: zoom in and out. Zero: back to the first view.',
    reset: 'Reset view',
    play: 'Play',
    pause: 'Pause',
    wireframe: 'Wireframe',
    clip: 'Animation',
    noClips: 'This model has no animations.',
    info: 'About the model',
    name: 'Name',
    pack: 'Pack',
    licence: 'Licence',
    author: 'Author',
    triangles: 'Triangles',
    fileSize: 'File size',
    prompt: 'Made from',
    engine: 'Engine',
    notServed: 'This server does not serve the model file yet: viewing it in 3D needs a server that does. Its picture is shown meanwhile.',
    unreadable: (why) => `The model could not be read${why ? `: ${why}` : ''}. Its picture is shown.`,
    noWebgl: 'This browser cannot draw in 3D (WebGL). The model’s picture is shown.',
    noPictures: 'This model uses pictures (textures) that the server does not send with the file: it is drawn in grey, without its colour.',
    failed: (why) => `The model could not be downloaded${why ? `: ${why}` : ''}.`,
    retry: 'Try again',
    thumbnailAlt: (name) => `Picture of ${name}`,
    noThumbnail: 'No picture',
  },
  making: {
    title: 'Make 3D models',
    intro: 'The server can make a model from a text or a picture with its own engines. What it makes joins the library, where it is copied to a project or a piece like any other model.',
    loading: 'Reading the engines…',
    engines: {
      title: 'Engines',
      ready: 'Ready',
      local: 'Runs on this server',
      external: 'External service',
      externalNote: 'It is managed where it runs: it cannot be started, stopped or installed from here.',
      container: { stopped: 'Service stopped', starting: 'Service starting…', running: 'Service running' },
      start: 'Start',
      stop: 'Stop',
      install: 'Install what is missing',
      installFor: 'Install what is missing',
      version: (v) => `Version ${v}`,
      licence: (l) => `Licence: ${l}`,
      gaveUp: 'The service did not come up in time. Ask the engines again, or look at the server.',
      reasons: {
        no_docker: 'Docker does not answer on the server.',
        no_image: 'The image of the 3D service has not been built.',
        no_gpu_runtime: 'Docker has no GPU runtime.',
        no_weights: 'The weights of the engine are not downloaded.',
        no_service: 'The .NET service of the engine is not installed.',
        no_gpu: 'No GPU is available.',
        not_running: 'Everything is there, but the engine\'s service is stopped.',
        unreachable: 'The 3D service does not answer.',
        not_built: 'The image was built without this engine.',
        key_missing: 'No Hugging Face key is saved: save the key of an account that accepted the licence in the server’s tokens.',
        key_rejected: 'Hugging Face does not know the saved key.',
        licence_not_accepted: 'The licence of the weights has not been accepted with the account of the saved key.',
        no_disk: 'There is no room on the disk for the weights.',
        no_image_model: 'No image model is installed on this machine: give a picture instead of a text.',
      },
      unknownReason: (reason) => `It cannot be used now (${reason}).`,
    },
    backends: {
      title: 'How it runs',
      names: { dotnet: '.NET service', docker: 'Docker container' },
      inUse: 'In use',
      saved: 'Chosen by you',
      byDefault: 'Default',
      ready: 'Has everything it needs',
      lacks: (items, bytes) => `Missing: ${items}${bytes ? ` (about ${kb(bytes)})` : ''}`,
      missing: { service: 'the service', weights: 'the weights', docker: 'Docker', image: 'the image', gpu_runtime: 'GPU support' },
      use: 'Use this one',
      useDefault: 'Back to the default',
      choose: 'What it runs on',
    },
    plan: {
      title: (engine) => `Install what ${engine} is missing`,
      backend: (name) => `For: ${name}`,
      parts: 'What is installed',
      part: { service: 'The .NET service', image: 'The Docker image', weights: 'The weights' },
      unknownPart: (part) => `Part "${part}"`,
      noParts: 'Tick at least one part.',
      again: 'Asking what is needed…',
      files: 'Files that are missing',
      size: (bytes) => `About ${kb(bytes)}`,
      licence: (licence) => `Licence: ${licence}`,
      licenceTitle: 'Licence to accept',
      commercial: { yes: 'It allows commercial use.', conditions: 'Commercial use has conditions: read them.', no: 'It does not allow commercial use.', unknown: 'It is not known whether it allows commercial use.' },
      licenceRead: 'Read the licence',
      licenceRecorded: 'This server already recorded an acceptance of this licence. Confirm anyway that you read it.',
      licenceAgree: (name) => `I have read the “${name}” licence and I accept it`,
      licenceNeeded: 'The server does not install this engine without your acceptance: tick the box to be able to install.',
      free: (bytes) => `Free on the disk: ${kb(bytes)}`,
      path: (path) => `They go to ${path}`,
      gated: 'These weights are on a repository that asks every account to accept its licence. Do it with your own Hugging Face account and save that account’s key in the server’s tokens: this page never accepts a licence or asks for a key.',
      key: 'Read the licence before you download: it is yours to follow.',
      noRoom: 'The disk has no room for this download.',
      confirm: 'Install',
      cancel: 'Not now',
      loading: 'Asking the server what is needed…',
    },
    job: {
      title: (engine) => `Install of ${engine}`,
      state: { running: 'Installing', done: 'Installed', failed: 'Failed', cancelled: 'Cancelled' },
      cancel: 'Cancel the install',
      failedWhy: 'Why it failed',
      now: (part) => `Now: ${part}`,
    },
    generate: {
      open: 'Make a model',
      title: 'Make a 3D model',
      fromText: 'From a text',
      fromPicture: 'From a picture',
      picture: 'Picture',
      noPicture: 'Choose the picture of the object.',
      tooBig: 'The picture is larger than 20 MB.',
      needOne: 'Give a text or a picture.',
      largest: 'A generated model has no real size: when you place it in a scene, size it by its largest dimension.',
      send: 'Make it',
      sending: 'Sending…',
      cancel: 'Cancel',
      blocked: 'No engine can be used now: start or install one first.',
    },
    generations: {
      title: 'Generations',
      empty: 'Nothing has been made yet.',
      state: { queued: 'Waiting', running: 'Making', done: 'Done', failed: 'Failed', cancelled: 'Cancelled' },
      step: { picture: 'Drawing the picture', model: 'Making the model' },
      fromPicture: 'From a picture',
      cancel: 'Cancel',
      remove: 'Remove from the list',
      removeNote: 'The model stays in the library.',
      relabel: 'Label',
      model: (id) => `Model ${id}`,
    },
  },
  failed: (status) => `The server answered ${status}.`,
};

export const textsFor = (lang: Lang): Texts => (lang === 'es' ? es : en);
