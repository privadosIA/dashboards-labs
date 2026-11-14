import type { Lang } from '@lab/forms-kit';

export interface HelpGroup {
  name: string;
  rows: ReadonlyArray<{ keys: string; does: string }>;
}

/** Every text the studio's screens show, in each language (the shell's title and language label are the dashboard's own). Add a key here and TypeScript asks for both languages. */
export interface Texts {
  nav: { editor: string; catalog: string };
  loading: string;
  retry: string;
  unknownError: string;
  editor: {
    name: string;
    untitled: string;
    open: string;
    save: string;
    send: string;
    undo: string;
    redo: string;
    help: string;
    toolbar: string;
    leaveAsk: string;
    draftFound: (when: string) => string;
    draftContinue: string;
    draftDiscard: string;
    draftTooBig: string;
    draftRefused: string;
    openAsk: (file: string) => string;
    openNew: string;
    openAdd: string;
    cancel: string;
    imported: (file: string) => string;
    importedCleaned: (file: string, removed: number) => string;
    importLarge: string;
    importStyled: (n: number) => string;
    importDeep: (n: number) => string;
    notAFile: (file: string) => string;
    cannotOpen: (reason: string) => string;
    saved: (file: string) => string;
    dismiss: string;
    example: string;
    exampleFailed: string;
    emptyHint: string;
    describe: string;
    describeHint: string;
  };
  exporting: {
    label: string;
    animated: string;
    still: string;
    part: string;
    doesNotMove: string;
    partProblem: (problem: string) => string;
    done: (files: string) => string;
  };
  help: { title: string; close: string; groups: readonly HelpGroup[] };
  catalog: {
    title: string;
    intro: string;
    needsServer: string;
    empty: string;
    reload: string;
    open: string;
    remove: string;
    force: string;
    cancel: string;
    removing: (name: string) => string;
    busy: (name: string, reason: string) => string;
    refused: (reason: string) => string;
    thumbnail: (name: string) => string;
    description: string;
    opened: (name: string) => string;
    noDescription: string;
  };
}

const helpGroups = (es: boolean): readonly HelpGroup[] => [
  {
    name: es ? 'Documento' : 'Document',
    rows: [
      { keys: 'Ctrl+O', does: es ? 'Abrir un SVG o un documento .vector.json' : 'Open an SVG or a .vector.json document' },
      { keys: 'Ctrl+S', does: es ? 'Guardar el documento como .vector.json' : 'Save the document as .vector.json' },
      { keys: 'Ctrl+E', does: es ? 'Abrir el menú de exportar' : 'Open the export menu' },
      { keys: 'Ctrl+Z', does: es ? 'Deshacer' : 'Undo' },
      { keys: 'Ctrl+Shift+Z', does: es ? 'Rehacer' : 'Redo' },
      { keys: '?', does: es ? 'Esta ayuda' : 'This help' },
    ],
  },
  {
    name: es ? 'Lienzo' : 'Canvas',
    rows: [
      { keys: es ? 'Clic' : 'Click', does: es ? 'Elegir un elemento (Mayús: añadir; vacío: quitar la selección)' : 'Pick an element (Shift: add; empty space: clear)' },
      { keys: es ? 'Arrastrar' : 'Drag', does: es ? 'Mover (con los tiradores: escalar y girar; Mayús: proporción o pasos de 15°; Alt en un tirador: desde el ancla). Se pega a los bordes y centros de los demás elementos' : 'Move (with the handles: scale and rotate; Shift: keep the ratio or 15° steps; Alt on a handle: from the anchor). It snaps to the edges and centres of the other elements' },
      { keys: es ? 'Flechas' : 'Arrows', does: es ? 'Mover 1 unidad (Mayús: 10)' : 'Nudge 1 unit (Shift: 10)' },
      { keys: 'Ctrl + ' + (es ? 'rueda' : 'wheel'), does: es ? 'Acercar y alejar' : 'Zoom' },
      { keys: es ? 'Espacio + arrastrar' : 'Space + drag', does: es ? 'Desplazar el lienzo' : 'Pan' },
      { keys: '0', does: es ? 'Ajustar la mesa de trabajo' : 'Fit the artboard' },
    ],
  },
  {
    name: es ? 'Dibujo y composición' : 'Drawing and composing',
    rows: [
      { keys: 'V', does: es ? 'Herramienta Seleccionar' : 'Select tool' },
      { keys: 'R  E  L', does: es ? 'Rectángulo, elipse y línea: arrastra en el lienzo (Mayús: cuadrado, círculo o 45°; un clic da el tamaño de siempre)' : 'Rectangle, ellipse and line: drag on the canvas (Shift: square, circle or 45°; a click gives the default size)' },
      { keys: 'T', does: es ? 'Texto: clic y escribe; Intro o salir del campo lo guarda, Esc lo descarta' : 'Text: click and type; Enter or leaving the field keeps it, Esc drops it' },
      { keys: 'I', does: es ? 'Imagen: clic y elige un PNG, JPEG, WebP o SVG de hasta 2 MB' : 'Image: click and choose a PNG, JPEG, WebP or SVG of up to 2 MB' },
      { keys: es ? 'Mayús con una herramienta' : 'Shift with a tool', does: es ? 'Mantener la herramienta después de dibujar (si no, vuelve a Seleccionar)' : 'Keep the tool after drawing (otherwise it goes back to Select)' },
      { keys: es ? 'Doble clic en un texto' : 'Double click on a text', does: es ? 'Escribir el texto en su sitio' : 'Type the text in place' },
      { keys: 'Alt + ' + (es ? 'arrastrar' : 'drag'), does: es ? 'Arrastrar una copia (con Alt pulsado no se pega a los bordes)' : 'Drag a copy (with Alt held it does not snap)' },
      { keys: 'Ctrl+D', does: es ? 'Duplicar la selección' : 'Duplicate the selection' },
      { keys: 'Ctrl+G', does: es ? 'Agrupar la selección' : 'Group the selection' },
      { keys: 'Ctrl+Shift+G', does: es ? 'Deshacer el grupo (no si el grupo está animado)' : 'Ungroup (not if the group is animated)' },
      { keys: '[  ]', does: es ? 'Un paso atrás o adelante entre sus hermanos (Mayús: al fondo o al frente)' : 'One step back or forward among its siblings (Shift: to the back or the front)' },
    ],
  },
  {
    name: es ? 'Compás' : 'Beat',
    rows: [
      { keys: es ? 'Sección Compás' : 'Beat section', does: es ? 'Enlazar una propiedad al compás: pulso (suma y se apaga hasta el siguiente), alternar entre pulsos pares e impares, o volumen. Se oye dentro de una pieza; aquí se editan y se guardan, pero el lienzo no los muestra' : 'Link a property to the beat: pulse (adds and fades until the next), alternate between even and odd beats, or loudness. They are heard inside a piece; here they are edited and saved, but the canvas does not show them' },
    ],
  },
  {
    name: es ? 'Tiempo' : 'Time',
    rows: [
      { keys: es ? 'Espacio' : 'Space', does: es ? 'Reproducir o pausar' : 'Play or pause' },
      { keys: es ? 'Doble clic en una fila' : 'Double click on a row', does: es ? 'Añadir un fotograma clave ahí' : 'Add a keyframe there' },
      { keys: es ? 'Suprimir' : 'Delete', does: es ? 'Borrar el fotograma clave elegido' : 'Delete the chosen keyframe' },
      { keys: es ? 'Flechas en un rombo' : 'Arrows on a diamond', does: es ? 'Moverlo un fotograma (Mayús: diez)' : 'Move it a frame (Shift: ten)' },
    ],
  },
];

const es: Texts = {
  nav: { editor: 'Editor', catalog: 'Catálogo' },
  loading: 'Cargando…',
  retry: 'Reintentar',
  unknownError: 'No se pudo hablar con el servidor.',
  editor: {
    name: 'Nombre',
    untitled: 'sin título',
    open: 'Abrir',
    save: 'Guardar',
    send: 'Enviar al catálogo',
    undo: 'Deshacer',
    redo: 'Rehacer',
    help: 'Ayuda',
    toolbar: 'Herramientas del documento',
    leaveAsk: 'Hay cambios sin guardar. ¿Salir y perderlos?',
    draftFound: (when) => `Hay un documento sin guardar de ${when}.`,
    draftContinue: 'Continuar',
    draftDiscard: 'Descartar',
    draftTooBig: 'El documento es demasiado grande para guardarlo como borrador en el navegador: guárdalo en un archivo.',
    draftRefused: 'El navegador no deja guardar el borrador: guarda el documento en un archivo.',
    openAsk: (file) => `Ya hay un documento abierto. ¿Qué hago con «${file}»?`,
    openNew: 'Abrirlo como documento nuevo',
    openAdd: 'Añadirlo a este',
    cancel: 'Cancelar',
    imported: (file) => `«${file}» importado.`,
    importedCleaned: (file, n) => `«${file}» importado; se quitó lo que una página no debe ejecutar ni pedir de fuera (${n}).`,
    importLarge: 'El archivo pesa más de 300 KB: va dos veces dentro de la parte y la hará pesada. El servidor acepta envíos de hasta 8 MB; si no cabe, el envío lo dirá.',
    importStyled: (n) => `${n} elementos tienen el relleno o el trazo puesto por una hoja de estilos y no se pueden cambiar aquí.`,
    importDeep: (n) => `${n} elementos están a más de seis niveles: se mueven con su elemento padre.`,
    notAFile: (file) => `«${file}» no es un SVG ni un documento .vector.json.`,
    cannotOpen: (reason) => `No se pudo abrir: ${reason}`,
    saved: (file) => `Guardado como ${file}.`,
    dismiss: 'Cerrar el aviso',
    example: 'Ejemplo',
    exampleFailed: 'No se pudo cargar el ejemplo.',
    emptyHint: 'Empieza abriendo un SVG, o prueba con el ejemplo: un logo ya animado.',
    describe: 'Describir',
    describeHint: 'O describe un elemento y un modelo de tu servidor lo dibuja.',
  },
  exporting: {
    label: 'Exportar',
    animated: 'SVG animado',
    still: 'SVG fijo en el cabezal',
    part: 'Parte (manifest.json y part.html)',
    doesNotMove: 'La parte no se mueve: pon algún fotograma clave.',
    partProblem: (problem) => `No se puede exportar como parte: ${problem}`,
    done: (files) => `Exportado: ${files}.`,
  },
  help: { title: 'Atajos', close: 'Cerrar', groups: helpGroups(true) },
  catalog: {
    title: 'Partes vectoriales del catálogo',
    intro: 'Las partes tuyas del servidor que guardan un modelo vectorial. Abre una para cambiarla; las demás partes están en video-anim.',
    needsServer: 'El catálogo necesita un servidor: elige uno en el botón Conexión.',
    empty: 'Todavía no hay partes vectoriales. Envía una desde el editor.',
    reload: 'Volver a leer',
    open: 'Abrir',
    remove: 'Borrar',
    force: 'Borrar igualmente',
    cancel: 'Cancelar',
    removing: (name) => `¿Borrar la parte «${name}»?`,
    busy: (name, reason) => `«${name}» está en uso: ${reason}`,
    refused: (reason) => `El servidor no la borró: ${reason}`,
    thumbnail: (name) => `Vista previa de ${name}`,
    description: 'Descripción',
    opened: (name) => `Abierta «${name}»: al enviarla puedes reemplazarla.`,
    noDescription: 'Sin descripción',
  },
};

const en: Texts = {
  nav: { editor: 'Editor', catalog: 'Catalog' },
  loading: 'Loading…',
  retry: 'Retry',
  unknownError: 'Could not reach the server.',
  editor: {
    name: 'Name',
    untitled: 'untitled',
    open: 'Open',
    save: 'Save',
    send: 'Send to catalog',
    undo: 'Undo',
    redo: 'Redo',
    help: 'Help',
    toolbar: 'Document tools',
    leaveAsk: 'There are unsaved changes. Leave and lose them?',
    draftFound: (when) => `There is an unsaved document from ${when}.`,
    draftContinue: 'Continue',
    draftDiscard: 'Discard',
    draftTooBig: 'The document is too big to keep as a draft in the browser: save it to a file.',
    draftRefused: 'The browser will not keep the draft: save the document to a file.',
    openAsk: (file) => `A document is already open. What should I do with "${file}"?`,
    openNew: 'Open it as a new document',
    openAdd: 'Add it to this one',
    cancel: 'Cancel',
    imported: (file) => `"${file}" imported.`,
    importedCleaned: (file, n) => `"${file}" imported; what a page must not run or fetch from outside was taken out (${n}).`,
    importLarge: 'The file is over 300 KB: it is in the part twice and makes it heavy. The server takes requests up to 8 MB; if it does not fit, sending will say so.',
    importStyled: (n) => `${n} elements have their fill or stroke set by a stylesheet and cannot be changed here.`,
    importDeep: (n) => `${n} elements are more than six levels deep: they move with their parent.`,
    notAFile: (file) => `"${file}" is neither an SVG nor a .vector.json document.`,
    cannotOpen: (reason) => `It could not be opened: ${reason}`,
    saved: (file) => `Saved as ${file}.`,
    dismiss: 'Close the notice',
    example: 'Example',
    exampleFailed: 'The example could not be loaded.',
    emptyHint: 'Start by opening an SVG, or try the example: a logo that is already animated.',
    describe: 'Describe',
    describeHint: 'Or describe an element and a model on your server draws it.',
  },
  exporting: {
    label: 'Export',
    animated: 'Animated SVG',
    still: 'Still SVG at the playhead',
    part: 'Part (manifest.json and part.html)',
    doesNotMove: 'The part does not move: add a keyframe.',
    partProblem: (problem) => `It cannot be exported as a part: ${problem}`,
    done: (files) => `Exported: ${files}.`,
  },
  help: { title: 'Shortcuts', close: 'Close', groups: helpGroups(false) },
  catalog: {
    title: 'Vector parts in the catalog',
    intro: 'Your parts on the server that carry a vector model. Open one to change it; the other parts are in video-anim.',
    needsServer: 'The catalog needs a server: choose one with the Connection button.',
    empty: 'There are no vector parts yet. Send one from the editor.',
    reload: 'Read again',
    open: 'Open',
    remove: 'Delete',
    force: 'Delete anyway',
    cancel: 'Cancel',
    removing: (name) => `Delete the part "${name}"?`,
    busy: (name, reason) => `"${name}" is in use: ${reason}`,
    refused: (reason) => `The server did not delete it: ${reason}`,
    thumbnail: (name) => `Preview of ${name}`,
    description: 'Description',
    opened: (name) => `Opened "${name}": when you send it you can replace it.`,
    noDescription: 'No description',
  },
};

const TEXTS: Record<Lang, Texts> = { es, en };

export const textsFor = (lang: Lang): Texts => TEXTS[lang];
