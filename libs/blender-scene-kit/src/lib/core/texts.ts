import type { Lang } from '@lab/forms-kit';

/** The texts of the block, in both languages: what it says and what its operations say when they are refused. */
export interface Texts {
  title: string;
  /** What the section is, when the scene lives in a project (its description is a file of it). */
  introProject: string;
  /** What the section is, when the description is sent with one request. */
  introRequest: string;
  needFile: string;
  write: string;
  change: string;
  wait: string;
  unsaved: string;
  written: (model: string, attempts: number) => string;
  descriptionLabel: string;
  save: string;
  undo: string;
  saving: string;
  frameAlt: string;
  timeLabel: string;
  refresh: string;
  previewNote: string;
  /** The panel of the models the scene can place (only where the host has a place for them). */
  models: {
    title: string;
    intro: string;
    height: string;
    fit: string;
    fitHeight: string;
    fitLargest: string;
    fitNote: string;
    loading: string;
    empty: string;
    upload: string;
    add: string;
    place: string;
    needScene: string;
    remove: string;
    removeAsk: (name: string) => string;
    removeYes: string;
    removeNo: string;
    clips: (n: number) => string;
    noClips: string;
    triangles: (n: number) => string;
    missing: (picture: string) => string;
    missingFix: string;
    pictures: (n: number) => string;
    placeName: Record<'project' | 'piece', string>;
    placed: (id: string) => string;
  };
  problem: {
    noScene: string;
    noValid: string;
    tryAgain: string;
    noBlender: string;
    noModel: string;
    failed: string;
    badJsonAt: (line: number, column: number) => string;
    badJson: string;
    notObject: string;
  };
}

const es: Texts = {
  title: 'Escena 3D',
  introProject: 'Un modelo escribe la descripción de una escena que Blender construye y dibuja. Se guarda en el proyecto como un archivo y puedes editarla a mano.',
  introRequest: 'Un modelo escribe la descripción de una escena que Blender construye y dibuja. Se envía con el vídeo al generarlo y puedes editarla a mano.',
  needFile: 'La escena nombra un archivo que todavía no existe: escribe la descripción antes de guardar el proyecto.',
  write: 'Escribir',
  change: 'Cambiarla',
  wait: 'El modelo está escribiendo y comprobando la escena…',
  unsaved: 'La descripción tiene cambios sin guardar: «Cambiarla» trabaja sobre la guardada.',
  written: (model, attempts) => `Escrita por ${model} en ${attempts} intento(s).`,
  descriptionLabel: 'Descripción (JSON)',
  save: 'Guardar',
  undo: 'Volver a la anterior',
  saving: 'Guardando y comprobando…',
  frameAlt: 'Un fotograma de la escena 3D',
  timeLabel: 'Segundo que dibujar',
  refresh: 'Refrescar',
  previewNote: 'Una vista previa rápida: con ruido y luces distintas a las del resultado final; el encuadre y el tiempo son exactos.',
  models: {
    title: 'Modelos',
    intro: 'Archivos .glb, con sus animaciones, que la escena puede colocar. Añade uno de la biblioteca o sube el tuyo.',
    height: 'El size de un modelo es su altura en metros: un objeto plano, como una pizza de 3 cm, necesita un size pequeño (0,03).',
    fit: 'El size es la',
    fitHeight: 'altura',
    fitLargest: 'dimensión mayor',
    fitNote: 'Un modelo hecho por los motores del servidor no tiene tamaño real: dale el tamaño por su dimensión mayor.',
    loading: 'Leyendo los modelos…',
    empty: 'Todavía no hay modelos.',
    upload: 'Subir un .glb o una imagen',
    add: 'Añadir de la biblioteca',
    place: 'Colocar en la escena',
    needScene: 'Escribe la escena antes de colocar un modelo.',
    remove: 'Quitar',
    removeAsk: (name) => `¿Quitar «${name}»?`,
    removeYes: 'Sí, quitar',
    removeNo: 'No',
    clips: (n) => (n === 1 ? '1 animación' : `${n} animaciones`),
    noClips: 'Sin animaciones',
    triangles: (n) => `${n.toLocaleString('es')} triángulos`,
    missing: (picture) => `Falta la imagen ${picture}`,
    missingFix: 'Súbela, o vuelve a añadir el modelo desde la biblioteca.',
    pictures: (n) => (n === 1 ? '1 imagen' : `${n} imágenes`),
    placeName: { project: 'el proyecto', piece: 'la pieza' },
    placed: (id) => `«${id}» está en la descripción.`,
  },
  problem: {
    noScene: 'Todavía no hay descripción: escribe primero la escena.',
    noValid: 'No salió ninguna descripción que pase las comprobaciones.',
    tryAgain: 'Inténtalo de nuevo o dilo de otra manera.',
    noBlender: 'Hace falta Blender para dibujar la vista previa.',
    noModel: 'No hay un modelo para escribir la escena.',
    failed: 'No se pudo completar la operación.',
    badJsonAt: (line, column) => `El texto no es JSON válido: se rompe en la línea ${line}, columna ${column}.`,
    badJson: 'El texto no es JSON válido.',
    notObject: 'La descripción debe ser un objeto JSON.',
  },
};

const en: Texts = {
  title: '3D scene',
  introProject: 'A model writes the description of a scene that Blender builds and renders. It is saved in the project as a file, and you can edit it by hand.',
  introRequest: 'A model writes the description of a scene that Blender builds and renders. It is sent with the video when you generate it, and you can edit it by hand.',
  needFile: 'The scene names a file that does not exist yet: write the description before saving the project.',
  write: 'Write',
  change: 'Change it',
  wait: 'The model is writing and checking the scene…',
  unsaved: 'The description has changes not saved: «Change it» works on the saved one.',
  written: (model, attempts) => `Written by ${model} in ${attempts} attempt(s).`,
  descriptionLabel: 'Description (JSON)',
  save: 'Save',
  undo: 'Put back the previous one',
  saving: 'Saving and checking…',
  frameAlt: 'A frame of the 3D scene',
  timeLabel: 'Second to draw',
  refresh: 'Refresh',
  previewNote: 'A quick preview: noisy, with lights unlike the final render; the framing and the timing are exact.',
  models: {
    title: 'Models',
    intro: 'The .glb files, with their animations, that the scene can place. Add one from the library or upload your own.',
    height: 'A model’s size is its height in metres: a flat object, such as a pizza 3 cm tall, needs a small size (0.03).',
    fit: 'Size is the',
    fitHeight: 'height',
    fitLargest: 'largest dimension',
    fitNote: 'A model made by the server’s engines has no real size: size it by its largest dimension.',
    loading: 'Reading the models…',
    empty: 'There are no models yet.',
    upload: 'Upload a .glb or a picture',
    add: 'Add from the library',
    place: 'Place in the scene',
    needScene: 'Write the scene before placing a model.',
    remove: 'Remove',
    removeAsk: (name) => `Remove “${name}”?`,
    removeYes: 'Yes, remove',
    removeNo: 'No',
    clips: (n) => (n === 1 ? '1 animation' : `${n} animations`),
    noClips: 'No animations',
    triangles: (n) => `${n.toLocaleString('en')} triangles`,
    missing: (picture) => `The picture ${picture} is missing`,
    missingFix: 'Upload it, or add the model again from the library.',
    pictures: (n) => (n === 1 ? '1 picture' : `${n} pictures`),
    placeName: { project: 'the project', piece: 'the piece' },
    placed: (id) => `“${id}” is in the description.`,
  },
  problem: {
    noScene: 'There is no description yet: write the scene first.',
    noValid: 'No description that passes the checks came out.',
    tryAgain: 'Try again or say it differently.',
    noBlender: 'Blender is needed to draw the preview.',
    noModel: 'There is no model to write the scene.',
    failed: 'The operation could not be completed.',
    badJsonAt: (line, column) => `The text is not valid JSON: it breaks at line ${line}, column ${column}.`,
    badJson: 'The text is not valid JSON.',
    notObject: 'The description must be a JSON object.',
  },
};

export const textsFor = (lang: Lang): Texts => (lang === 'es' ? es : en);
