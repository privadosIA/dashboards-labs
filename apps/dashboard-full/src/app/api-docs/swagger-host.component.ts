import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewEncapsulation,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';

import { ConnectionService } from '@lab/server-connection';

/**
 * Hosts Swagger UI exactly as it ships. It lives in a shadow root so its
 * stock stylesheet cannot reach the rest of the app (and the app's styles do
 * not reach it): no restyling, no leaks. The bundle is loaded on demand, so
 * it only costs anything when the API page is opened.
 */
@Component({
  selector: 'app-swagger-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
  templateUrl: './swagger-host.component.html',
})
export class SwaggerHostComponent {
  /** The OpenAPI document to render. */
  readonly spec = input.required<Record<string, unknown>>();

  private readonly conn = inject(ConnectionService);
  private readonly root = viewChild.required<ElementRef<HTMLElement>>('root');

  constructor() {
    effect(() => {
      const spec = this.spec();
      const node = this.root().nativeElement;
      void this.render(spec, node);
    });
  }

  private async render(spec: Record<string, unknown>, node: HTMLElement): Promise<void> {
    const { default: SwaggerUIBundle } = await import('swagger-ui-dist/swagger-ui-es-bundle.js');
    // Swagger UI's own stylesheet, served as an asset (it is far over the
    // component-style budget) and loaded inside the shadow root only.
    const shadow = node.getRootNode() as ShadowRoot;
    if (!shadow.querySelector('link[data-swagger-css]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = new URL('swagger-ui/swagger-ui.css', document.baseURI).href;
      link.dataset['swaggerCss'] = '';
      // Swagger UI is drawn for a white page (its own background is
      // transparent), so it gets its native canvas instead of the app's
      // dark one; nothing else about it is changed.
      const canvas = document.createElement('style');
      canvas.textContent = ':host { display: block; background: #fff; border-radius: 8px; padding: 0 8px 16px; }';
      shadow.insertBefore(canvas, shadow.firstChild);
      shadow.insertBefore(link, shadow.firstChild);
    }
    const apiBase = `${this.conn.server()}/api`;
    SwaggerUIBundle({
      spec,
      domNode: node,
      deepLinking: false,
      // The token is read at request time and only attached to requests aimed
      // at the connected server's API, so a change in “Connection” applies at
      // once and the token is never part of the document or the DOM.
      requestInterceptor: (req) => {
        const token = this.conn.token();
        const target = new URL(req.url, window.location.href).href;
        const base = new URL(apiBase, window.location.href).href;
        if (token && (target === base || target.startsWith(`${base}/`))) {
          req.headers['Authorization'] = `Bearer ${token}`;
        }
        return req;
      },
    });
  }
}
