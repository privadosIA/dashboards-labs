import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { ApiService } from '../core/api.service';
import { ConnectionService } from '@lab/server-connection';
import { PageHeaderComponent } from '../shared/page-header/page-header.component';
import { SwaggerHostComponent } from './swagger-host.component';

type Doc = Record<string, unknown>;

/**
 * The API reference (spec: api-docs-view): the server's OpenAPI document in
 * Swagger UI, with «Try it out» aimed at the connected server and the
 * session's token. The document comes through the authenticated API client,
 * so it needs the same token as every other call.
 */
@Component({
  selector: 'app-api-docs-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageHeaderComponent, MatIconModule, MatProgressBarModule, SwaggerHostComponent],
  templateUrl: './api-docs-page.component.html',
  styleUrl: './api-docs-page.component.scss',
})
export class ApiDocsPageComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly conn = inject(ConnectionService);

  protected readonly loading = signal(true);
  protected readonly spec = signal<Doc | null>(null);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.api.openapi().subscribe({
      next: (doc) => {
        this.spec.set(this.prepare(doc));
        this.loading.set(false);
      },
      error: (err: unknown) => {
        this.error.set(this.describe(err));
        this.loading.set(false);
      },
    });
  }

  /**
   * Points «Try it out» at the connected server and drops the security
   * scheme from what Swagger UI sees: the dashboard owns the credential, so
   * there is no «Authorize» box and the token is never shown.
   */
  private prepare(doc: Doc): Doc {
    const copy = JSON.parse(JSON.stringify(doc)) as Doc;
    copy['servers'] = [{ url: this.conn.server() || window.location.origin }];
    delete copy['security'];
    const components = copy['components'] as Doc | undefined;
    if (components) delete components['securitySchemes'];
    return copy;
  }

  private describe(err: unknown): string {
    const status = err instanceof HttpErrorResponse ? err.status : -1;
    if (status === 401) {
      return $localize`:@@api.err.unauthorized:The server rejected the request: the token is missing or incorrect. Enter it under “Connection” (side menu) and reload this page.`;
    }
    if (status === 0) {
      return $localize`:@@api.err.unreachable:Cannot connect to the server. Check the address under “Connection” and that “orchestrator serve” is running.`;
    }
    if (status === 404) {
      return $localize`:@@api.err.notFound:This server does not publish the API description. Update the server to a version that includes /api/openapi.json.`;
    }
    return $localize`:@@api.err.other:Could not load the API description.`;
  }
}
