# The dashboard

[← Back to the README](../README.md)

What the Dashboard Full is, how to run it and where its tutorial is.

The look of the dashboard comes from its own tokens; to use Tailwind utilities or the animation helpers in one, read [`TAILWIND_BRIDGE.md`](TAILWIND_BRIDGE.md).

## Dashboard Full

`apps/dashboard-full/` is the server's management dashboard (projects, editor, Create, music, runs, gallery,
models, environment, settings, statistics and the API page), moved from the server's embedded `web/`. It talks to the server through the contract. The music projects (the **Music** button of the Projects header creates one; a project of mode `music` opens its page `/projects/:id/music`) are listed in Projects when the mode selector includes `music`; the address `/projects?mode=music` shows only them without changing the modes you chose.

```bash
npm run dashboard-full:serve      # ng serve; el servidor se pone en el botón Conexión de la página (su --cors-origin debe listar http://localhost:4200)
npx ng test dashboard-full --no-watch
npm run dashboard-full:build      # dist/dashboard-full/browser
```

The server serves it from a folder, on the same origin as the API and without `--cors-origin`:

```bash
veritmo serve --web-dir ../dashboards-labs/dist/dashboard-full/browser    # o VERITMO_WEB_DIR
```

Files with a hash in the name are cached for a year; `index.html`, `ngsw.json`, `ngsw-worker.js` and the manifest are
revalidated, so a new build is seen without restarting the server and the installed PWA is updated. More in
`apps/dashboard-full/README.md`.

**Tutorial:** the screen-by-screen guide to the dashboard, with screenshots, is in [`docs/TUTORIAL.md`](TUTORIAL.md)
([Spanish](TUTORIAL.es.md)); it was moved here from the server because it describes screens of this front end. The concepts, the
terminal and the complete example with its `scenes.yaml` stayed in the server's `TUTORIAL.md`.
