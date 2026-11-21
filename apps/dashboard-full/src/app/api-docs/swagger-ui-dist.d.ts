declare module 'swagger-ui-dist/swagger-ui-es-bundle.js' {
  interface SwaggerRequest {
    url: string;
    headers: Record<string, string>;
    [key: string]: unknown;
  }
  interface SwaggerUIOptions {
    spec?: unknown;
    domNode?: Element | null;
    deepLinking?: boolean;
    requestInterceptor?: (req: SwaggerRequest) => SwaggerRequest;
    [key: string]: unknown;
  }
  const SwaggerUIBundle: (options: SwaggerUIOptions) => unknown;
  export default SwaggerUIBundle;
}
