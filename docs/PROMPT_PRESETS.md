# Prompt presets

The library of prompts of Dataset Studio: for people to pick from, and for the assistant to receive as **examples of the house style**. Both come from one store.

## The model

A preset is

```json
{ "id": "…", "kind": "image", "title": "Neon street in the rain", "prompt": "…", "negative": "…", "tags": ["neon", "night"],
  "engine": "ace-step", "language": "en", "source": "dashboards-lab-sample", "source_id": "image-01", "licence": "CC0-1.0",
  "nsfw": false, "own": false, "created_at": "2026-11-13T00:00:00.000Z" }
```

- `kind` is `image | video | motion | music | animation` (Images, Video scenes, Animated graphics, Songs, Animated piece).
- `prompt` is at most 2000 characters, what the server's writers take.
- **Provenance is mandatory**: a preset without `source` and `licence` is never taken. `source_id` lets an import tell it already has an entry.
- `own` is true for the ones you saved: only those can be deleted. A bundled or imported preset is read-only.

## The bundle

A file of presets, as the server's `orchestrator prompts fetch --out` writes it (see "Filling the library from public datasets" below) and the Presets page imports it:

```json
{ "format": "prompt-presets", "version": 1, "meta": { }, "items": [ { "kind": "image", "prompt": "…", "source": "…", "licence": "…" } ] }
```

An import answers how many items were **added**, how many were **already there** (same `source` and `source_id`) and which were **refused**, by their index in the file: no kind the kit knows, no prompt, a prompt over 2000 characters, no source, no licence. Importing the same bundle twice adds nothing the second time.

## Where they live

`PromptsPort` has two adapters, picked by what the server has:

1. **The server's store** (`/api/prompts`, asked for by this repository and implemented in mediaOrquestator): shared across machines and dashboards; it lists at most 200 a call, a bundled or imported preset answers `403` on delete, and `POST /api/prompts/import` takes at most 20 000 items and 32 MiB. When a server answers `404` (an older one), the adapter says it is unavailable and the studio falls back.
2. **The browser's**: the **sample** bundled in the kit (25 presets written for this repository, CC0-1.0, five per kind, in `libs/dataset-studio-kit/src/lib/presets/sample/presets-sample.json`) plus your own and the imported ones, kept in IndexedDB. The browser may refuse it (a private window, blocked data): then they live as long as the page, and nothing is reported. With `?adapter=memory` they live in memory.

## How the examples are chosen

At most **five** examples go with a generation, never the library:

- **The presets you pinned**, when there are any (up to five).
- Else the **best matches** for the kind, the engine, the tags and the words of the brief (a plain term match: a word in the title counts 3, in a tag 2, in the prompt 1), **only when the server takes examples** on its calls (`examples` in the catalog's `features`; the server of 2026-11-13 lists it). A preset that matches nothing is never chosen: no match, no example.

A server that does not take `examples` has the **pinned** ones put into the text itself (up to two short ones, when the limit of 2000 allows), and the studio says so. Picked-by-match examples are never put into the text: that would change what you wrote on a guess.

## What the presets page does

Search, kind and tag chips, **Insert** (on the studio, fills the brief and, when the preset has them, the negative and the generator of a song), **Pin as example**, **Delete** for your own, **Import a bundle** and **Export my presets**.

## Filling the library from public datasets

This is the **server's** job: `orchestrator prompts fetch [--source id] [--max n] [--seed n] [--media-dir DIR] [--sources file] [--out file] [--dry-run]` (mediaOrquestator, its own `docs/PROMPT_PRESETS.md` has the details). By default it writes **read-only bundled presets** straight into `<MEDIA_DIR>/prompts/<kind>/` (cache and report in `prompts/.cache/`) and a running server reads them without a restart; with `--out file` it writes the `prompt-presets` bundle above instead, which is what the **Presets** page of Dataset Studio and `POST /api/prompts/import` take. Running it twice adds nothing. (It began as a script in this repository, `npm run prompts:fetch`, and moved to the server on 2026-11-13: the rules were the same and the real run gave the same presets.)

What it keeps from the rules the studio's bundles rely on:

- **The licence gate is read, not declared.** For each source it asks the Hugging Face API for the dataset card and takes the licence: the source is used only if **every** value is in the allow-list (`cc0-1.0`, `cc-by-4.0`, `apache-2.0`, `mit`) **and** the one the source expects is among them; an unknown, missing, non-commercial or share-alike licence refuses it, and the report names it with the licence read.
- **Only what is named is read:** the files and the columns of each source (a lyrics column is never named, so it is never read); no images, no audio.
- **Cleaning, mapping and sampling:** trim and collapse whitespace; drop under 12 or over 2000 characters, an address on its own, a prompt with no letters left, exact duplicates, what is over the source's NSFW thresholds (a block-list of explicit words for a source with no score); `title` from the text before the first comma, `tags` from the fragments after it (2 to 30 characters, at most 12) plus the source's own, `kind`, an `engine` hint, `language`, `source`, `source_id` and `licence`; a **seeded sample** (seed 42 by default) taken after cleaning, so the same sources and seed give the same presets. The report counts what each rule dropped.
- **Provenance on every item:** the Presets page shows `source` and `licence` on each card.

**Sources.** Used: `poloclub/diffusiondb` (cc0-1.0, image, `metadata.parquet`, up to 10 000), `Rapidata/awesome-text2video-prompts` (apache-2.0, video, all 198). **Off:** `Kukedlc/suno-ai-music-dataset` (cc-by-4.0, music): its card declares CC-BY-4.0, but its prompts were written by Suno's users and nothing can check that the uploader could license them, so it runs only when named with `--source`, for strictly local use, never for a bundle that is shared or published. Not used: `Gustavosta/Stable-Diffusion-Prompts` (the card declares **no licence** and the prompts were scraped from Lexica), `LanguageBind/Open-Sora-Plan-v1.2.0` (captions, licence not verified); the per-model datasets of Rapidata and `humair025/suno-audio` were not checked.

**A real run (2026-11-13, seed 42, made with the script this repository had, repeated by the server's command).** DiffusionDB: 2 000 000 rows read, 230 016 over the NSFW thresholds, 416 627 duplicates (416 610 with the server, which measures lengths in characters and not in UTF-16 units), 17 677 too short (17 892), 603 empty, 449 with no letters (280) and 72 addresses; 1 334 556 kept and 10 000 sampled. Rapidata: 198 read, 197 kept. **10 197 presets**, about 4.4 MB. Imported on the Presets page it takes 0.3 s, a search answers in about 20 ms, it is still there after reloading and importing it again adds nothing.

**CC-BY needs attribution.** Every item keeps its `source` and `licence`; that is the attribution, in a form that survives into the server's store.

**Importing.** On the **Presets** page (or the Dataset section of the full), *Import a bundle*: it answers how many were added, how many were already there and which were refused, by index. Without a library on the server, imported presets are kept in this browser's IndexedDB and are read-only; with `POST /api/prompts/import` the server keeps them for every machine, as read-only bundled presets (an import cannot be undone from the API: try a small bundle first). A server that already ran `orchestrator prompts fetch` has them; importing the same bundle adds only what is not there by `source` and `source_id`.
