import type { Lang } from '@lab/forms-kit';

/** The texts of the assistant picker, its consent and its Add an external provider form. */
export interface AssistTexts {
  title: string;
  hint: string;
  routing: string;
  external: string;
  loading: string;
  consentTitle: (name: string) => string;
  consentText: (name: string, address: string) => string;
  consentAccept: string;
  consentDecline: string;
  consentFailed: (reason: string) => string;
  noOllama: string;
  addTitle: string;
  addOpen: string;
  addClose: string;
  addHint: string;
  addSubmit: string;
  adding: string;
  addFailed: (reason: string) => string;
}

const es: AssistTexts = {
  title: 'El asistente de este flujo',
  hint: 'Un proveedor y un modelo para todo el flujo: escribir la canción, las propuestas y los borradores de partes. Vale solo para estas llamadas; el enrutado del servidor no se toca.',
  routing: 'Como lo enruta el servidor',
  external: 'externo',
  loading: 'Leyendo los proveedores…',
  consentTitle: (name) => `Enviar datos a «${name}»`,
  consentText: (name, address) => `«${name}» no es este ordenador: lo que el flujo le envíe (tu frase, los textos de la canción, las propuestas y las imágenes) saldrá de esta máquina hacia ${address}. Solo se envía si aceptas.`,
  consentAccept: 'Acepto',
  consentDecline: 'No, dejarlo como estaba',
  consentFailed: (reason) => `No se pudo registrar el consentimiento: ${reason}`,
  noOllama: 'No hay un Ollama al que hablar y el servidor no tiene otro proveedor guardado: añade uno externo para poder escribir con el asistente.',
  addTitle: 'Añadir un proveedor externo',
  addOpen: 'Añadir proveedor',
  addClose: 'Cerrar',
  addHint: 'La clave se envía una sola vez al servidor y no se vuelve a mostrar. Un servidor que no sea esta máquina necesita https para recibirla.',
  addSubmit: 'Añadir',
  adding: 'Añadiendo…',
  addFailed: (reason) => `No se pudo añadir: ${reason}`,
};

const en: AssistTexts = {
  title: "This flow's assistant",
  hint: "One provider and model for the whole flow: the song's writing, the proposals and the part drafts. It applies to those calls only; the server's routing is never changed.",
  routing: 'As the server routes it',
  external: 'external',
  loading: 'Reading the providers…',
  consentTitle: (name) => `Send data to "${name}"`,
  consentText: (name, address) => `"${name}" is not this computer: what the flow sends it (your sentence, the song's texts, the proposals and the images) will leave this machine for ${address}. It is sent only if you accept.`,
  consentAccept: 'I accept',
  consentDecline: 'No, leave it as it was',
  consentFailed: (reason) => `The consent could not be recorded: ${reason}`,
  noOllama: 'There is no Ollama to talk to and the server has no other saved provider: add an external one to write with the assistant.',
  addTitle: 'Add an external provider',
  addOpen: 'Add provider',
  addClose: 'Close',
  addHint: 'The key is sent once to the server and never shown again. A server that is not this machine needs https to receive it.',
  addSubmit: 'Add',
  adding: 'Adding…',
  addFailed: (reason) => `It could not be added: ${reason}`,
};

const TEXTS: Record<Lang, AssistTexts> = { es, en };

export const assistTextsFor = (lang: Lang): AssistTexts => TEXTS[lang];
