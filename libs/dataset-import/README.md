# @lab/dataset-import

The import of a dataset for the standalone studios: a dialog (file, the server's report, name, confirm) and the header button that opens it. A dashboard
provides it once and puts the button in its header:

```ts
provideDatasetImport({ lang, mode: 'music', memory }) // mode: 'music' | 'video'; memory makes up the answers (?adapter=memory)
```
```html
<lab-dataset-import-button />
```

It makes the same two calls as the full's wizard (`POST /api/import/preview` with `mode`, then `POST /api/import/confirm`); the dataset is the server's format
(a JSON list of `[id, title, lora_info, full_prompt]` tuples, or an HTML page) and is never parsed here. A taken name answers 409 and the dialog says so. The
library reads only `--lab-*` tokens and keeps its texts in Spanish and English (`texts.ts`).

A dashboard with a form may take the first entry of the file into it: provide `DATASET_ENTRY_SINK` (a function that receives `{ title, style, lyrics }`) and
the dialog calls it once the project is created and says so. The entry is read from the project file the server wrote (`firstEntry`, a reader of that file's
fixed shape, with no YAML library so that the first page stays light), never from the dataset. Music Studio's sink is `takeEntry` of the kit, which fills the Custom form.
