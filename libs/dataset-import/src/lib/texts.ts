import type { DatasetFailure } from './port';
import type { DatasetLang, DatasetMode } from './model';

export interface DatasetTexts {
  /** The button that opens the dialog. */
  button: string;
  title: string;
  /** What the file step says, by mode. */
  intro: Record<DatasetMode, string>;
  choose: string;
  reading: string;
  chooseAnother: string;
  report: string;
  counts: { entries: string; imported: string; rejected: string; quiet: Record<DatasetMode, string> };
  projectName: string;
  projectHint: string;
  confirm: string;
  creating: string;
  done: string;
  close: string;
  /** "{n} entries are now in the project {id}": `{n}` and `{id}` are replaced. */
  created: Record<DatasetMode, string>;
  where: string;
  /** "The form has been filled with {title}": `{title}` is replaced. */
  filled: string;
  errors: Record<DatasetFailure, string>;
}

const es: DatasetTexts = {
  button: 'Importar dataset',
  title: 'Importar un dataset',
  intro: {
    music: 'Elige un archivo JSON o HTML con tus canciones: el servidor lee la descripción y las etiquetas de cada una y te dice qué ha entendido antes de crear nada.',
    video: 'Elige un archivo JSON o HTML con tus escenas: el servidor lee la descripción y las etiquetas de cada una y te dice qué ha entendido antes de crear nada.',
    motion: 'Elige un archivo JSON o HTML con tus gráficos animados: el servidor lee la descripción y las marcas de cada uno (Graphic:, Duration:, Part:…) y te dice qué ha entendido antes de crear nada.',
  },
  choose: 'Elegir archivo',
  reading: 'Leyendo…',
  chooseAnother: 'Elegir otro archivo',
  report: 'Lo que ha entendido el servidor',
  counts: { entries: 'Entradas', imported: 'Importadas', rejected: 'Rechazadas', quiet: { music: 'Instrumentales', video: 'Sin voz', motion: 'Sin voz' } },
  projectName: 'Nombre del proyecto',
  projectHint: 'Letras, números y «._-», empezando por una letra o un número (máx. 64).',
  confirm: 'Crear el proyecto',
  creating: 'Creando…',
  done: 'Hecho',
  close: 'Cerrar',
  created: {
    music: 'Se han creado {n} canciones en el proyecto {id}.',
    video: 'Se han creado {n} escenas en el proyecto {id}.',
    motion: 'Se han creado {n} gráficos en el proyecto {id}.',
  },
  where: 'Lo verás también en el dashboard completo, en Proyectos.',
  filled: 'He rellenado el formulario Personalizado con la primera canción: «{title}». Lo que tenías escrito se ha sustituido.',
  errors: {
    rejected: 'El servidor no ha podido leer ese archivo.',
    taken: 'Ya hay un proyecto con ese nombre: elige otro.',
    invalidName: 'Ese nombre no vale: usa letras, números y «._-».',
    unreachable: 'No se llega al servidor. Revisa la conexión.',
  },
};

const en: DatasetTexts = {
  button: 'Import dataset',
  title: 'Import a dataset',
  intro: {
    music: 'Choose a JSON or HTML file with your songs: the server reads the description and the tags of each one and tells you what it understood before anything is created.',
    video: 'Choose a JSON or HTML file with your scenes: the server reads the description and the tags of each one and tells you what it understood before anything is created.',
    motion: 'Choose a JSON or HTML file with your animated graphics: the server reads the description and the markers of each one (Graphic:, Duration:, Part:…) and tells you what it understood before anything is created.',
  },
  choose: 'Choose a file',
  reading: 'Reading…',
  chooseAnother: 'Choose another file',
  report: 'What the server understood',
  counts: { entries: 'Entries', imported: 'Imported', rejected: 'Rejected', quiet: { music: 'Instrumental', video: 'Silent', motion: 'Silent' } },
  projectName: 'Project name',
  projectHint: 'Letters, numbers and “._-”, starting with a letter or a number (at most 64).',
  confirm: 'Create the project',
  creating: 'Creating…',
  done: 'Done',
  close: 'Close',
  created: {
    music: '{n} songs were created in the project {id}.',
    video: '{n} scenes were created in the project {id}.',
    motion: '{n} graphics were created in the project {id}.',
  },
  where: 'You will see it in the full dashboard too, under Projects.',
  filled: 'The Custom form has been filled with the first song: “{title}”. What you had written there was replaced.',
  errors: {
    rejected: 'The server could not read that file.',
    taken: 'There is already a project with that name: choose another.',
    invalidName: 'That name is not valid: use letters, numbers and “._-”.',
    unreachable: 'The server cannot be reached. Check the connection.',
  },
};

/** The words of the dialog in the dashboard's language. */
export const datasetTexts = (lang: DatasetLang): DatasetTexts => (lang === 'es' ? es : en);
