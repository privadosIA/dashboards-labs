/**
 * The name this dashboard gives itself to the server on every generation and retouch it asks for (`client` in the
 * API; the form is `^[a-z0-9-]{1,32}$`). The server groups its statistics and metrics by it, so each dashboard of this
 * workspace has its own and it is not shared or generic.
 */
export const STUDIO_CLIENT = 'video-studio';
