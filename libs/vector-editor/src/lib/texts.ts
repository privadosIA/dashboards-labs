import type { EditProblem } from './model/edits';

export type VectorLang = 'es' | 'en';

/** The words of the editor's components. */
export interface VectorTexts {
  /** The animatable properties, by name. */
  readonly properties: Readonly<Record<string, string>>;
  readonly canvas: {
    readonly label: string;
    readonly artboard: string;
    readonly rotate: string;
    readonly anchor: string;
    readonly scale: string;
    readonly marquee: string;
  };
  readonly tree: {
    readonly label: string;
    readonly empty: string;
    readonly rename: string;
    readonly visible: string;
    readonly hidden: string;
    readonly locked: string;
    readonly unlocked: string;
    readonly deeper: string;
    readonly group: string;
    readonly dragHint: string;
  };
  readonly props: {
    readonly label: string;
    readonly none: string;
    readonly transform: string;
    readonly appearance: string;
    readonly anchorX: string;
    readonly anchorY: string;
    readonly colour: string;
    readonly paintNone: string;
    readonly paintKeep: string;
    readonly paintVar: string;
    readonly addKeyframe: string;
    readonly removeKeyframe: string;
    readonly parameter: string;
    readonly paramName: string;
    readonly paramDescription: string;
    readonly paramDefault: string;
    readonly paramCreate: string;
    readonly cancel: string;
    readonly isParameter: string;
    readonly removeParameter: string;
    readonly text: string;
    readonly vars: Readonly<Record<string, string>>;
    readonly shape: string;
    readonly content: string;
    readonly font: string;
    readonly fonts: Readonly<Record<string, string>>;
    readonly weight: string;
    readonly textAlign: string;
    readonly textAligns: Readonly<Record<string, string>>;
    readonly preserve: string;
    readonly preserves: Readonly<Record<string, string>>;
    readonly x2: string;
    readonly y2: string;
    readonly mixed: string;
    readonly paramMin: string;
    readonly paramMax: string;
    readonly parameterOf: (property: string) => string;
  };
  readonly beat: {
    readonly title: string;
    readonly silent: string;
    readonly noCurve: string;
    readonly add: string;
    readonly property: string;
    readonly kind: string;
    readonly kinds: Readonly<Record<string, string>>;
    readonly hints: Readonly<Record<string, string>>;
    readonly amount: string;
    readonly decay: string;
    readonly even: string;
    readonly odd: string;
    readonly remove: (property: string) => string;
    readonly none: string;
  };
  readonly tools: {
    readonly label: string;
    /** The name of each tool, with its key. */
    readonly names: Readonly<Record<string, string>>;
    /** The name a node gets when it is drawn, by kind. */
    readonly nodeNames: Readonly<Record<string, string>>;
    readonly textEdit: string;
    readonly notices: Readonly<Record<'image-type' | 'image-size' | 'image-large' | 'image-failed', string>>;
    readonly dismiss: string;
    readonly pickImage: string;
  };
  readonly align: {
    readonly label: string;
    readonly toArtboard: string;
    readonly modes: Readonly<Record<string, string>>;
    readonly distribute: Readonly<Record<string, string>>;
  };
  readonly timeline: {
    readonly label: string;
    readonly ruler: string;
    readonly empty: string;
    readonly allNodes: string;
    readonly ease: string;
    readonly eases: Readonly<Record<string, string>>;
    readonly remove: string;
    readonly keyframe: string;
    readonly seconds: string;
    readonly playhead: string;
  };
  readonly transport: {
    readonly label: string;
    readonly play: string;
    readonly pause: string;
    readonly loop: string;
    readonly stepBack: string;
    readonly stepForward: string;
    readonly start: string;
    readonly end: string;
    readonly fps: string;
    readonly time: string;
    readonly frame: string;
  };
  readonly page: {
    readonly label: string;
    readonly left: string;
    readonly right: string;
    readonly bottom: string;
  };
  readonly send: {
    readonly title: string;
    readonly replaceTitle: (name: string) => string;
    readonly confirm: string;
    readonly replace: string;
    readonly sendNew: string;
    readonly approve: string;
    readonly cancel: string;
    readonly close: string;
    readonly working: string;
    readonly review: string;
    readonly previewAlt: (n: number) => string;
    readonly approved: (name: string) => string;
    readonly replaced: (name: string) => string;
    readonly nameTaken: (name: string) => string;
    readonly noLevels: string;
    readonly failed: string;
    readonly notSent: (reason: string) => string;
    readonly doesNotMove: string;
    readonly tooBig: (size: string, limit: string) => string;
    readonly checking: string;
  };
  readonly describe: {
    readonly title: string;
    readonly intro: string;
    readonly confirm: string;
    readonly cancel: string;
    readonly close: string;
    readonly writing: (model: string) => string;
    readonly waitHint: string;
    readonly cancelWrite: string;
    readonly assistant: string;
    readonly notWritten: (reason: string) => string;
  };
  /** Why an edit was refused, by the problem's code. */
  readonly problems: Readonly<Record<EditProblem, string>>;
}

const TEXTS: Record<VectorLang, VectorTexts> = {
  es: {
    properties: { x: 'X', y: 'Y', scaleX: 'Escala X', scaleY: 'Escala Y', rotate: 'Giro', opacity: 'Opacidad', fill: 'Relleno', stroke: 'Trazo', strokeWidth: 'Grosor del trazo', width: 'Ancho', height: 'Alto', rx: 'Radio de esquina', fontSize: 'Tamaño del texto' },
    canvas: { label: 'Lienzo', artboard: 'Mesa de trabajo', rotate: 'Girar', anchor: 'Ancla', scale: 'Escalar', marquee: 'Selección' },
    tree: {
      label: 'Capas',
      empty: 'Todavía no hay nada. Importa un SVG.',
      rename: 'Nombre',
      visible: 'Ocultar',
      hidden: 'Mostrar',
      locked: 'Desbloquear',
      unlocked: 'Bloquear',
      deeper: 'Lo que está a más de seis niveles se mueve con su elemento padre y no se puede elegir solo.',
      group: 'Grupo',
      dragHint: 'Arrastra una capa para cambiar su orden o meterla en un grupo.',
    },
    props: {
      label: 'Propiedades',
      none: 'Elige un elemento para ver sus propiedades.',
      transform: 'Transformación',
      appearance: 'Apariencia',
      anchorX: 'Ancla X',
      anchorY: 'Ancla Y',
      colour: 'Color',
      paintNone: 'Sin pintura',
      paintKeep: 'Como en el SVG',
      paintVar: 'Variable del diseño',
      addKeyframe: 'Añadir fotograma clave',
      removeKeyframe: 'Quitar fotograma clave',
      parameter: 'Parámetro',
      paramName: 'Nombre del parámetro',
      paramDescription: 'Descripción',
      paramDefault: 'Valor por defecto',
      paramCreate: 'Crear parámetro',
      cancel: 'Cancelar',
      isParameter: 'Es un parámetro de la parte',
      removeParameter: 'Quitar el parámetro',
      text: 'Texto',
      vars: { accent: 'Acento', fg: 'Texto', bg: 'Fondo', dark: 'Oscuro', light: 'Claro' },
      shape: 'Forma',
      content: 'Texto',
      font: 'Tipo de letra',
      fonts: { display: 'Títulos de la parte', body: 'Cuerpo de la parte', grotesk: 'Grotesca', heavy: 'Negra', mono: 'Monoespaciada', serif: 'Con serifa', rounded: 'Redondeada', condensed: 'Condensada' },
      weight: 'Grosor de la letra',
      textAlign: 'Alineación del texto',
      textAligns: { start: 'Izquierda', middle: 'Centro', end: 'Derecha' },
      preserve: 'Ajuste de la imagen',
      preserves: { contain: 'Contener', cover: 'Cubrir', stretch: 'Estirar' },
      x2: 'Final X',
      y2: 'Final Y',
      mixed: 'Valores distintos',
      paramMin: 'Mínimo',
      paramMax: 'Máximo',
      parameterOf: (property) => `Parámetro: ${property}`,
    },
    beat: {
      title: 'Compás',
      silent: 'El compás se oye dentro de una pieza: aquí los enlaces se editan y se guardan, pero el lienzo no los muestra.',
      noCurve: 'Esta pieza no trae curva de volumen: el enlace de volumen no tiene efecto aquí.',
      add: 'Añadir enlace',
      property: 'Propiedad',
      kind: 'Tipo',
      kinds: { pulse: 'Pulso', alternate: 'Alternar', loudness: 'Volumen' },
      hints: {
        pulse: 'Suma la cantidad en cada pulso y la va quitando hasta el siguiente.',
        alternate: 'Toma un valor en los pulsos pares y otro en los impares.',
        loudness: 'Suma la cantidad por el volumen de la canción (0 a 1).',
      },
      amount: 'Cantidad',
      decay: 'Caída (1 a 8)',
      even: 'Pulso par',
      odd: 'Pulso impar',
      remove: (property) => `Quitar el enlace de ${property}`,
      none: 'Sin enlaces al compás.',
    },
    tools: {
      label: 'Herramientas de dibujo',
      names: { select: 'Seleccionar (V)', rect: 'Rectángulo (R)', ellipse: 'Elipse (E)', line: 'Línea (L)', text: 'Texto (T)', image: 'Imagen (I)' },
      nodeNames: { rect: 'Rectángulo', ellipse: 'Elipse', line: 'Línea', text: 'Texto', image: 'Imagen' },
      textEdit: 'Escribe el texto',
      notices: {
        'image-type': 'Solo se leen imágenes PNG, JPEG, WebP o SVG.',
        'image-size': 'La imagen pesa más de 2 MB: no se añade.',
        'image-large': 'La imagen pesa más de 300 KB: va dos veces dentro de la parte y la hará pesada. El servidor acepta envíos de hasta 8 MB; si no cabe, el envío lo dirá.',
        'image-failed': 'No se pudo leer la imagen.',
      },
      dismiss: 'Cerrar el aviso',
      pickImage: 'Elige una imagen',
    },
    align: {
      label: 'Alinear',
      toArtboard: 'Respecto al lienzo',
      modes: { left: 'Izquierda', centre: 'Centro', right: 'Derecha', top: 'Arriba', middle: 'Medio', bottom: 'Abajo' },
      distribute: { horizontal: 'Repartir en horizontal', vertical: 'Repartir en vertical' },
    },
    timeline: {
      label: 'Línea de tiempo',
      ruler: 'Regla de tiempo',
      empty: 'Nada animado. Pulsa el rombo junto a una propiedad.',
      allNodes: 'Todos los elementos',
      ease: 'Suavizado',
      eases: { linear: 'Lineal', in: 'Entrada', out: 'Salida', 'in-out': 'Entrada y salida', step: 'Escalón' },
      remove: 'Borrar fotograma clave',
      keyframe: 'Fotograma clave',
      seconds: 's',
      playhead: 'Cabezal',
    },
    transport: {
      label: 'Reproducción',
      play: 'Reproducir',
      pause: 'Pausar',
      loop: 'Repetir',
      stepBack: 'Un fotograma atrás',
      stepForward: 'Un fotograma adelante',
      start: 'Al principio',
      end: 'Al final',
      fps: 'Fotogramas por segundo',
      time: 'Tiempo',
      frame: 'Fotograma',
    },
    page: { label: 'Editor vectorial', left: 'Ancho del panel de capas', right: 'Ancho del panel de propiedades', bottom: 'Alto de la línea de tiempo' },
    send: {
      title: 'Enviar al catálogo',
      replaceTitle: (name) => `La parte «${name}» ya está en el catálogo`,
      confirm: 'Enviar',
      replace: 'Reemplazar la parte',
      sendNew: 'Enviar como nueva',
      approve: 'Aprobar',
      cancel: 'Cancelar',
      close: 'Cerrar',
      working: 'El servidor está escribiendo y comprobando la parte…',
      review: 'Así dibujó el servidor la parte. Si te gusta, apruébala.',
      previewAlt: (n) => `Imagen ${n} de la vista previa del servidor`,
      approved: (name) => `La parte «${name}» está en el catálogo.`,
      replaced: (name) => `La parte «${name}» se reemplazó.`,
      nameTaken: (name) => `Ya hay una parte con el nombre «${name}».`,
      noLevels: 'Elige al menos un nivel.',
      failed: 'El servidor no aceptó la parte:',
      notSent: (reason) => `No se envió: ${reason}`,
      doesNotMove: 'La parte no se mueve: pon algún fotograma clave.',
      tooBig: (size, limit) => `La parte pesa unos ${size} y el servidor no acepta envíos de más de ${limit}. Una imagen cuenta dos veces (va en el dibujo y en el modelo): quítala, usa una más pequeña o simplifica el SVG.`,
      checking: 'Comprobando el nombre…',
    },
    describe: {
      title: 'Describir un elemento',
      intro: 'Un modelo de tu servidor dibuja un primer elemento con lo que cuentes. Después lo animas como cualquier otro.',
      confirm: 'Dibujar',
      cancel: 'Cancelar',
      close: 'Cerrar',
      writing: (model) => (model ? `El modelo ${model} está dibujando…` : 'El modelo está dibujando…'),
      waitHint: 'En la CPU puede tardar varios minutos. Puedes cancelar cuando quieras.',
      cancelWrite: 'Cancelar la espera',
      assistant: 'Asistente que dibuja',
      notWritten: (reason) => `No se dibujó: ${reason}`,
    },
    problems: {
      'no-node': 'Ese elemento ya no está.',
      'track-parametrised': 'Esa propiedad es un parámetro de la parte: no se puede cambiar aquí.',
      'param-animated': 'Esa propiedad está animada: quita sus fotogramas clave antes de hacerla un parámetro, o al revés.',
      'param-name': 'El nombre del parámetro lleva letras minúsculas, cifras y _, y empieza por una letra.',
      'param-duplicate': 'Ya hay un parámetro con ese nombre o sobre esa propiedad.',
      'param-target': 'Eso no puede ser un parámetro.',
      'no-keyframe': 'Ese fotograma clave ya no está.',
      'group-animated': 'Ese grupo está animado: su movimiento no se puede pasar a lo que lleva dentro, así que no se deshace.',
      'not-a-shape': 'Eso no es una forma, un texto o un grupo del tipo que pide el cambio.',
      'beat-kind': 'Ese enlace al compás no vale para esa propiedad: un color solo puede alternar entre dos colores y un número entre dos números.',
    },
  },
  en: {
    properties: { x: 'X', y: 'Y', scaleX: 'Scale X', scaleY: 'Scale Y', rotate: 'Rotation', opacity: 'Opacity', fill: 'Fill', stroke: 'Stroke', strokeWidth: 'Stroke width', width: 'Width', height: 'Height', rx: 'Corner radius', fontSize: 'Text size' },
    canvas: { label: 'Canvas', artboard: 'Artboard', rotate: 'Rotate', anchor: 'Anchor', scale: 'Scale', marquee: 'Selection' },
    tree: {
      label: 'Layers',
      empty: 'Nothing here yet. Import an SVG.',
      rename: 'Name',
      visible: 'Hide',
      hidden: 'Show',
      locked: 'Unlock',
      unlocked: 'Lock',
      deeper: 'What is more than six levels deep moves with its parent and cannot be picked on its own.',
      group: 'Group',
      dragHint: 'Drag a layer to change its order or put it in a group.',
    },
    props: {
      label: 'Properties',
      none: 'Pick an element to see its properties.',
      transform: 'Transform',
      appearance: 'Appearance',
      anchorX: 'Anchor X',
      anchorY: 'Anchor Y',
      colour: 'Colour',
      paintNone: 'No paint',
      paintKeep: 'As in the SVG',
      paintVar: 'Design variable',
      addKeyframe: 'Add keyframe',
      removeKeyframe: 'Remove keyframe',
      parameter: 'Parameter',
      paramName: 'Parameter name',
      paramDescription: 'Description',
      paramDefault: 'Default value',
      paramCreate: 'Create parameter',
      cancel: 'Cancel',
      isParameter: 'It is a parameter of the part',
      removeParameter: 'Remove the parameter',
      text: 'Text',
      vars: { accent: 'Accent', fg: 'Text', bg: 'Background', dark: 'Dark', light: 'Light' },
      shape: 'Shape',
      content: 'Text',
      font: 'Font',
      fonts: { display: 'Part titles', body: 'Part body', grotesk: 'Grotesque', heavy: 'Heavy', mono: 'Monospace', serif: 'Serif', rounded: 'Rounded', condensed: 'Condensed' },
      weight: 'Font weight',
      textAlign: 'Text alignment',
      textAligns: { start: 'Left', middle: 'Centre', end: 'Right' },
      preserve: 'Image fit',
      preserves: { contain: 'Contain', cover: 'Cover', stretch: 'Stretch' },
      x2: 'End X',
      y2: 'End Y',
      mixed: 'Different values',
      paramMin: 'Minimum',
      paramMax: 'Maximum',
      parameterOf: (property) => `Parameter: ${property}`,
    },
    beat: {
      title: 'Beat',
      silent: 'The beat is heard inside a piece: here the links are edited and saved, but the canvas does not show them.',
      noCurve: 'This piece has no loudness curve: a loudness link has no effect here.',
      add: 'Add link',
      property: 'Property',
      kind: 'Kind',
      kinds: { pulse: 'Pulse', alternate: 'Alternate', loudness: 'Loudness' },
      hints: {
        pulse: 'Adds the amount on each beat and takes it away until the next one.',
        alternate: 'Takes one value on even beats and another on odd ones.',
        loudness: 'Adds the amount times the song’s loudness (0 to 1).',
      },
      amount: 'Amount',
      decay: 'Decay (1 to 8)',
      even: 'Even beat',
      odd: 'Odd beat',
      remove: (property) => `Remove the link of ${property}`,
      none: 'No beat links.',
    },
    tools: {
      label: 'Drawing tools',
      names: { select: 'Select (V)', rect: 'Rectangle (R)', ellipse: 'Ellipse (E)', line: 'Line (L)', text: 'Text (T)', image: 'Image (I)' },
      nodeNames: { rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', text: 'Text', image: 'Image' },
      textEdit: 'Type the text',
      notices: {
        'image-type': 'Only PNG, JPEG, WebP or SVG images are read.',
        'image-size': 'The image is over 2 MB: it is not added.',
        'image-large': 'The image is over 300 KB: it is in the part twice and makes it heavy. The server takes requests up to 8 MB; if it does not fit, sending will say so.',
        'image-failed': 'The image could not be read.',
      },
      dismiss: 'Dismiss the notice',
      pickImage: 'Choose an image',
    },
    align: {
      label: 'Align',
      toArtboard: 'To the artboard',
      modes: { left: 'Left', centre: 'Centre', right: 'Right', top: 'Top', middle: 'Middle', bottom: 'Bottom' },
      distribute: { horizontal: 'Distribute horizontally', vertical: 'Distribute vertically' },
    },
    timeline: {
      label: 'Timeline',
      ruler: 'Time ruler',
      empty: 'Nothing animated. Press the diamond beside a property.',
      allNodes: 'All elements',
      ease: 'Easing',
      eases: { linear: 'Linear', in: 'In', out: 'Out', 'in-out': 'In and out', step: 'Step' },
      remove: 'Delete keyframe',
      keyframe: 'Keyframe',
      seconds: 's',
      playhead: 'Playhead',
    },
    transport: {
      label: 'Playback',
      play: 'Play',
      pause: 'Pause',
      loop: 'Loop',
      stepBack: 'Back one frame',
      stepForward: 'Forward one frame',
      start: 'To the start',
      end: 'To the end',
      fps: 'Frames per second',
      time: 'Time',
      frame: 'Frame',
    },
    page: { label: 'Vector editor', left: 'Width of the layers panel', right: 'Width of the properties panel', bottom: 'Height of the timeline' },
    send: {
      title: 'Send to catalog',
      replaceTitle: (name) => `The part "${name}" is already in the catalog`,
      confirm: 'Send',
      replace: 'Replace the part',
      sendNew: 'Send as new',
      approve: 'Approve',
      cancel: 'Cancel',
      close: 'Close',
      working: 'The server is writing and checking the part…',
      review: 'This is how the server drew the part. If you like it, approve it.',
      previewAlt: (n) => `Picture ${n} of the server's preview`,
      approved: (name) => `The part "${name}" is in the catalog.`,
      replaced: (name) => `The part "${name}" was replaced.`,
      nameTaken: (name) => `There is already a part called "${name}".`,
      noLevels: 'Choose at least one level.',
      failed: 'The server did not accept the part:',
      notSent: (reason) => `It was not sent: ${reason}`,
      doesNotMove: 'The part does not move: add a keyframe.',
      tooBig: (size, limit) => `The part is about ${size} and the server does not take requests over ${limit}. A picture counts twice (it is in the drawing and in the model): remove it, use a smaller one or simplify the SVG.`,
      checking: 'Checking the name…',
    },
    describe: {
      title: 'Describe an element',
      intro: "A model on your server draws a first element from what you tell it. Then you animate it like any other.",
      confirm: 'Draw',
      cancel: 'Cancel',
      close: 'Close',
      writing: (model) => (model ? `The model ${model} is drawing…` : 'The model is drawing…'),
      waitHint: 'On the CPU it can take several minutes. You can cancel any time.',
      cancelWrite: 'Stop waiting',
      assistant: 'Assistant that draws',
      notWritten: (reason) => `It was not drawn: ${reason}`,
    },
    problems: {
      'no-node': 'That element is no longer there.',
      'track-parametrised': 'That property is a parameter of the part: it cannot be changed here.',
      'param-animated': 'That property is animated: remove its keyframes before making it a parameter, or the other way round.',
      'param-name': 'A parameter name has lower case letters, digits and _, and starts with a letter.',
      'param-duplicate': 'There is already a parameter with that name or on that property.',
      'param-target': 'That cannot be a parameter.',
      'no-keyframe': 'That keyframe is no longer there.',
      'group-animated': 'That group is animated: its motion cannot be passed on to what is inside, so it is not ungrouped.',
      'not-a-shape': 'That is not a shape, a text or a group of the kind the change needs.',
      'beat-kind': 'That beat link does not fit that property: a colour can only alternate between two colours, and a number between two numbers.',
    },
  },
};

export const vectorTexts = (lang: VectorLang): VectorTexts => TEXTS[lang];
