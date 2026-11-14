/**
 * The name a dashboard gives itself to the server on every piece it makes (`client` in the API; the form is
 * `^[a-z0-9-]{1,32}$`). The server groups its statistics and metrics by it, so each dashboard of this workspace has its
 * own, which it passes to `provideMusicMotion`. This is only what the adapter uses when it is built with none.
 */
export const ANIM_CLIENT = 'music-motion';
