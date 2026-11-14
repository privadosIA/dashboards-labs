# The dashboard

[← Back to the README](../README.md)

What the Dashboard Full is, how to run it and where its tutorial is.

The look of the dashboard comes from its own tokens; to use Tailwind utilities or the animation helpers in one, read [`TAILWIND_BRIDGE.md`](TAILWIND_BRIDGE.md).

## Dashboard Full

`apps/dashboard-full/` is the server's management dashboard (projects, editor, Create, music, runs, gallery,
models, environment, settings, statistics and the API page), moved from the server's embedded `web/` by the
change `migrate-web-to-dashboard-full`. It is independent of the other dashboards and talks to the server through the contract. It also mounts the studios of the small dashboards, each from its shared library: Animation (`video-anim`), Video, Music and Dataset (`dataset-studio`: the generator and the presets, `/dataset`, with a slim bar for its two links). They are **not** items of the side menu: they are windows of their own, opened in a new tab from the buttons of the Projects page (Animation, Video, Music, Guided flow and Dataset), drawn with a slim header (the mark, a way back to Projects, the name of the section, the connection, the language and the theme) and without the side menu. Their addresses are the same (`/animation`, `/video`, `/music`, `/dataset`), so they can also be typed or bookmarked; none is in the simple version, where those addresses lead to Create. The music projects (the **Music** button of the Projects header creates one; a project of mode `music` opens its page `/projects/:id/music`) are listed in Projects when the mode selector includes `music`; the address `/projects?mode=music` shows only them without changing the modes you chose. Motion Edit (`motion-edit`) and Vector (`vector-studio`) are tabs of the Animation section, under `/animation/motion-edit` and `/animation/vector` (the old `/motion-edit` and `/vector` redirect there): Motion Edit is the result of an animation, so each piece of Animation has an **Edit in Motion Edit** link, and Vector is part of Parts, so Parts links to the Vector catalog and a part of the user's that carries a vector model has **Open in Vector**.

```bash
npm run dashboard-full:serve      # ng serve; el servidor se pone en el botón Conexión de la página (su --cors-origin debe listar http://localhost:4200)
npx ng test dashboard-full --no-watch
npm run dashboard-full:build      # dist/dashboard-full/browser
```

The server serves it from a folder, on the same origin as the API and without `--cors-origin`:

```bash
orchestrator serve --web-dir ../dashboards-labs/dist/dashboard-full/browser    # o ORCHESTRATOR_WEB_DIR
```

Files with a hash in the name are cached for a year; `index.html`, `ngsw.json`, `ngsw-worker.js` and the manifest are
revalidated, so a new build is seen without restarting the server and the installed PWA is updated. More in
`apps/dashboard-full/README.md`.

**Tutorial:** the screen-by-screen guide to the dashboard, with screenshots, is in [`docs/TUTORIAL.md`](TUTORIAL.md)
([Spanish](TUTORIAL.es.md)); it was moved here from the server because it describes screens of this front end. The concepts, the
terminal and the complete example with its `scenes.yaml` stayed in the server's `TUTORIAL.md`.
