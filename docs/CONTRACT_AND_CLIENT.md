# The contract and the API client

[← Back to the README](../README.md)

How the dashboards know the server: a versioned copy of its OpenAPI contract and a typed client generated from it.

## The contract

```bash
npm run contract:sync -- ../mediaOrquestator/internal/server/openapi.yaml     # desde un fichero
npm run contract:sync -- http://servidor:4666/api/openapi.json --token …      # o desde un servidor en marcha
npm run contract:check -- http://servidor:4666/api/openapi.json               # ¿sigue al día? (no escribe nada)
```

`contract/SOURCE.json` says where the copy came from, when and its hash. When the server changes its contract, `contract:check`
ends with an error naming what changed.

## The API client

The types come from the contract, they are not written by hand:

```bash
npm run client:generate   # contract/openapi.yaml -> libs/api-client/src/lib/generated/schema.d.ts
npm run client:check      # falla si el fichero generado no es el que produce el contrato
```

After `contract:sync`, run `client:generate` and commit both changes together. The client (`@lab/api-client`) is
called by path and method, and a path or a body that the contract does not have does not compile:

```ts
provideHttpClient(), provideApiClient({ baseUrl: 'http://127.0.0.1:4667', token: () => miToken })

api.get('/api/settings')                                          // los seis bloques, tipados
api.get('/api/runs/{id}/resources', { path: { id } })
api.put('/api/settings', { body: { ollama_host: '192.168.1.50' } })
api.getBlob('/api/reviews/{rid}/findings/{fid}/frame', { path: { rid, fid } })   // ficheros
api.streamUrl('/api/runs/{id}/events', { path: { id } })                         // solo la dirección del flujo
```
