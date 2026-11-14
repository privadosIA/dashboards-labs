import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  inject,
  isDevMode,
  LOCALE_ID,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideEnvironmentInitializer,
} from '@angular/core';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { MatIconRegistry } from '@angular/material/icon';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { provideDatasetImport } from '@lab/dataset-import';
import { provideDatasetStudio } from '@lab/dataset-studio-kit';
import { provideMotionEdit } from '@lab/motion-edit-kit';
import { provideMotionParts } from '@lab/motion-parts';
import { MUSIC_MOTION_LINKS, provideMusicMotion } from '@lab/music-motion';
import { provideMusicStudio } from '@lab/music-studio-kit';
import { provideVectorStudio } from '@lab/vector-studio-kit';
import { provideServerConnection } from '@lab/server-connection';
import { provideVideoStudio } from '@lab/video-studio-kit';

import { ANIMATION_LINKS } from './animation/animation-links';
import { apiErrorInterceptor } from './core/api-error.interceptor';
import { authInterceptor } from './core/auth.interceptor';
import { activeLang } from './core/language';
import { PaginatorIntl } from './core/paginator-intl';
import { provideAppDynamicForms } from './shared/dynamic/dynamic-forms.providers';
import { SectionLinksService } from './shell/section-links.service';
import { routes } from './app.routes';

/**
 * The one place that wires the shared libraries. The API is the server the person chose in the connection box (the one
 * that serves the page when none). The management API is still called through the app's own `ApiService` (HttpClient),
 * so the token and the 401 are handled by the interceptors below until each area moves to `@lab/api-client`.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: LOCALE_ID, useFactory: activeLang },
    // Keeps the compiled app so it opens fast and says so when the server is down. Never data (see ngsw-config.json).
    provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode(), registrationStrategy: 'registerWhenStable:30000' }),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor, apiErrorInterceptor])),
    provideServerConnection({ lang: activeLang() }),
    provideMotionParts({ lang: activeLang() }),
    provideMusicMotion({ lang: activeLang(), client: 'dashboard-full' }),
    provideVideoStudio({ lang: activeLang(), client: 'dashboard-full' }),
    provideMusicStudio({ lang: activeLang(), client: 'dashboard-full' }),
    provideVectorStudio({ lang: activeLang(), client: 'dashboard-full' }),
    provideMotionEdit({ lang: activeLang(), client: 'dashboard-full' }),
    // The Dataset section: the server's import (preview and creation) and the studio's own provider, at the start, as the other sections'.
    provideDatasetImport({ lang: activeLang(), mode: 'video' }),
    provideDatasetStudio({ lang: activeLang(), client: 'dashboard-full' }),
    { provide: MUSIC_MOTION_LINKS, useValue: ANIMATION_LINKS },
    provideAppDynamicForms(),
    { provide: MatPaginatorIntl, useClass: PaginatorIntl },
    // Outlined fields with no reserved error gap: the default filled style rendered as a tinted block.
    { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: 'outline', subscriptSizing: 'dynamic' } },
    // Icons come from the self-hosted Material Symbols font (styles.scss), not the Material Icons CDN font.
    provideEnvironmentInitializer(() => inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined')),
    // Which section buttons the deployment overrules (`sections` of its config.json), known before the first screen.
    provideAppInitializer(() => inject(SectionLinksService).load()),
  ],
};
