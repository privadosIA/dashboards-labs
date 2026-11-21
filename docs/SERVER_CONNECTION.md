# The connection to the server

[← Back to the README](../README.md)

The Connection box that every dashboard shares: address, token and tickets for media.

## The connection to the server

`@lab/server-connection` is what each dashboard uses to choose the server and sign in to it, like the embedded one: the **Connection**
button in the header opens the "Server connection" box (address, token, "Remember in this browser", test and
save), with the `--lab-*` colors of the dashboard that shows it. It is added in `app.config.ts` with
`provideServerConnection({ lang })` (instead of `provideApiClient`) and `withInterceptors([unauthorizedInterceptor])` (a 401
opens the box), and `<lab-connection-button />` in the header; the template already includes it. The token goes as `Bearer` only to the chosen
server, and for what cannot carry a header (`<video>`, `<img>`, downloads) `TicketService.withTicket(url)` is used, which
adds a short-lived ticket (`/api/auth/ticket`). The settings are saved under a common key, so two dashboards of the same
origin share server and token. A deployment can put a `config.json` next to the dashboard
(`{"server": "http://host:4666", "token": "..."}`) so that it starts pointing at another server: it is used when the person has not
saved anything, it is not saved on its own and it is ignored if it is missing or not JSON; a token there is as secret as the page. If the
server is another origin, its `--cors-origin` has to include the dashboard's;
to try it from the dev server (`npm run <dashboard>:serve`), it must list `http://localhost:4200`. The terminal never asks for the address or the token.

### Behind a login proxy: no token, and "under works" when the server is off

The build also works served by a reverse proxy that asks for a login (HTTP basic authentication) and forwards `/api/` to the server adding
the server's token itself: the dashboard uses the page's own origin, asks for no token and never opens the Connection box on start. When
that proxy cannot reach the server it answers `/api/` with `503` and the body `{"error":"offline"}`; the dashboard recognises exactly that
answer (any other failure keeps the "cannot connect" banner) and goes to `/obras.html`, a static bilingual page of the build that asks
`/api/health` every 15 seconds while it is visible, and returns to the app as soon as the server answers. A server that serves the
dashboard itself never answers that way, so nothing changes there.
