export type ConnectionLang = 'es' | 'en';

/** Every text of the connection dialog and button, in each language. Add a key and TypeScript asks for both. */
export interface ConnectionTexts {
  button: { label: string; thisServer: string };
  dialog: {
    title: string;
    server: string;
    serverHint: string;
    token: string;
    tokenHint: string;
    remember: string;
    test: string;
    cancel: string;
    save: string;
  };
  probe: { testing: string; ok: string; unauthorized: string; unreachable: string };
}

const es: ConnectionTexts = {
  button: { label: 'Conexión', thisServer: 'este servidor' },
  dialog: {
    title: 'Conexión con el servidor',
    server: 'Dirección del servidor',
    serverHint: 'Vacío = el servidor que sirve esta página.',
    token: 'Token de acceso',
    tokenHint: 'El valor de --token / ORCHESTRATOR_TOKEN del servidor.',
    remember: 'Recordar en este navegador',
    test: 'Probar conexión',
    cancel: 'Cancelar',
    save: 'Guardar conexión',
  },
  probe: {
    testing: 'Probando…',
    ok: 'Conexión correcta.',
    unauthorized: 'El servidor responde, pero el token falta o es incorrecto.',
    unreachable: 'No se puede conectar. Revisa la dirección, el --addr del servidor y que tu origen esté en su --cors-origin.',
  },
};

const en: ConnectionTexts = {
  button: { label: 'Connection', thisServer: 'this server' },
  dialog: {
    title: 'Server connection',
    server: 'Server address',
    serverHint: 'Empty = the server that serves this page.',
    token: 'Access token',
    tokenHint: "The value of the server's --token / ORCHESTRATOR_TOKEN.",
    remember: 'Remember in this browser',
    test: 'Test connection',
    cancel: 'Cancel',
    save: 'Save connection',
  },
  probe: {
    testing: 'Testing…',
    ok: 'The connection works.',
    unauthorized: 'The server answers, but the token is missing or wrong.',
    unreachable: "Cannot connect. Check the address, the server's --addr and that your origin is in its --cors-origin.",
  },
};

export const connectionTexts = (lang: ConnectionLang): ConnectionTexts => (lang === 'en' ? en : es);
