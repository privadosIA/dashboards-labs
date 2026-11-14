import { HttpContextToken } from '@angular/common/http';

/**
 * Set on every request the API client makes. The caller of `ApiClient` gets an `ApiError` and says what failed next to the
 * form or the card it is about, so an application that shows a notice for failed requests (an interceptor) can leave these
 * out: it reads this token and does not open a second message. A 401 can still be answered by it.
 */
export const ERROR_EXPLAINED_BY_SCREEN = new HttpContextToken<boolean>(() => false);
