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
