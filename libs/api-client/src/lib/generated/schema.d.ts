/**
 * GENERATED from contract/openapi.yaml by scripts/generate-client.mjs. Do not edit by hand:
 * change the contract (in the server's repository), sync it and run `npm run client:generate`.
 */

export interface paths {
    "/api/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Checks that the server is alive (no token needed) */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Server is alive. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @example ok */
                            status?: string;
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/openapi.json": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** This description of the API in OpenAPI format */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description OpenAPI 3.0 document. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": Record<string, never>;
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lists the projects
         * @description Each project says who made it in `client` (the `client:` of its `scenes.yaml`; `embedded` if it has none, and `unknown` for a managed one) and, if it comes from the generation API, its `kind` (`generation`, `image_edit` or `video_edit`); with `managed=include` managed projects appear in the list and `client=a,b` keeps only those clients. Id, declared name, mode (`video`, `images` or `music`), scene count and the `adult` label; a music project also reports `track_count`. If the YAML cannot be read, `invalid` and `error`. The server starts censored: projects marked `adult: true` do not appear (and cannot be requested: they answer 404 like a nonexistent one); with `--strict`, neither do those not marked `adult: false`.
         */
        get: {
            parameters: {
                query?: {
                    /** @description `include` also lists the generation API projects (`api-gen-`, `api-edit-`, `api-vid-`) as ordinary projects, with their `client` and `kind`. Without it they are not listed. Any other value is a 400. Music motion animations (`api-mm-`) never appear. */
                    managed?: components["parameters"]["ManagedInclude"];
                    /** @description Comma-separated list of clients (client names, `embedded` or `unknown`): only the items of those clients appear. A name that is not valid is a 400. */
                    client?: components["parameters"]["ClientFilter"];
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description List of projects. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ProjectSummary"][];
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        /** Creates a project with a valid starter scenes.yaml */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @description Project identifier (folder name). */
                        id: string;
                        /** @description Optional: the dashboard that makes the project; stored as `client:` in its `scenes.yaml` and shown in the listings. Without it nothing is stored (the project is `embedded`). A name that is not valid gives a 422. */
                        client?: string;
                    };
                };
            };
            responses: {
                201: components["responses"]["CreatedId"];
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                409: components["responses"]["Conflict"];
                422: components["responses"]["Unprocessable"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Deletes the project, including its tmp/ and out/
         * @description A generation API project (`api-gen-`, `api-edit-`, `api-vid-`) is not deleted here: it answers 400 saying which endpoint deletes it (`DELETE /api/generations/{id}`, `/api/image-edits/{id}` or `/api/video-edits/{id}`) and touches nothing.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Project identifier. */
                    id: components["parameters"]["ProjectId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Project deleted. */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{id}/duplicate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Duplicates the project (scenes.yaml only) */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Project identifier. */
                    id: components["parameters"]["ProjectId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        new_id: string;
                    };
                };
            };
            responses: {
                201: components["responses"]["CreatedId"];
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{id}/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Downloads the project (dataset or package)
         * @description `format=dataset` (the default) writes the scenes (video or images) or the songs (music) in the format the import reads: a JSON of `[id, title, lora_info, full_prompt]` tuples, where `full_prompt` carries the scene text and the `Dialogue:`, `Negative:` (the scene's and the project's), `Motion:`, `Seed:`, `Speed:`, `Silence:` and `Variants:` lines (for music, `Lyrics:`, `Language:`, `BPM:`, `Duration:`, `Key:`, `Time signature:`, `Seed:` and `Variants:`). The project's subject prompt is prepended to each scene, and the style prefix and the voice are merged into each song. What the format cannot carry (models, voice, resolution, animation, camera and look, own images, mixes, favorites, songs made from other songs) is listed in the `X-Export-Notes` header (URL-encoded JSON); `X-Export-Count` says how many entries were written. `format=zip` downloads the complete package: `scenes.yaml` (all settings), the `sources/` files, a README (`README.txt`) and the recipe (`RECIPE.md` to read and `recipe.json` for the program: the models, voice and LoRA it uses with their catalog and download link, the settings it generates with, and whether they still follow the catalog's recommended ones), without the models or the generated output (`out/`, `tmp/`). It is imported with `/api/import/package/preview` and `/confirm`. An unknown format answers 400; a project with no scenes or songs cannot be exported as a dataset (422).
         */
        get: {
            parameters: {
                query?: {
                    format?: "dataset" | "zip";
                    /** @description Language of the recipe inside the zip. */
                    lang?: "es" | "en";
                };
                header?: never;
                path: {
                    /** @description Project identifier. */
                    id: components["parameters"]["ProjectId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The downloadable file. */
                200: {
                    headers: {
                        "Content-Disposition"?: string;
                        /** @description Dataset only: JSON list of what is not carried over, URL-encoded. */
                        "X-Export-Notes"?: string;
                        /** @description Dataset only: entries written. */
                        "X-Export-Count"?: number;
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": string[][];
                        "application/zip": string;
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                422: components["responses"]["Unprocessable"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/review/vision-models": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Vision models Ollama has
         * @description Lists the Ollama models able to read images, from smallest to largest. None is chosen automatically: the user decides which one judges the frames of a review.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The models. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            models?: string[];
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
                /** @description Ollama is unreachable. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{id}/reviews": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Reviews of the project, newest first */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Project identifier. */
                    id: components["parameters"]["ProjectId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Each review with how many findings it has and how many are pending. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ReviewSummary"][];
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        /**
         * Analyses the project's animated clips (or creates an empty review)
         * @description Starts the analysis in the background and answers 202 with the review (`state: analyzing`, with `done` of `total` clips): poll it with `GET /api/reviews/{rid}`. For each animated clip that exists in `tmp/` it measures colour drift and sharpness frame by frame and, if `model` is given (an Ollama vision model), asks it whether people are deformed; each problem is a finding with its proposed fix and a frame as evidence. The model is unloaded from Ollama when finished. Without `model` it only measures. With `analyze: false` it creates an empty review (201) for the user's own findings. 409 if the project is already being analysed or has an active run; 422 if there are no animated clips yet.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Project identifier. */
                    id: components["parameters"]["ProjectId"];
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        model?: string;
                        /** @default true */
                        analyze?: boolean;
                    };
                };
            };
            responses: {
                /** @description Empty review created. */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Analysis started. */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Review"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
                422: components["responses"]["Unprocessable"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/reviews/{rid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * A review with its findings
         * @description Reading it refreshes the state of running tasks from the state of their runs.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Review identifier. */
                    rid: components["parameters"]["ReviewId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The review and its findings. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            review?: components["schemas"]["Review"];
                            findings?: components["schemas"]["Finding"][];
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        post?: never;
        /**
         * Deletes a review and its frames
         * @description 409 if it is being analysed or has running tasks.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Review identifier. */
                    rid: components["parameters"]["ReviewId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Deleted. */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/reviews/delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Deletes several reviews
         * @description With `ids`, those reviews; with a filter (`project`, `before` in RFC 3339), those that match it. They cannot be mixed. Reviews being analysed or with running tasks are not deleted and are returned in `skipped_active`.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        ids?: string[];
                        project?: string;
                        /** Format: date-time */
                        before?: string;
                    };
                };
            };
            responses: {
                /** @description Result. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            deleted?: number;
                            skipped_active?: string[];
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/reviews/{rid}/findings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Adds a finding of the user's own (what the user saw)
         * @description Requires `scene` and `description`; `from_seconds`, `severity` (0 to 10) and `fix` are optional. Without `fix` the proposal is to redo the scene with a different seed. The fixes are `trim` (`seconds`), `reseed` (`seed`), `motion_prompt` (`motion_prompt`) and `prompt` (`prompt`).
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Review identifier. */
                    rid: components["parameters"]["ReviewId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        scene: string;
                        description: string;
                        from_seconds?: number;
                        severity?: number;
                        fix?: components["schemas"]["Fix"];
                    };
                };
            };
            responses: {
                /** @description The finding. */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Finding"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/reviews/{rid}/findings/{fid}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * Changes a finding's fix, skips it or edits its text
         * @description Accepts `fix`, `description`, `severity`, `from_seconds` and `skipped`. 409 while its task is running.
         */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Review identifier. */
                    rid: components["parameters"]["ReviewId"];
                    /** @description Finding identifier. */
                    fid: components["parameters"]["FindingId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        fix?: components["schemas"]["Fix"];
                        description?: string;
                        severity?: number;
                        from_seconds?: number;
                        skipped?: boolean;
                    };
                };
            };
            responses: {
                /** @description The finding. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Finding"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
            };
        };
        trace?: never;
    };
    "/api/reviews/{rid}/findings/{fid}/frame": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** The frame that proves a finding */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Review identifier. */
                    rid: components["parameters"]["ReviewId"];
                    /** @description Finding identifier. */
                    fid: components["parameters"]["FindingId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description A PNG. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "image/png": string;
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/reviews/{rid}/findings/{fid}/suggest": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Proposes a smoother motion for the scene
         * @description Asks the local text model (on CPU, like the prompt assistant) for a smoother `motion_prompt` based on what was seen. It is only a proposal: it changes nothing. 409 with an active run.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Review identifier. */
                    rid: components["parameters"]["ReviewId"];
                    /** @description Finding identifier. */
                    fid: components["parameters"]["FindingId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The proposal. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            motion_prompt?: string;
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/reviews/{rid}/tasks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Runs fixes as tasks
         * @description For each finding (`finding_ids`, or all pending ones) it applies its fix to `scenes.yaml` (with a backup the first time and preserving comments) and queues a run limited to its scene. The finding becomes `running` and then `done` or `failed` according to the run. 409 if the project already has an active or queued run.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Review identifier. */
                    rid: components["parameters"]["ReviewId"];
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        finding_ids?: string[];
                        gpu?: string;
                    };
                };
            };
            responses: {
                /** @description Tasks started. */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            started?: {
                                finding_id?: string;
                                run_id?: string;
                            }[];
                            skipped?: {
                                finding_id?: string;
                                reason?: string;
                            }[];
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{id}/config": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The project's YAML and its structured form
         * @description Saving validates the YAML with the same rules as a run (and that the
         *     models and sources it names exist). Fields that were added to
         *     `scenes.yaml` and that this description does not detail field by field:
         *
         *     - **Fades between scenes (video):** `defaults.transition_seconds`
         *       (0 to 2; 0 or absent = cuts) and `transition_seconds` in a
         *       scene (the fade it enters with from the previous one; it overrides the
         *       project's and 0 is a cut). Fades overlap the scenes, so
         *       the video ends up shorter by the sum of the fades. `transition`
         *       (in `defaults` and in a scene) picks the type (`fade` by default,
         *       `fadeblack`, `fadewhite`, `dissolve`, `wipeleft`, `wiperight`, `wipeup`,
         *       `wipedown`, `slideleft`, `slideright`, `slideup`, `slidedown`,
         *       `circleopen`, `circleclose`, `radial`, `pixelize`).
         *     - **Video scenes:** `clip` (an own video from `sources/` instead of
         *       generating and animating an image) with `clip_speed` (video speed, 0.25 to 4; empty = automatic),
         *       `clip_start` and `clip_end` (seconds
         *       from the start of the file, optional) to use only a part; with
         *       `animate: true` they also apply, and count from the start of the
         *       animation and only in its forward part;
         *       it cannot be combined with `image`, `animate`, `motion_prompt`, `animation` or
         *       `render`.
         *     - **Video and image scenes:** `image` (an own image from
         *       `sources/`, video only), `init_image` and `strength` (img2img: starting
         *       from an image in `sources/`), `motion.type` also `rotate_cw` and
         *       `rotate_ccw`, and each scene's own quality: `render`
         *       (`resolution`, `steps`, `cfg_scale`) and `animation` (`resolution`,
         *       `frames`, `steps`, only if the scene animates), all optional; if
         *       missing, the project's value applies.
         *     - **Motion graphics with the catalog parts (video):** besides
         *       `motion_graphic` (the page is written by the model), a scene can
         *       be made from a part of the catalog at `GET /api/music-motion/catalog`:
         *       `motion_part` (the part's name, or `auto` to let the model pick
         *       one from `motion_graphic`), `motion_params` (its parameters, within
         *       the catalog's limits), `motion_text` (up to 120 characters, a line
         *       on the verse layer for the whole scene) and `motion_bpm` (40 to 240). Without
         *       a model or a song: the page comes from the part, the project's design and a
         *       fixed tempo clock. The `defaults.motion` block carries `bpm` (default
         *       120) and `design` (the same fields as a piece's design: `dark`,
         *       `light`, `accent`, `display`, `body`, `default_mode`, `modes`, `concept`,
         *       `verse_style` and `hit_style`); without a design a fallback palette is chosen
         *       from the words of `subject_prompt`. `motion_part` cannot be combined with
         *       `image`, `init_image`, `clip`, `animate`, `motion_prompt`, `animation` or
         *       `render`, and `motion_params`, `motion_text` and `motion_bpm` are not valid without
         *       `motion_part`.
         *     - **Video:** the `bgm` block (`prompt` or `file`, `volume`, `fade_seconds`,
         *       `ducking`, `seed`): background music under the voice-over.
         *     - **Music** (`output.mode: music`): `tracks` instead of `scenes`. Each
         *       track has `prompt`, `lyrics`, `instrumental`, `duration_seconds`,
         *       `bpm`, `keyscale`, `timesignature`, `vocal_language`, `vocals`, `seed`,
         *       `variants`, `use_lm`, `adapter`/`adapter_scale`, and to start from a
         *       song `task` (`cover`, `cover-nofsq`, `repaint`, `extract`) with
         *       `source`, `cover_strength`, `repaint_start`/`repaint_end` and `stem`, or
         *       `reference` (timbre reference for a new song).
         *       `defaults.music` holds the models, the synthesis parameters,
         *       `style_prefix`, the default adapter and the engine (`engine`:
         *       `cli` or `server`, with `keep_loaded`).
         *
         *     The names in `source`, `reference`, `bgm.file`, `image` and `init_image`
         *     are files in the project's `sources/` folder (see the sources
         *     endpoints).
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Project identifier. */
                    id: components["parameters"]["ProjectId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Project configuration. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            yaml?: string;
                            parsed?: {
                                [key: string]: unknown;
                            };
                            valid?: boolean;
                            warnings?: string[];
                            error?: string;
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        /**
         * Validates and saves the project's YAML
         * @description If it does not validate (422) the file on disk is left untouched. In music mode it also checks that the `models/music` models exist.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Project identifier. */
                    id: components["parameters"]["ProjectId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        yaml: string;
                    };
                };
            };
            responses: {
                /** @description Saved. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            saved?: boolean;
                            warnings?: string[];
                            /** @description Videos in `sources/` that the previous configuration used as a `clip` and this one no longer does: they are deleted so as not to leave stray clips (not while a run is active). */
                            removed_clips?: string[];
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                422: components["responses"]["Unprocessable"];
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{id}/cache": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * What the next run would do with the cache, per scene and phase
         * @description States `hit`, `run`, `always` and `n/a`; `cold` is true if there is no cache manifest. In music mode each entry is a track, with the phases `compose` (`n/a` if the track brings its own lyrics or has a task), `synth` and `export`.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Project identifier. */
                    id: components["parameters"]["ProjectId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Cache report. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            [key: string]: unknown;
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{id}/sources": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Project sources (audio for remix, repaint, extract, reference and background music; scene images)
         * @description The files in `sources/`, sorted by name; `kind` is `audio`, `image`, `video` (a clip a scene can use as its own) or `blend` (a Blender scene for `blender.file`). A video carries `used_by`, the scenes that use it (empty if nobody uses it, in which case it can be deleted). They are played through the artifacts endpoint (`sources/<name>`).
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Project identifier. */
                    id: components["parameters"]["ProjectId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description List of sources. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            sources?: {
                                name?: string;
                                /** @enum {string} */
                                kind?: "audio" | "image" | "video" | "blend";
                                /** @description Videos only: ids of the scenes that use it as a `clip`. */
                                used_by?: string[];
                                size?: number;
                                /** Format: date-time */
                                modified?: string;
                            }[];
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        /**
         * Copies an already exported song as a source
         * @description Copies an `.mp3` or `.wav` from `out/` to `sources/`; the original is not touched. It never replaces an existing source.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Project identifier. */
                    id: components["parameters"]["ProjectId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @description Path under out/, for example out/songs/ballad.mp3. */
                        from: string;
                        /** @description Name of the source (by default, the file's own). */
                        name?: string;
                    };
                };
            };
            responses: {
                /** @description Copied. */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            name?: string;
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{id}/peaks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Waveform peaks of a project audio
         * @description To draw the waveform and offer «Recortar silencios» (Trim silences). Reads an `.mp3` or `.wav` from `sources/` (`sources/<name>`) or from `out/` (`out/<project>/<name>`) and returns the duration, `peaks` (the maximum level, 0 to 1, of `buckets` equal slices of the file) and `active`, the first and last instant with sound (above -45 dBFS in 0.1 s windows), or `null` if everything is silence. `buckets` is 800 by default and at most 4000. With `bpm` (20 to 400) it also looks for the beat in the first 30 s and answers `beat_offset`: the second of its first hit (less than one beat), or `null` without `bpm` or if there is no clear beat. Another path, a name that is not audio or a link that leaves the project answer 400; a nonexistent file, 404; an unreadable one, 422; without ffmpeg, 503.
         */
        get: {
            parameters: {
                query: {
                    /** @description Path relative to the project, for example sources/base.mp3. */
                    file: string;
                    buckets?: number;
                    /** @description Tempo of the song, used to find where its beat falls. */
                    bpm?: number;
                };
                header?: never;
                path: {
                    /** @description Project identifier. */
                    id: components["parameters"]["ProjectId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Peaks and the stretch with sound. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @description Seconds. */
                            duration?: number;
                            buckets?: number;
                            peaks?: number[];
                            active?: {
                                start?: number;
                                end?: number;
                            } | null;
                            /** @description Second of the first hit (less than one beat); only with bpm and a clear beat. */
                            beat_offset?: number | null;
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                422: components["responses"]["Unprocessable"];
                /** @description ffmpeg is missing. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{id}/transcribe": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Lyrics of a project audio or video (Whisper)
         * @description Reads with `whisper-cli`, on this machine and on the CPU, an `.mp3`, a `.wav` or a preserved video from `sources/` and returns the language, the segments with their times and the text. Without `language` the language is detected once at the start and kept for the whole file (`language_detected: true`). It does not carry the previous text from one window to the next, and empty segments or ones containing only musical notes are discarded, as are repetitions of more than 3 identical consecutive lines (`dropped` says how many). A wordless audio answers 200 with an empty `text`. It is a transcription to be reviewed: sung voice is transcribed worse than spoken voice, especially with instruments. Another source or a language that is not an ISO code answer 400; a nonexistent source, 404; while a run is queued or active, 409; an unreadable audio, 422; without `whisper-cli`, without a model, without ffmpeg or without memory, 503; if it takes more than 10 minutes, 504.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Project identifier. */
                    id: components["parameters"]["ProjectId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @description Name of an audio or video in `sources/`. */
                        source: string;
                        /** @description ISO 639-1 code (es, en…). Without it, it is detected. */
                        language?: string;
                    };
                };
            };
            responses: {
                /** @description The transcription. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            language?: string;
                            language_detected?: boolean;
                            /** @description The segments joined with line breaks. */
                            text?: string;
                            segments?: {
                                /** @description Seconds. */
                                start?: number;
                                end?: number;
                                text?: string;
                            }[];
                            dropped?: number;
                            model?: string;
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
                422: components["responses"]["Unprocessable"];
                /** @description whisper-cli, its model, ffmpeg or memory is missing. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Took more than 10 minutes. */
                504: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{id}/measure": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Tempo and key of a project audio or video
         * @description Estimates the tempo (`bpm`, 60 to 200, with half and double in `bpm_alternatives` when they fall in that range) and the key (`keyscale`, as music tracks write it: `D minor`) of an `.mp3`, a `.wav` or a preserved video from `sources/`, with its confidence (0 to 1). The server computes it itself, with no models or GPU, so it does not wait for runs. They are **estimates**: the tempo is usually right or comes out at half or double, and the key may come out as its relative. Without a clear beat `bpm` is `null`; without a clear key, `keyscale`. It does not measure the time signature. Another source answers 400; a nonexistent one, 404; an unreadable audio, 422; more than 20 minutes, 422; without ffmpeg, 503.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Project identifier. */
                    id: components["parameters"]["ProjectId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @description Name of an audio or video in `sources/`. */
                        source: string;
                    };
                };
            };
            responses: {
                /** @description The measurements. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @description Seconds. */
                            duration?: number;
                            bpm?: number | null;
                            bpm_alternatives?: number[];
                            bpm_confidence?: number;
                            keyscale?: string | null;
                            key_confidence?: number;
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                422: components["responses"]["Unprocessable"];
                /** @description ffmpeg is missing. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{id}/recognize": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Listen to the sound of a project audio or video with LAION-CLAP
         * @description Sends the first 30 seconds of an `.mp3`, a `.wav` or a preserved video from `sources/` to the LAION-CLAP service, which scores the sound against the genre, mood and instrument labels of the music vocabulary, and returns the best of each group (`genre`, `mood`, `instrument`, with their score, which is a similarity and not a probability) and `tags`, all together in the order in which they are written. It does not start the service: it must be running (Environment screen); otherwise, 503 with the reason in `error.reason` (`not_running`, `no_service`, `no_weights`...). `method` is `clap` or `muq` (MuQ-MuLan, with the `diffrhythm2 classify` executable and on CPU; 503 with `no_service` or `no_weights` if the executable or the converted weights are missing); the lyrics have their own call (`/transcribe`) and `whisper` here is 400. It is experimental: in our tests CLAP separated genres poorly, so it is a hint for the assistant and not a verdict.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Project identifier. */
                    id: components["parameters"]["ProjectId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @description Name of an audio or video in `sources/`. */
                        source: string;
                        /** @enum {string} */
                        method: "clap" | "muq";
                    };
                };
            };
            responses: {
                /** @description What was heard. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            method?: string;
                            genre?: components["schemas"]["SoundTag"][];
                            mood?: components["schemas"]["SoundTag"][];
                            instrument?: components["schemas"]["SoundTag"][];
                            tags?: string[];
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                422: components["responses"]["Unprocessable"];
                /** @description The CLAP service failed. */
                502: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description CLAP is not running or ffmpeg is missing. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music/recognizers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Which methods exist to recognize a song
         * @description Whisper (the lyrics, always available), LAION-CLAP (the sound: available if its service is running; otherwise `reason` and `detail` say why) and MuQ-MuLan (available if the `diffrhythm2` executable is built at `bin/services/diffrhythm2` and the audio weights are converted; otherwise `no_service` or `no_weights`). It starts nothing.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The methods. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            recognizers?: {
                                /** @enum {string} */
                                id?: "whisper" | "clap" | "muq";
                                available?: boolean;
                                reason?: string;
                                detail?: string;
                            }[];
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{id}/loudness": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Loudness of a project audio
         * @description Measures the integrated loudness (EBU R128, in LUFS) of an `.mp3` or `.wav` from `sources/` (`sources/<name>`) or from `out/` (`out/<project>/<name>`). Reads the whole file. The music studio uses it to roughly compute what normalizing a mix would do in the preview. A silent audio answers `lufs: null`. Another path or a name that is not audio answer 400; a nonexistent file, 404; an unreadable one, 422; without ffmpeg, 503.
         */
        get: {
            parameters: {
                query: {
                    /** @description Path relative to the project, for example out/demo/ballad.mp3. */
                    file: string;
                };
                header?: never;
                path: {
                    /** @description Project identifier. */
                    id: components["parameters"]["ProjectId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Loudness of the audio. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @description Integrated LUFS; null if the audio is silence. */
                            lufs?: number | null;
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                422: components["responses"]["Unprocessable"];
                /** @description ffmpeg is missing. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/library": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * All the songs of all the music projects, with their stars and playlists
         * @description Walks the music projects and lists the songs in their `manifest.json` that are still on disk (most recent first), plus what the user adds to them. A song's key is `project/track/seed`, like the favorites'.
         */
        get: {
            parameters: {
                query?: {
                    /** @description `include` also lists the generation API projects (`api-gen-`, `api-edit-`, `api-vid-`) as ordinary projects, with their `client` and `kind`. Without it they are not listed. Any other value is a 400. Music motion animations (`api-mm-`) never appear. */
                    managed?: components["parameters"]["ManagedInclude"];
                    /** @description Comma-separated list of clients (client names, `embedded` or `unknown`): only the items of those clients appear. A name that is not valid is a 400. */
                    client?: components["parameters"]["ClientFilter"];
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Songs, stars and playlists. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            songs?: {
                                /** @example songs/ballad/7 */
                                key?: string;
                                project?: string;
                                track_id?: string;
                                variant?: number;
                                seed?: number;
                                title?: string;
                                caption?: string;
                                lyrics?: string;
                                instrumental?: boolean;
                                bpm?: number;
                                keyscale?: string;
                                vocal_language?: string;
                                audio_seconds?: number;
                                /** @description The length of the audio as the song map reads it (the decoded samples), to the millisecond: what a script has to cover. Absent when it cannot be measured (for example without ffmpeg). `audio_seconds` is the rounded one the manifest records. */
                                duration?: number;
                                /** @description Path of the audio inside the project (requested through `/api/projects/{id}/artifacts/...`). */
                                file?: string;
                                cover?: string;
                                /** @description Marked as a favorite in its project. */
                                favorite?: boolean;
                                generated_at?: string;
                                /** @description Who made the song's project (`embedded` if it does not say). */
                                client?: string;
                            }[];
                            ratings?: {
                                [key: string]: number;
                            };
                            playlists?: components["schemas"]["LibraryPlaylist"][];
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/library/meta": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Saves the stars and the playlists
         * @description Replaces the whole document (stars 1 to 5, a song with no stars does not appear; up to 200 playlists of up to 2000 songs). It is saved in `projects/.library.json`.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        ratings?: {
                            [key: string]: number;
                        };
                        playlists?: components["schemas"]["LibraryPlaylist"][];
                    };
                };
            };
            responses: {
                /** @description What was saved. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                422: components["responses"]["Unprocessable"];
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/storage": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Size of each project and free disk space
         * @description Adds up the files of each project without following symbolic links except those that lead to the media folder (a project's `models` and `voices` are links to installation-wide folders and are not counted) and gives the free and total space of the disk where the projects are. With a media folder (`--media-dir`) it adds `media`: its absolute path, each project's folder and the free and total space of its disk, read on every request; a client that writes there knows how much is left. Without a media folder there is no `media`. With a models folder (`--models-dir`) it adds `models`: its path, whether it is available and the free and total space of its disk, also read on every request. `disk` is always the disk's, never a sum of the listed projects: asking for `managed=include` does not change it or count anything twice.
         */
        get: {
            parameters: {
                query?: {
                    /** @description `include` also lists the generation API projects (`api-gen-`, `api-edit-`, `api-vid-`) as ordinary projects, with their `client` and `kind`. Without it they are not listed. Any other value is a 400. Music motion animations (`api-mm-`) never appear. */
                    managed?: components["parameters"]["ManagedInclude"];
                    /** @description Comma-separated list of clients (client names, `embedded` or `unknown`): only the items of those clients appear. A name that is not valid is a 400. */
                    client?: components["parameters"]["ClientFilter"];
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Sizes. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            projects?: {
                                id?: string;
                                total_bytes?: number;
                                /** @description Who made the project (as in `GET /api/projects`). */
                                client?: string;
                                /**
                                 * @description Only on a generation API project (with `managed=include`).
                                 * @enum {string}
                                 */
                                kind?: "generation" | "image_edit" | "video_edit";
                            }[];
                            disk?: {
                                free_bytes?: number;
                                total_bytes?: number;
                                /** @description Below this the space is low: 20 GB, or `ORCHESTRATOR_MIN_FREE_GB` (0 disables the warning). */
                                warn_below_bytes?: number;
                                /** @description Less than `warn_below_bytes` is left. It is a warning: it never prevents launching a run. */
                                low?: boolean;
                            };
                            /** @description Only if the server has a media folder. Projects live there (`<dir>/<id>/` with `config/`, `out/` and `tmp/`) and `projects/<id>/` holds links. */
                            media?: {
                                /** @description Absolute path of the media folder, as the server sees it. */
                                dir?: string;
                                disk?: components["schemas"]["DiskReport"];
                                projects?: {
                                    id?: string;
                                    /** @description The project's folder inside the media folder. */
                                    folder?: string;
                                }[];
                            };
                            models?: components["schemas"]["ModelsDirectory"];
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{id}/storage": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * What takes up a project's space, part by part
         * @description The parts: `cache` (`tmp/` without its leftovers), `leftovers` (files in `tmp/` of scenes that no longer exist), `clips` and `animations` (`out/clips/`), `final` (the rest of `out/`: the video, the manifests and the exports), `sources`, `reviews` (`.reviews/`) and `backups` (`scenes.yaml.*`). Each with its bytes and its file count; `cleanable` says whether it can be cleaned (not `final` or `sources`).
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Project identifier. */
                    id: components["parameters"]["ProjectId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Breakdown. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            total_bytes?: number;
                            parts?: {
                                /** @enum {string} */
                                id?: "cache" | "leftovers" | "clips" | "animations" | "final" | "sources" | "reviews" | "backups";
                                bytes?: number;
                                files?: number;
                                cleanable?: boolean;
                            }[];
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{id}/storage/clean": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Cleans parts of a project
         * @description Deletes the files of the requested parts (`cache`, `leftovers`, `clips`, `animations`, `reviews`, `backups`) and answers how many bytes it freed. `final` and `sources` are not cleaned this way (400). With a queued or running run it answers 409. Emptying `cache` forces the scenes to be redone on the next run.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Project identifier. */
                    id: components["parameters"]["ProjectId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        parts: string[];
                    };
                };
            };
            responses: {
                /** @description Cleaned. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            freed_bytes?: number;
                            /** @description Bytes freed per part. */
                            cleaned?: {
                                [key: string]: number;
                            };
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/clips": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Clips the projects have kept
         * @description Each run keeps each scene's finished clip at the project's `out/clips/<scene>.mp4` and, for generated scenes, its complete animation (forward and back) at `out/clips/<scene>.anim.mp4`. This lists those of all projects (except `exclude`), to choose one as a scene's own clip with `POST /api/projects/{id}/sources/clip`.
         */
        get: {
            parameters: {
                query?: {
                    /** @description Project that is not listed (the current one). */
                    exclude?: string;
                    /** @description Lists only the clips of this project (a video project's gallery). */
                    project?: string;
                    /** @description `include` also lists the generation API projects (`api-gen-`, `api-edit-`, `api-vid-`) as ordinary projects, with their `client` and `kind`. Without it they are not listed. Any other value is a 400. Music motion animations (`api-mm-`) never appear. */
                    managed?: components["parameters"]["ManagedInclude"];
                    /** @description Comma-separated list of clients (client names, `embedded` or `unknown`): only the items of those clients appear. A name that is not valid is a 400. */
                    client?: components["parameters"]["ClientFilter"];
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Kept clips. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            clips?: {
                                project?: string;
                                scene?: string;
                                /**
                                 * @description `clip`: the scene's finished clip; `animation`: its complete animation.
                                 * @enum {string}
                                 */
                                kind?: "clip" | "animation";
                                size?: number;
                                /** Format: date-time */
                                modified?: string;
                                /** @description Who made the clip's project (as in `GET /api/projects`). */
                                client?: string;
                                /**
                                 * @description Only if the project belongs to the generation API (with `managed=include`).
                                 * @enum {string}
                                 */
                                project_kind?: "generation" | "image_edit" | "video_edit";
                            }[];
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{id}/sources/clip": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Copies another project's kept clip as a source
         * @description Copies `out/clips/<scene>.mp4` from `from_project` to this project's `sources/` (it never replaces a file; without `name` it uses `<project>-<scene>.mp4`, with a number if it already exists). It is a copy, so the scene does not depend on the other project, and deleting it or deleting its runs with their files does not affect it. 404 if the project or its clip do not exist.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Project identifier. */
                    id: components["parameters"]["ProjectId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        from_project: string;
                        scene: string;
                        /**
                         * @description Which one is copied (`clip` by default). The animation is copied by default as `<project>-<scene>-anim.mp4`.
                         * @enum {string}
                         */
                        kind?: "clip" | "animation";
                        /** @description Name of the copy, ending in .mp4, .mov, .webm or .mkv. */
                        name?: string;
                    };
                };
            };
            responses: {
                /** @description Copied. */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            name?: string;
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{id}/sources/from-url": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Adds the audio of a YouTube video as a source
         * @description Downloads with `yt-dlp` only the audio of ONE YouTube video (`https` on `youtube.com`, `www.`, `m.`, `music.` or `youtu.be`; never playlists) and saves it as `sources/<name>.mp3`. No account or cookies. At most 20 minutes of video, 256 MB and 5 minutes of waiting; closing the request cancels the download and leaves no files. The default name comes from the title (letters, digits, `.`, `_` and `-`, with a numeric suffix if it already exists). An address that is not YouTube answers 400; an existing name, 409; a video that requires signing in, is too long or unavailable, 422; without `yt-dlp` (`bash scripts/get-ytdlp.sh`) or without ffmpeg, 503; if it takes more than 5 minutes, 504.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Project identifier. */
                    id: components["parameters"]["ProjectId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @description https address of a YouTube video. */
                        url: string;
                        /** @description Name of the source, ending in .mp3 (by default, the video's title). */
                        name?: string;
                    };
                };
            };
            responses: {
                /** @description Added. */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            name?: string;
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
                422: components["responses"]["Unprocessable"];
                /** @description yt-dlp or ffmpeg is missing. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description The download exceeded 5 minutes and was stopped. */
                504: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{id}/songs/{track}/{variant}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Deletes an exported song from a music project
         * @description Deletes that variant's audio (`variant` starts at 0), its cover if no other song uses it, and its entry in `manifest.json`. It does not touch the track definition or the mixes already rendered. With an active or queued run of the project it answers 409; a project that is not a music one, 422.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Project identifier. */
                    id: components["parameters"]["ProjectId"];
                    track: string;
                    variant: number;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Deleted. */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
                422: components["responses"]["Unprocessable"];
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{id}/sources/{name}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Uploads an audio as a source
         * @description Raw body (the file), up to 256 MB. `.mp3`, `.wav` and images (`.png`, `.jpg`, `.jpeg`, `.webp`, for a scene's own image) are stored as they are; a video (`.mp4`, `.mov`, `.mkv`, `.webm`, `.avi`) is converted: its audio is extracted to `<name>.mp3` with ffmpeg and the video is not kept (the response gives the stored name). An existing name answers 409 and is not replaced; a video with no audio or that ffmpeg cannot read answers 422; without ffmpeg, 503.
         */
        put: {
            parameters: {
                query?: {
                    /** @description `clip`: the upload is a scene's own video (`.mp4`, `.mov`, `.webm` or `.mkv`); it is stored as is in `sources/` and listed as `kind: video`. `picture`: the upload is a scene's starting image. It accepts an image (`.png`, `.jpg`, `.jpeg`, `.webp`), a GIF or a video; a GIF or a video is reduced to its first frame (`<name>.png`, the original is not kept). The response includes `metadata` when the file carried generation data (prompt, negative, seed, steps, cfg, model). Without this parameter everything works as before (a video is still converted to audio). */
                    as?: "picture" | "clip";
                };
                header?: never;
                path: {
                    /** @description Project identifier. */
                    id: components["parameters"]["ProjectId"];
                    name: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "audio/mpeg": string;
                    "audio/wav": string;
                    "application/octet-stream": string;
                };
            };
            responses: {
                /** @description Uploaded. */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            name?: string;
                            /** @description Only with `as=picture` and if the file carried generation data; all fields are optional. */
                            metadata?: {
                                prompt?: string;
                                negative_prompt?: string;
                                /** Format: int64 */
                                seed?: number;
                                steps?: number;
                                cfg_scale?: number;
                                sampler?: string;
                                model?: string;
                                width?: number;
                                height?: number;
                                strength?: number;
                            };
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
                /** @description The file exceeds the limit. */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                422: components["responses"]["Unprocessable"];
                /** @description A video needs ffmpeg and it is not installed. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        /**
         * Deletes a source
         * @description Answers 409 while a track of the project uses it or a run is active.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Project identifier. */
                    id: components["parameters"]["ProjectId"];
                    name: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Deleted. */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{id}/artifacts/{path}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Serves a project file (video, image, audio, manifest…)
         * @description Read-only; the path is confined to the project. It supports Range
         *     requests, also for music audio (`.mp3` as `audio/mpeg`,
         *     `.wav` as audio) so playback can seek forward and back. For `<img>`, `<audio>` and `<video>`, `?ticket=` is used (see
         *     `POST /api/auth/ticket`) because they cannot send headers.
         */
        get: {
            parameters: {
                query?: {
                    /** @description Ticket from `POST /api/auth/ticket`, for clients that cannot send headers. */
                    ticket?: components["parameters"]["Ticket"];
                };
                header?: never;
                path: {
                    /** @description Project identifier. */
                    id: components["parameters"]["ProjectId"];
                    /** @description Path relative to the project, e.g. `out/demo.mp4`. */
                    path: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description File content. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "*/*": string;
                        "audio/mpeg": string;
                        "audio/wav": string;
                    };
                };
                /** @description Partial content (Range), e.g. a stretch of a music track's audio. */
                206: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/import/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Converts a JSON/HTML dataset into a scenes.yaml (creates nothing) */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @description Content of the JSON or HTML. */
                        content: string;
                        project?: string;
                        silence_seconds?: number;
                        /**
                         * @description video (default) writes scenes; motion writes motion graphics scenes (description + Duration:, Overlay: and other markers); music writes tracks (style + Lyrics: + markers).
                         * @enum {string}
                         */
                        mode?: "video" | "motion" | "music";
                        /**
                         * @description images makes the project an images project (`output.mode: images`); only for a scenes dataset (not `mode` music or motion).
                         * @default video
                         * @enum {string}
                         */
                        output_mode?: "video" | "images";
                    };
                };
            };
            responses: {
                /** @description Preview. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            yaml?: string;
                            report?: {
                                [key: string]: unknown;
                            };
                            entries?: number;
                            imported?: number;
                            silent?: number;
                            /** @description Instrumental tracks (mode=music only). */
                            instrumental?: number;
                            rejected?: number;
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                422: components["responses"]["Unprocessable"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/import/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Creates the project with the previewed YAML
         * @description Never overwrites an existing id.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        id: string;
                        yaml: string;
                        /**
                         * @description replaces the `output.mode` of the YAML; `images` makes an images project.
                         * @default video
                         * @enum {string}
                         */
                        output_mode?: "video" | "images";
                    };
                };
            };
            responses: {
                201: components["responses"]["CreatedId"];
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                409: components["responses"]["Conflict"];
                422: components["responses"]["Unprocessable"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/import/package/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * What a project package contains and what this machine lacks
         * @description The body is the package's `.zip` (`application/zip`). Returns the recipe (the files it uses, with their state on this machine), the catalog downloads that are missing grouped by package (`install`), the missing files the catalog does not know (`unknown`), the suggested id and whether it already exists (`id_taken`), and `ready` when nothing is missing. It creates nothing.
         */
        post: {
            parameters: {
                query?: {
                    lang?: "es" | "en";
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/zip": string;
                };
            };
            responses: {
                /** @description The report. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Unauthorized"];
                /** @description The package is too large. */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                422: components["responses"]["Unprocessable"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/import/package/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Creates a project from a package
         * @description The body is the same `.zip`; `id` is the project identifier. It writes `scenes.yaml` and `sources/` (nothing else from the zip) and never overwrites an existing id. Missing models do not prevent it: the response says what to install (`install`, `unknown`) and `ready` if it can already generate.
         */
        post: {
            parameters: {
                query: {
                    id: string;
                    lang?: "es" | "en";
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/zip": string;
                };
            };
            responses: {
                /** @description `{id, ready, install, unknown}`. */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                409: components["responses"]["Conflict"];
                /** @description The package is too large. */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                422: components["responses"]["Unprocessable"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{id}/scenes/{scene}/motion": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The saved page of a motion graphic or an overlay
         * @description Reads the HTML page that a motion graphic scene (`motion_graphic`) or its overlay (`overlay`, with `?overlay=1`) has saved in `motion/`. Returns `{scene, overlay, exists, html, preview, duration, origin, summary, model, browser}`: `preview` is the same page ready for an isolated frame (content policy and virtual clock first; it is driven with `postMessage({type:"seek", t})`), `duration` the seconds it is fitted to (`?duration=` or the scene's estimate), `origin` is `generated` (as the model wrote it), `edited` or `supplied`. Without a page, `exists` is false.
         */
        get: {
            parameters: {
                query?: {
                    /** @description The overlay instead of the graphic. */
                    overlay?: "1";
                    duration?: number;
                };
                header?: never;
                path: {
                    /** @description Project identifier. */
                    id: components["parameters"]["ProjectId"];
                    /** @description Scene identifier. */
                    scene: components["parameters"]["SceneId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The page (or its absence). */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        /**
         * Saves by hand the page of a motion graphic or an overlay
         * @description Replaces the saved page. What is shown is checked without running it: a complete document and nothing loaded from outside (`400` otherwise). A run checks it again in the browser. Body `{html, overlay?}`; returns the same as the GET.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Project identifier. */
                    id: components["parameters"]["ProjectId"];
                    /** @description Scene identifier. */
                    scene: components["parameters"]["SceneId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        html: string;
                        overlay?: boolean;
                    };
                };
            };
            responses: {
                /** @description The saved page. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{id}/scenes/{scene}/motion/generate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Asks the model for a new page for a motion graphic or an overlay
         * @description Writes the page from the scene's saved description with the provider of the `motion_graphics` task, checks it in the browser (up to 3 attempts, giving the model back what failed) and replaces the saved one. Optional body `{overlay?, provider?}`. `503` without Chrome/Chromium or without a model, `409` if a run is in progress and the model loads on this machine, `422` if the model fails to produce a page that works.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Project identifier. */
                    id: components["parameters"]["ProjectId"];
                    /** @description Scene identifier. */
                    scene: components["parameters"]["SceneId"];
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        overlay?: boolean;
                        provider?: string;
                    };
                };
            };
            responses: {
                /** @description The new page, as in the GET. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                /** @description A run is in progress. */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                422: components["responses"]["Unprocessable"];
                /** @description The browser or the model is missing. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{id}/videoclip/plan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Plan for a music video from a song
         * @description Splits a song exported from a music project into shots: it distributes its duration among the lyrics sections (`[Verse]`, `[Chorus]`…) according to the text they sing and cuts each section into shots of about `shot_seconds` (6 by default; never more than 60 shots in total). Each shot carries the lyric lines it covers, a camera movement and its image prompt. With `ai: true` the assistant (Ollama, on CPU) writes a common look (`subject_prompt`) and each shot's image; if it cannot (or a run is in progress), the response carries a warning and the prompts come from the style and the lyrics. It creates nothing. `422` if the project is not a music one, the track or version does not exist or the song is gone.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Project identifier. */
                    id: components["parameters"]["ProjectId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        track_id: string;
                        /** @description Version (0 = the first). */
                        variant?: number;
                        shot_seconds?: number;
                        /** @description Fade between shots (0.8 by default). */
                        transition_seconds?: number;
                        ai?: boolean;
                        model?: string;
                    };
                };
            };
            responses: {
                /** @description `{title, caption, audio_file, audio_seconds, transition_seconds, subject_prompt, used_ai, warnings?, sections?, aligned_cuts?, shots: [{id, section, start, seconds, duration, lines?, motion, intensity, prompt}]}`. `duration` is how long the scene lasts (fades eat the end of each one except the last, so the video ends where the song does). The cuts between sections are moved to the clearest volume change of the song near where the text puts them (it reads the audio with ffmpeg; without it they follow the text): `aligned_cuts` is how many of the cuts between the `sections` sections were moved. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                422: components["responses"]["Unprocessable"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{id}/videoclip": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Creates the video project of a song
         * @description Creates the (new) project `id` from a video `yaml` whose background music (`bgm.file`) is the song: it copies it into `sources/` with that name (the original stays) and validates the project; if anything fails it leaves nothing half-done. It never overwrites. `422` if the yaml is not a video one, has no `bgm.file` or its extension is not the song's.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Project identifier. */
                    id: components["parameters"]["ProjectId"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        track_id: string;
                        variant?: number;
                        /** @description The new project. */
                        id: string;
                        yaml: string;
                    };
                };
            };
            responses: {
                201: components["responses"]["CreatedId"];
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
                422: components["responses"]["Unprocessable"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/projects/{id}/runs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Launches a run of the project
         * @description The options are equivalent to the CLI flags. The project is validated
         *     beforehand: an invalid one is never queued. One run per GPU at a time; the
         *     others wait in the queue.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Project identifier. */
                    id: components["parameters"]["ProjectId"];
                };
                cookie?: never;
            };
            /** @description Send `{}` to launch the run with the default values (the server also tolerates there being no body; the typed client only sends the body if the contract requires it). */
            requestBody: {
                content: {
                    "application/json": {
                        /** @description One index or several separated by commas, e.g. "0,1". */
                        gpu?: string;
                        keep_tmp?: boolean;
                        force?: boolean;
                        /** @description Id of a scene (or of a track in music mode). */
                        only?: string;
                        /** @default 2048 */
                        vram_warn_mb?: number;
                        /**
                         * @description With one card or none, the narration and the probe of up to N scenes ahead and the clip encoding are done while the card draws another scene (0: one phase after another). Ignored, with a warning, with several cards or with motion graphics and overlays; the result is the same.
                         * @default 0
                         */
                        overlap?: number;
                        /** @enum {string} */
                        mode?: "video" | "images" | "music";
                    };
                };
            };
            responses: {
                /** @description Run accepted. */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            run?: components["schemas"]["Run"];
                            queue_position?: number;
                            /** @description Warnings that do not prevent the run; currently, that little space is left on the projects' disk. */
                            warnings?: string[];
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                422: components["responses"]["Unprocessable"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/runs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Run history, most recent first */
        get: {
            parameters: {
                query?: {
                    project?: string;
                    limit?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description List of runs. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Run"][];
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/runs/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** A run */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Run identifier. */
                    id: components["parameters"]["RunId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The run (with `queue_position` if it is queued). */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            run?: components["schemas"]["Run"];
                            queue_position?: number;
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        post?: never;
        /**
         * Deletes a finished run from the history
         * @description It only touches the history and its events; the generated files (video,
         *     images, tmp/) are not deleted. It cannot be undone.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Run identifier. */
                    id: components["parameters"]["RunId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Run deleted. */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/runs/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cancels a queued or running run */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Run identifier. */
                    id: components["parameters"]["RunId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Run cancelled. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            run?: components["schemas"]["Run"];
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/runs/delete": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Deletes several finished runs at once
         * @description Send `ids` **or** a filter (`project`, `states`, `before`), not both.
         *     Queued or running runs are skipped.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        ids?: string[];
                        project?: string;
                        states?: ("succeeded" | "failed" | "cancelled" | "interrupted")[];
                        /** Format: date-time */
                        before?: string;
                    };
                };
            };
            responses: {
                /** @description Result of the deletion. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            deleted?: number;
                            skipped_active?: string[];
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/runs/{id}/resources": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * VRAM, GPU utilization and RAM sampled during the run
         * @description The VRAM is that of the whole GPU during the run, so it includes
         *     any other process that uses it.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Run identifier. */
                    id: components["parameters"]["RunId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Samples and peaks. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["RunResources"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/runs/{id}/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Live run events (SSE)
         * @description For `EventSource`, not for a one-off request: «Try it out» does not
         *     work here. It replays all events and then follows live.
         *     Messages without `event:` (pipeline event), `run-state` and
         *     `stream-end`. The pipeline phases are `tts`, `probe`, `render`,
         *     `animate`, `clip`, `concat`, `export` and, in music mode, `compose` and
         *     `synth` (with the track id as `scene_id`). A video with background
         *     music adds, after `concat` and with `scene_id: "_global"`, `bgm` (the
         *     generated soundtrack) and `mix` (the final video). With a token use `?ticket=`.
         */
        get: {
            parameters: {
                query?: {
                    /** @description Ticket from `POST /api/auth/ticket`, for clients that cannot send headers. */
                    ticket?: components["parameters"]["Ticket"];
                };
                header?: never;
                path: {
                    /** @description Run identifier. */
                    id: components["parameters"]["RunId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Event stream. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "text/event-stream": string;
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/stats/phase-duration": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * How long a phase takes with a model, a size and a card, according to the history
         * @description The median and the 95th percentile of the seconds of a phase (`render`: per image; `animate`: per clip) done with the given model, resolution, steps (and, for an animation, frames) and card, from the executions of the last 90 days of runs that finished successfully. Phases that a run failed, that were cancelled or that were reused from the cache (they have no duration) are not counted. With fewer than `min_executions` executions there is not enough history: `enough` is `false` and no duration is given. `gpu` is the card name as given by `nvidia-smi`.
         */
        get: {
            parameters: {
                query: {
                    phase: "render" | "animate";
                    /** @description The model file (the diffusion one; for an animation, the engine's). */
                    model: string;
                    resolution: string;
                    gpu: string;
                    steps?: number;
                    frames?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description What the history says. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PhaseDuration"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/estimate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * A project's estimated time, with what this machine has taken
         * @description Adds up the image and animation phases that the project is going to run. For each one it uses the history median (see `GET /api/stats/phase-duration`) if there is enough and, if not, the catalog's measured table scaled by the card's speed. The rest (narration, probe, clip and join) is CPU and ffmpeg work: it comes from the history (per scene and the join) if there is enough of both parts and, if not, from the table (4 s per scene and 15 s), without scaling it by the card. It says where it comes from: `history`, `table` or `mixed`, and how many executions at minimum the history part relies on. With `project` that project's cache is read and the phases it will reuse add nothing (`cached_phases`). It does not cover music projects.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["EstimateRequest"];
                };
            };
            responses: {
                /** @description The estimate. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Estimate"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                422: components["responses"]["Unprocessable"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/stats": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Aggregated statistics of the history */
        get: {
            parameters: {
                query?: {
                    project?: string;
                    /** @description Only the runs of projects of those types: `video`, `images` or `music`, comma-separated. */
                    mode?: string;
                    /** @description Only the runs of projects made on `desktop` or `mobile` (those the Create page makes, named `mobile-…`), comma-separated. */
                    origin?: string;
                    /** @description Only the runs made by those servers (comma-separated names), when several share the history. */
                    server?: string;
                    /** @description Only the runs requested by those clients (comma-separated names, in the form `^[a-z0-9-]{1,32}$`): that of a generation API dashboard, `unknown` or `embedded` (the normal projects). Any other value gives `400`. */
                    client?: string;
                    /** @description RFC 3339 or YYYY-MM-DD (by default, the last 30 days). */
                    since?: string;
                    until?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Totals, duration, days, phases, cache, projects, types (`by_mode`) and GPUs. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["StatsResult"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/ticket": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Requests a 10-minute ticket for streams and media
         * @description It works only as `?ticket=` on the events and the artifacts.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Ticket. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            ticket?: string;
                            /** Format: date-time */
                            expiresAt?: string;
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/environment/ollama/unload": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Frees the VRAM Ollama holds
         * @description Asks Ollama to unload all the models it has loaded (those it keeps after last use, `OLLAMA_KEEP_ALIVE`) and returns their names. If there are none, the list is empty. The environment report marks each GPU with `ollama_mb` (memory Ollama holds on it) and `low_vram` (less than 6 GB free).
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Models unloaded. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            unloaded?: string[];
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
                /** @description Ollama is unreachable. */
                502: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/environment": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Binaries, models, voices, LoRAs and GPUs of the machine
         * @description `content_mode` is `censored` (projects for over-18s do not exist for the API) or `strict` (only those marked as suitable); `edition` is `private` or `public` and is fixed when the program is built (see `docs/DEVELOPMENT.md`): there is no way to change it while running. The binaries include `ace-lm`, `ace-synth` and `ace-server` (music engine; `ace-server` is the server engine, `engine: server`; optional: their absence does not affect video or images) and the report lists in `music` the files of `models/music` and in `music_adapters` the installed LoRA adapters (one per file or folder). `ram` gives the machine's total and available memory (`total_bytes`, `available_bytes`). `ollama` gives the Ollama address in use (`host`), where it comes from (`source`: `setting`, `env` or `default`) and whether it is not this machine (`remote`), without contacting it; with a remote Ollama the Ollama VRAM-retention warning is not added to the GPUs. `disk` gives the free and total space of the projects' disk and whether it is low (`low`, below 20 GB or `ORCHESTRATOR_MIN_FREE_GB`).
         */
        get: {
            parameters: {
                query?: {
                    lora_dir?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Environment report. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["EnvironmentReport"];
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/assist": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Writes a prompt in English with a local Ollama model (on CPU)
         * @description With `task: music` it writes the style (in English) and the lyrics (in the language of the description, with `[Verse]`/`[Chorus]` tags) of a song; with `instrumental: true` only the style. With `generator: heartmula` or `diffrhythm2` it also asks for the style tags (`tags`: 4 to 8 short English words, lowercase and comma-separated) and writes the section tags those engines read (`[intro]`, `[verse]`, `[chorus]`, `[bridge]`, `[outro]`, `[inst]`, `[solo]`, `[hook]`, `[break]`, `[end]`, lowercase; the ones they do not know are removed). With `task: tags` it writes only the tags from the style. With `task: lyrics-from-transcript` it arranges the transcription of a song (`text`, up to 8000 characters, one segment per line; it may be empty if the song has no lyrics and something is given in `hint`, `bpm`, `keyscale` or `picture`) into sections by line repetition and proposes a style and tags, **without inventing text**: if the model changes the words, the response returns the transcription as is under a single section tag and `unchanged_words: false`.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        task: "image" | "motion" | "music" | "tags" | "lyrics-from-transcript";
                        /** @description Description of the scene or the song, in any language (up to 2000 characters). With `lyrics-from-transcript`, the transcription (up to 8000), which may be empty. */
                        text: string;
                        /**
                         * @description Only with `music` and `lyrics-from-transcript`: the track's generator (ace-step by default).
                         * @enum {string}
                         */
                        generator?: "ace-step" | "heartmula" | "diffrhythm2";
                        /** @description Only with `lyrics-from-transcript`: ISO 639-1 code of the lyrics. */
                        language?: string;
                        /** @description Only with `lyrics-from-transcript`: what the user knows about the song (up to 500 characters). */
                        hint?: string;
                        /** @description Only with `lyrics-from-transcript`: measured tempo (an estimate). */
                        bpm?: number;
                        /** @description Only with `lyrics-from-transcript`: measured key, for example `D minor`. */
                        keyscale?: string;
                        /** @description Only with `lyrics-from-transcript`: the description of a video's image (up to 2000 characters). */
                        picture?: string;
                        /** @description Only with `music`: write only the style, no lyrics. */
                        instrumental?: boolean;
                        /** @description Prompts of the house style (each field up to 2000 characters), put in the model's context as examples to follow and never to copy. A server that takes them lists `examples` in the `features` of `GET /api/music-motion/catalog`. */
                        examples?: {
                            prompt: string;
                            negative?: string;
                            tags?: string;
                        }[];
                        /** @description A model installed in Ollama (see `GET /api/assist/models`); empty or absent = the server's (`ORCHESTRATOR_ASSIST_MODEL`, otherwise `qwen3:8b`). Nothing is downloaded. */
                        model?: string;
                        /** @description A provider that replaces the `assistant` routing for this call only (see `GET /api/routing`); if remote it requires consent (`consent_required`). */
                        provider?: string;
                    };
                };
            };
            responses: {
                /** @description Generated prompt. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @description The prompt, or the model's answer as is with `music`. */
                            text?: string;
                            /** @description Only with `music`: the style, in English. */
                            caption?: string;
                            /** @description Only with `music`: the lyrics with section tags (empty if instrumental). */
                            lyrics?: string;
                            /** @description With `music` for heartmula or diffrhythm2, and with `lyrics-from-transcript` for them: the style tags, normalized. Absent if the model did not give them. */
                            tags?: string;
                            /** @description Only with `lyrics-from-transcript`: the lyrics have the transcription's words and nothing else. */
                            unchanged_words?: boolean;
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                409: components["responses"]["Conflict"];
                /** @description The model refused to write the text (code `assist_refused`). The refusal comes from the model itself, not from the application: the message names the model and suggests choosing another. */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Ollama is not responding, the model is not installed or there is not enough memory. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tts/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Listen to a narration with an installed voice (Piper, on CPU), without writing anything to the project */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @description The text to read (up to 600 characters). */
                        text: string;
                        /** @description An installed voice, as scenes.yaml names it: `voices/<name>.onnx`. */
                        voice: string;
                        /** @description Speed, 0.1 to 4 (default 1), the same as the scene's `speed`. */
                        speed?: number;
                        /** @description Speaker of a voice that has several (see `speakers` in `GET /api/environment`); default 0. Out of range is `400`. */
                        speaker?: number;
                    };
                };
            };
            responses: {
                /** @description The audio. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "audio/wav": string;
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                /** @description The voice is not installed (or its `.onnx.json` is missing). */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Piper could not synthesize the text. */
                502: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/transcribe": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Transcribe a spoken sentence (Whisper, on the server and on CPU)
         * @description The body is the recording as the browser makes it (WebM/Opus, MP4/AAC, Ogg, WAV or MP3; ffmpeg detects the format), up to 5 MB and 60 seconds. It is read with `whisper-cli` on this machine and the recording lives in a temporary folder only during the call: it is not saved and its text does not go to the logs. Without `language` the language is detected. A recording with no words answers 200 with an empty `text`. Unlike a song's lyrics, it does not wait for runs (it only checks memory) and does not clean up repetitions. More than 5 MB or 60 seconds answers 413; an unreadable audio, 422; without `whisper-cli`, without a model, without ffmpeg or without memory, 503.
         */
        post: {
            parameters: {
                query?: {
                    /** @description ISO 639-1 code (es, en…). Without it, it is detected. */
                    language?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/octet-stream": string;
                };
            };
            responses: {
                /** @description The spoken text. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            text?: string;
                            language?: string;
                            language_detected?: boolean;
                            /** @description Seconds of the recording. */
                            duration?: number;
                            model?: string;
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                /** @description The recording weighs more than 5 MB or lasts more than 60 seconds. */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                422: components["responses"]["Unprocessable"];
                /** @description whisper-cli, its model, ffmpeg or memory is missing. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Took too long and was stopped. */
                504: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/assist/listen": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Listen to a song recorded with the microphone and say what kind it is
         * @description The body is the recording of a song playing, as the browser makes it (up to 10 MB and 60 seconds; at least 4). It measures the tempo and the key with its own estimator, measures how it sounds (timbre, bass, texture, dynamics, rhythm density and volume), reads a few words of the lyrics with `whisper-cli` and asks the assistant to describe the style and what it is about from all of that; if it does not know the genre it says so (`genre_unknown`) instead of inventing it. The lyrics heard are neither returned nor saved, and the recording lives in a temporary folder only during the call. `request` is the sentence to ask for an original song of that style. All figures are estimates; the tempo and the key are only given if they are reliable. It waits until no run is in progress, like the assistant. An unreadable or too short audio answers 422; without `whisper-cli`, model, ffmpeg, memory or assistant, 503.
         */
        post: {
            parameters: {
                query?: {
                    /** @description ISO 639-1 code of the lyrics. Without it, it is detected. */
                    language?: string;
                    /** @description `clap` adds what LAION-CLAP hears of the sound (its service has to be running: 503 with `error.reason` if not) and returns it in `heard`; `muq` does the same with MuQ-MuLan (503 with `no_service` or `no_weights` if it is not ready). */
                    method?: "whisper" | "clap" | "muq";
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/octet-stream": string;
                };
            };
            responses: {
                /** @description What was heard. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            seconds?: number;
                            language?: string;
                            /** @description Fewer than four words recognized: it may be instrumental or its voice could not be read; neither is claimed. */
                            no_words?: boolean;
                            /** @description How it sounds, in plain words, measured on the recording (timbre, bass, texture, dynamics, rhythm, volume). */
                            sound?: string[];
                            /** @description Labels that LAION-CLAP or MuQ-MuLan gave to the sound (with `method=clap` or `method=muq`). */
                            heard?: string[];
                            /** @description The assistant could not give a genre: the style only describes the sound. */
                            genre_unknown?: boolean;
                            bpm?: number;
                            bpm_confidence?: number;
                            keyscale?: string;
                            key_confidence?: number;
                            /** @description Genre, mood, instruments and voice, in English. */
                            style?: string;
                            /** @description What the lyrics are about, in their language; empty without words. */
                            theme?: string;
                            /** @description The sentence to ask for an original song of that style. */
                            request?: string;
                            warnings?: string[];
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                /** @description A run is in progress. */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description The recording weighs more than 10 MB or lasts more than 60 seconds. */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                422: components["responses"]["Unprocessable"];
                /** @description whisper-cli, its model, ffmpeg, memory or the assistant is missing. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Took too long and was stopped. */
                504: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/assist/request": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Interpret a free-form request (what is asked for, title and the texts of that type) in a single call
         * @description Turns a written or dictated sentence, in any language, into what the generator needs: the type (`video`, `image` or `music`), a short title, the language and the texts of that type, written with the same assistant tasks (CPU, memory check, model refusal, remote provider with consent). An image carries `image_prompt`; a video, `image_prompt` and `motion_prompt` (without `image_prompt` if an image or a video is attached, which are the starting point); a song, `caption`, `lyrics` (empty if instrumental) and, with the `heartmula` or `diffrhythm2` generator, `tags`. The type comes from `kind` (`kind_source: user`), from the model (`model`), from the attachment (`attachment`: an audio is music, an image or a video is video) or is `video` (`default`). If the type is known but a text cannot be written, the response carries the type and the title, that text empty and a warning in `warnings`; if the model refuses the request and there is no text at all, 422 `assist_refused`. An empty text or one of more than 2000 characters, an unknown `kind` or a language that is not an ISO code answer 400; while a run is queued or active, 409; without Ollama, without the model or without memory, 503.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @description The request (up to 2000 characters). */
                        text: string;
                        /** @description ISO 639-1 code of the request, if known. */
                        language?: string;
                        /**
                         * @description Sets the type; the model does not decide it.
                         * @enum {string}
                         */
                        kind?: "video" | "image" | "music";
                        /** @description Music generator (ace-step, heartmula, diffrhythm2) for the tags and the sections. */
                        generator?: string;
                        /** @description With `music`: the song's duration in seconds; sets the structure of the lyrics (up to 75 s short, more than 150 s long, otherwise normal). */
                        seconds?: number;
                        /** @description With `music`: sets whether the song has vocals when the caller already knows (another suggestion for the same card); without it the request model reads it. */
                        instrumental?: boolean;
                        attachments?: {
                            image?: boolean;
                            video?: boolean;
                            audio?: boolean;
                        };
                        model?: string;
                        provider?: string;
                    };
                };
            };
            responses: {
                /** @description What was understood. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            kind?: "video" | "image" | "music";
                            /** @enum {string} */
                            kind_source?: "user" | "model" | "attachment" | "default";
                            title?: string;
                            language?: string;
                            image_prompt?: string;
                            motion_prompt?: string;
                            caption?: string;
                            lyrics?: string;
                            tags?: string;
                            instrumental?: boolean;
                            /** @description Duration the request names, or 0. */
                            seconds?: number;
                            warnings?: string[];
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                409: components["responses"]["Conflict"];
                /** @description The model refused the request (`assist_refused`). */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Ollama is not responding, the model is missing or there is not enough memory. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/assist/svg": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Write an SVG drawing from a description
         * @description Writes one SVG document from a description, in any language, with the assistant's guards: the routing of the task (and the consent for a remote provider), the wait for a run in progress, the memory rule, CPU only for a local model, and the model's own refusal. The prompt asks for a single `<svg>` with a `viewBox`, shapes and groups with an `id` on every element worth selecting, fills and strokes as attributes (no `<style>`, gradients, filters or `<text>`), at most 40 elements. What comes back is checked cheaply: it must parse as XML, its root must be `<svg>`, it must have a `viewBox` and it must hold no `<script>`, `<foreignObject>`, event attribute (`onclick`…) or reference to anything outside the document; otherwise `422` `validation_failed` says which. A model that declines is `422` `assist_refused`. An empty text, or one of more than 2000 characters, answers 400; while a run is queued or active, 409; without Ollama, without the model or without memory, 503. It takes as long as any assistant call (tens of seconds to minutes on the CPU). A server that has this operation lists `svg` in the `features` of `GET /api/music-motion/catalog`; a client checks that before offering it.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @description What to draw (up to 2000 characters). */
                        text: string;
                        /** @description An installed model (see `GET /api/assist/models`); without it, the usual routing. */
                        model?: string;
                        provider?: string;
                    };
                };
            };
            responses: {
                /** @description The drawing. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @description The SVG document, from `<svg` to `</svg>`. */
                            svg: string;
                            /** @description The model that was asked for, when the request named one. */
                            model?: string;
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                409: components["responses"]["Conflict"];
                /** @description The model refused (`assist_refused`) or its answer is not a usable SVG (`validation_failed`). */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Ollama is not responding, the model is missing or there is not enough memory. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/assist/plan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Plan a whole animated video from one sentence
         * @description Turns one sentence, in any language, into the plan of a music video: the song's brief (`title`, `caption`, `lyrics`, `tags`, `instrumental`, `seconds`, written by the music task for the given `generator`), the animation's choices (`style`, `level`, `fps`, `mode` and a one-sentence `concept`, each one a value the catalog offers) and the parts worth having, checked against the catalog (`exists`; a part that is not in it carries the `request` that asks for its draft). `animation.prompt` is the sentence itself. It has the guards of the other assistant calls: routing and consent for a remote provider, the wait for a run in progress (`409`), the memory rule, CPU only for a local model and the model's own refusal. A field the model cannot fill, or fills with a value the catalog does not offer, comes empty with an entry in `warnings`; a refusal with nothing written is `422` `assist_refused`. It makes two assistant calls (tens of seconds to minutes on the CPU). A server that has it lists `plan` in the `features` of `GET /api/music-motion/catalog`; a client checks that before using it.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @description The sentence (up to 2000 characters). */
                        text: string;
                        /** @description The song's generator (`ace-step`, `heartmula`, `diffrhythm2`); it shapes the lyrics and the tags. */
                        generator?: string;
                        /** @description ISO 639-1 code of the sentence, when the caller knows it. */
                        language?: string;
                        /** @description The length of the song, when the person already chose it: it is used as is and there is no warning about the length. */
                        seconds?: number;
                        /** @description Prompts of the house style (each field up to 2000 characters), put in the model's context as examples to follow and never to copy. A server that takes them lists `examples` in the `features` of `GET /api/music-motion/catalog`. */
                        examples?: {
                            prompt: string;
                            negative?: string;
                            tags?: string;
                        }[];
                        /** @description An installed model (see `GET /api/assist/models`); without it, the usual routing. */
                        model?: string;
                        /** @description A saved provider that replaces the routing for this call only; a remote one needs consent (`consent_required`). */
                        provider?: string;
                    };
                };
            };
            responses: {
                /** @description The plan. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            song: {
                                title?: string;
                                caption?: string;
                                /** @description Empty when instrumental. */
                                lyrics?: string;
                                tags?: string;
                                instrumental?: boolean;
                                /** @description 0 or absent when the sentence names no length (with a warning). */
                                seconds?: number;
                            };
                            animation: {
                                /** @description A value of `styles` in the catalog; empty with a warning when not. */
                                style?: string;
                                level?: string;
                                fps?: number;
                                mode?: string;
                                concept?: string;
                                /** @description The sentence, to use as the person's direction for the piece and its proposals. */
                                prompt?: string;
                            };
                            /** @description At most 6. */
                            parts: {
                                name: string;
                                exists: boolean;
                                /** @description Only when it does not exist: the sentence for `POST /api/music-motion/part-drafts`. */
                                request?: string;
                            }[];
                            warnings: string[];
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                409: components["responses"]["Conflict"];
                /** @description The model refused (`assist_refused`). */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Ollama is not responding, the model is missing or there is not enough memory. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/assist/dataset": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Write a dataset of several entries from one sentence
         * @description Turns one sentence, in any language, into a dataset in the tuple shape `POST /api/import/preview` reads: a storyboard (`mode: video`: each entry is a scene with its `Dialogue:`, `Motion:` and picture line), animated graphics (`motion`: an entry names a part of the catalog with `Part:` and `Param` lines, checked against it, or describes a graphic with `Graphic:`) or songs (`music`: each entry is a track with its style, `Lyrics:` unless instrumental and `Tags:` in the `generator`'s vocabulary; at most 6 tracks, each one more model call). At most 12 entries. The lines the request fixes are written by the server, not left to the model: `negative` becomes the `Negative:` line and `images.variants` the `Variants:` line of every scene, and `look` ends the picture line of every scene. Every entry is checked with the import's own mapping before it is returned; one that fails (a repeated id is renamed, a scene with no picture line, a part that is not in the catalog) is left out with an entry in `warnings`, so what comes back previews. It has the guards of `POST /api/assist/plan`: routing and consent for a remote provider, the wait for a run in progress (`409`), the memory rule, CPU only for a local model and the model's refusal (`422` `assist_refused`); nothing usable written is `422` `validation_failed`. A server that has it lists `dataset` in the `features` of `GET /api/music-motion/catalog`.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        mode: "video" | "motion" | "music";
                        /** @description The sentence (up to 2000 characters). */
                        text: string;
                        /** @description ISO 639-1 code of the sentence, and of the narration. */
                        language?: string;
                        /** @description The video generator the scenes are for (video mode). */
                        engine?: string;
                        /** @description Written as the shared `Negative:` line of every scene (video mode). */
                        negative?: string;
                        /** @description A phrase of style that ends the picture line of every scene (video mode). */
                        look?: string;
                        images?: {
                            /** @description Written as `Variants:` in every scene (video mode). */
                            variants?: number;
                        };
                        /** @description The music generator whose tag vocabulary the tracks use (music mode). */
                        generator?: string;
                        /** @description Prompts of the house style (each field up to 2000 characters), put in the model's context as examples to follow and never to copy. A server that takes them lists `examples` in the `features` of `GET /api/music-motion/catalog`. */
                        examples?: {
                            prompt: string;
                            negative?: string;
                            tags?: string;
                        }[];
                        /** @description An installed model (see `GET /api/assist/models`); without it, the usual routing. */
                        model?: string;
                        /** @description A saved provider that replaces the routing for this call only; a remote one needs consent (`consent_required`). */
                        provider?: string;
                    };
                };
            };
            responses: {
                /** @description The dataset. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @description `[id, title, lora_info, text]` tuples (`lora_info` is empty): send them, as JSON, as the `content` of `POST /api/import/preview` with the same `mode`. */
                            entries: string[][];
                            mode: string;
                            warnings: string[];
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                409: components["responses"]["Conflict"];
                /** @description The model refused (`assist_refused`) or nothing usable was written (`validation_failed`). */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Ollama is not responding, the model is missing or there is not enough memory. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/prompts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Search the prompt presets
         * @description Prompts of a house style that people pick from and that the assistant receives as examples. Kept as JSON files under `<media dir>/prompts/<kind>/` (beside the projects directory when there is no media directory). `q` matches title, prompt and tags (case-insensitive) and sorts the title matches first; `tags` lists tags that must all be present; the rest is by date, newest first. A censored server does not list the presets marked `nsfw`. Presets written to that folder by the command `orchestrator prompts fetch` (public datasets whose licence it reads from their card) are listed without a restart.
         */
        get: {
            parameters: {
                query?: {
                    kind?: "image" | "video" | "motion" | "music" | "animation";
                    q?: string;
                    /** @description Comma-separated. */
                    tags?: string;
                    limit?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The presets and how many matched. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            items: components["schemas"]["PromptPreset"][];
                            total: number;
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        /**
         * Save a preset of the person's own
         * @description Created with `own: true` and `source: "user"`; `kind` and `prompt` (up to 2000 characters) are required.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        kind: "image" | "video" | "motion" | "music" | "animation";
                        title?: string;
                        prompt: string;
                        negative?: string;
                        tags?: string[];
                        engine?: string;
                        language?: string;
                        nsfw?: boolean;
                    };
                };
            };
            responses: {
                /** @description The preset. */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PromptPreset"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/prompts/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete a preset of the person's own */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Deleted. */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Unauthorized"];
                /** @description A bundled preset is read-only (`forbidden`). */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                404: components["responses"]["NotFound"];
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/prompts/import": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Import a bundle of presets
         * @description A bundle is `{format: "prompt-presets", version: 1, items: [...]}` (at most 20000 items, 32 MiB). An item with the same `kind`, `source` and `source_id` as one already kept counts in `already`; one without `source` or `licence`, with an invalid `kind`, an empty prompt or one over 2000 characters is in `refused` with its `index` and the `reason`, and the rest is still added (as bundled, read-only presets).
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        format: "prompt-presets";
                        /** @enum {integer} */
                        version: 1;
                        items: components["schemas"]["PromptPreset"][];
                    };
                };
            };
            responses: {
                /** @description What was done with the bundle. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            added: number;
                            already: number;
                            refused: {
                                index?: number;
                                reason?: string;
                            }[];
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/assist/models": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Chat models installed in Ollama that the assistant can use
         * @description Excludes embedding and reranking models. `fits` says whether the model passes the assistant's memory rule (its size times 1.3 plus 4 GiB) with the memory free right now (always `true` if it cannot be read). `default` is the model used when a request names none.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Installed models, from smallest to largest. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            default?: string;
                            models?: {
                                name?: string;
                                /** Format: int64 */
                                size_bytes?: number;
                                fits?: boolean;
                            }[];
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
                /** @description Ollama is not responding. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/assist/music-tags": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * HeartMuLa style tag vocabulary, by category
         * @description The tags among which the assistant chooses for HeartMuLa and against which the server checks its answer, so that a client can offer the same ones.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Categories (genre, mood, instrument, tempo, voice, era and production) with their tags, and the ten popular combinations. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            categories?: {
                                id?: string;
                                tags?: string[];
                            }[];
                            /** @description The popular tag combinations. */
                            combos?: {
                                id?: string;
                                name?: string;
                                tags?: string[];
                            }[];
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/settings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Server settings
         * @description Six blocks: `ollama`, `heartmula`, `diffrhythm2`, `remote`, `browser` and `motion_model`. `ollama.host` is the address in use and `source` where it comes from: `setting` (saved here), `env` (`OLLAMA_HOST`) or `default` (`http://127.0.0.1:11434`). `remote` is `true` when the address is not this machine (neither `localhost`, nor `127.0.0.0/8`, nor `::1`): what the assistant, «describe a reference» and the quality review send to Ollama then leaves this computer. `saved` is the saved value, or empty.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Settings in use. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SettingsResponse"];
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        /**
         * Saves or removes the Ollama address
         * @description It is saved in `~/.config/mediaorquestator/settings.json` (permissions 600) and applies from the next request, without restarting. Priority: saved setting, `OLLAMA_HOST`, default value. Only `http` or `https` addresses are accepted (or without a scheme: `http`), with a host, no user or password, no path, query or fragment, and up to 200 characters. An empty value removes the setting.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @description Address, like `192.168.1.50:11434`; empty = remove the setting. */
                        ollama_host?: string;
                        music_motion?: {
                            /** @description Grade every part draft of music motion with the vision model of the `check` task. */
                            review_drafts?: boolean;
                        };
                    };
                };
            };
            responses: {
                /** @description Settings in use after the change. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SettingsResponse"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/settings/ollama/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Tests the connection to an Ollama
         * @description Asks Ollama for its version and its models (and which of them read images) in 5 seconds at most, without following redirects, with a cap of 4 MiB and 200 models. It sends nothing from the user and saves nothing. An address where nobody answers is a normal response (`ok: false` with the reason), not an HTTP error. It applies the same validation as saving.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @description Address to test; by default, the one in use. */
                        host?: string;
                    };
                };
            };
            responses: {
                /** @description Test result. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            ok?: boolean;
                            host?: string;
                            remote?: boolean;
                            version?: string;
                            models?: {
                                name?: string;
                                vision?: boolean;
                            }[];
                            error?: string;
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/settings/database": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Where the run history is stored
         * @description `saved` is what is stored and `active` what this server started with: the engine is read only once, at startup, so changing it requires a restart (`restart_required`). It never returns the password (`password_set`). `server_name` is what this server is called in a shared history and `servers` the names that already have runs in it.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The database. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DatabaseSettings"];
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        /**
         * Saves where the history is stored
         * @description `driver` is `sqlite` (the file, the default), `mysql` or `postgres`; with a server, `host`, `name` and `user` are needed (`port` defaults to the engine's). An omitted `password` keeps the saved one if the rest names the same server. It does not connect (see `/test`) and is applied on restart. `server_name` sets this server's name.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["DatabaseRequest"];
                };
            };
            responses: {
                /** @description What was saved. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DatabaseSettings"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/settings/database/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Tests the connection to a database
         * @description Opens the connection with what the form says (the saved password if omitted) and asks for its version. It creates or changes nothing. A database where nobody answers is a normal response (`ok: false` with the error), not an HTTP error. `empty` says that it does not yet have the history tables (they are created on startup with it).
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["DatabaseRequest"];
                };
            };
            responses: {
                /** @description Test result. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            ok?: boolean;
                            version?: string;
                            empty?: boolean;
                            error?: string;
                        };
                    };
                };
                /** @description The data is not a database, or it is SQLite, which has nothing to test. */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/settings/database/copy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Copies the history from the SQLite file to the saved database
         * @description Creates the tables if missing and copies runs, events, samples, reviews, findings and calibration from the file; rows that are already there (by id) are left as they are, so it can be repeated, and everything is done in one transaction. The rows in the file belong to this server. It will keep using the file until restart. `409` without a saved MySQL or Postgres database, if this server already stores the history in it or while a run is queued or running; `502` if the copy fails.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description How many rows were copied from each table. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            copied?: {
                                [key: string]: number;
                            };
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
                /** @description There is no saved database, it is already in use or a run is active. */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description The copy failed and nothing was changed. */
                502: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/metrics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * This server's state in the Prometheus text format
         * @description Everything is computed on request and speaks only of this server (in a shared history, each one counts its own runs). It never names a project in a label, so one hidden by the content mode is not given away. Families: `mediaorquestator_info`, `_uptime_seconds`, `_database_up`, `_runs{state,client,kind}`, `_run_duration_seconds{client,kind}` (histogram of the last 1000 successful runs; `kind` is `video`, `edit` or `project` and `client` the dashboard that requested the run, `embedded` for normal projects; only the 20 clients with the most runs are named and the rest are summed under `other`), `_memory_{used,total,available}_bytes`, `_disk_free_bytes{folder}`, `_gpu_{memory_used,memory_total}_bytes`, `_gpu_utilization_ratio`, `_gpu_temperature_celsius`, `_gpu_power_watts` (per card, absent if there is no `nvidia-smi`), `_music_service_running{service}` and `_music_service_starting{service}`. It requires the same token as the rest of `/api`: in Prometheus, `metrics_path: /api/metrics` and `authorization: { credentials_file: ... }`.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The metrics, version 0.0.4 of the exposition format. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "text/plain": string;
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/settings/monitoring": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The saved monitoring tools
         * @description Grafana, Prometheus, Loki and Redis, in that order, with their address and user. It never returns the password (`secret_set`). The server depends on none of them: it only stores what it is told and looks at them when asked.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The tools. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MonitoringTools"];
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/settings/monitoring/{tool}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Saves a tool's address
         * @description `tool` is `grafana`, `prometheus`, `loki` or `redis`. The address is `host[:port]` or an http(s) URL (the default port is the tool's: 3000, 9090, 3100, 6379; for Redis, only `host[:port]`). With `user` the calls carry Basic authentication; without `user`, `secret` is a token sent as Bearer (for Redis, the password). An omitted `secret` keeps the saved one if the address and the user are the same. An empty address removes the tool. It does not connect (see `/test`).
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    tool: "grafana" | "prometheus" | "loki" | "redis";
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["MonitoringRequest"];
                };
            };
            responses: {
                /** @description The saved tools. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MonitoringTools"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/settings/monitoring/{tool}/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Tests a monitoring tool
         * @description Asks about its health and, with user and password, about something that needs them: Grafana `/api/health` and `/api/org`, Prometheus `/-/healthy` and its version, Loki `/ready` and its version, Redis `PING`. It writes nothing anywhere and saves nothing. Without a body it tests what is saved. A tool that is switched off is a normal response (`ok: false` with the error), not an HTTP error.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    tool: "grafana" | "prometheus" | "loki" | "redis";
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["MonitoringRequest"];
                };
            };
            responses: {
                /** @description Test result. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            ok?: boolean;
                            version?: string;
                            /** @description A user and password were given and the tool accepted them (or not). */
                            authenticated?: boolean;
                            error?: string;
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/settings/heartmula/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Tests the connection to a HeartMuLa service
         * @description Asks only `GET /health` of the service (given address or the saved one, with its password or the given one). It sends no lyrics or tags and saves nothing. An address where nobody answers is a normal response (`ok: false` with the reason), not an HTTP error.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @description Address to test; by default, the saved one. */
                        host?: string;
                        /** @description Password to use; by default, the saved one (or none if another address is given). */
                        token?: string;
                    };
                };
            };
            responses: {
                /** @description Test result. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            ok?: boolean;
                            host?: string;
                            remote?: boolean;
                            version?: string;
                            gpu?: string;
                            free_mb?: number;
                            /** @description unreachable or key_rejected. */
                            reason?: string;
                            error?: string;
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/settings/diffrhythm2/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Tests the connection to a DiffRhythm2 service
         * @description Asks only `GET /health` of the service (given address or the saved one, with its password or the given one). It sends no lyrics or style and saves nothing. An address where nobody answers is a normal response (`ok: false` with the reason), not an HTTP error.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @description Address to test; by default, the saved one. */
                        host?: string;
                        /** @description Password to use; by default, the saved one (or none if another address is given). */
                        token?: string;
                    };
                };
            };
            responses: {
                /** @description Test result. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            ok?: boolean;
                            host?: string;
                            remote?: boolean;
                            version?: string;
                            gpu?: string;
                            free_mb?: number;
                            /** @description unreachable or key_rejected. */
                            reason?: string;
                            error?: string;
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music/engines": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Optional music generators and whether they can be used now
         * @description `heartmula`, `diffrhythm2` and `clap` (LAION-CLAP, which does not generate music: it only hears the sound of an audio and is started and stopped the same way): each one available if there is an external service configured that answers, or a possible local service (installed with `scripts/get-services.sh`, with dotnet, installed weights and a GPU with free memory). It starts no service; the response is cached for 30 s. If it is not available, `reason` says why (`no_service`, `no_weights`, `no_gpu`, `unreachable`, `no_consent`, `key_rejected`, `not_running`). The services are started and stopped by the user (`/start`, `/stop`); with one stopped the reason is `not_running` and `container` says the state. `?stats=1` also asks for the memory each one uses (uncached).
         */
        get: {
            parameters: {
                query?: {
                    stats?: "1";
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Availability of each generator. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            engines?: {
                                [key: string]: {
                                    available?: boolean;
                                    /** @enum {string} */
                                    mode?: "local" | "external";
                                    reason?: string;
                                    detail?: string;
                                    missing?: string[];
                                    version?: string;
                                    container?: components["schemas"]["ContainerState"];
                                };
                            };
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music/engines/{engine}/start": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Start a generator's service (or the LAION-CLAP service)
         * @description Starts the `heartmula` or `diffrhythm2` service, or the LAION-CLAP service (`clap`, which is not a generator: it only serves to hear the sound of an audio), on the requested GPU (by default the one with the most free memory) and waits in the background for the service to say `ready`; the state is queried with `GET /api/music/engines`. The service stays up until it is stopped: neither a run nor the server shutdown stops it.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    engine: "heartmula" | "diffrhythm2" | "clap";
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @description CUDA index of the card. */
                        gpu?: number;
                    };
                };
            };
            responses: {
                /** @description Starting. */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            container?: components["schemas"]["ContainerState"];
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
                /** @description Cannot be started (`validation_failed` with `reason`); no service, weights or GPU installed. */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music/engines/{engine}/stop": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Stop a generator's service (or the LAION-CLAP service)
         * @description Stops the `heartmula`, `diffrhythm2` or `clap` service. 409 if an active music run uses that generator.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    engine: "heartmula" | "diffrhythm2" | "clap";
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Stopped. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            container?: components["schemas"]["ContainerState"];
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/providers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Model providers (the built-in Ollama first, then the saved ones)
         * @description The `ollama` provider always exists (`builtin: true`), takes its address from the Ollama setting and cannot be edited or deleted here. `remote` is `true` when the address is not this machine. A key is never returned: only `key_set`.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description List of providers. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            providers?: components["schemas"]["Provider"][];
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        /**
         * Adds a provider
         * @description `type` is `ollama` (another Ollama, with the address rules of the Ollama setting) or `openai` (any compatible server: OpenAI, OpenRouter, Together, Groq, vLLM, LM Studio, llama.cpp). For `openai` the address carries an `http` or `https` scheme, no credentials, query or fragment, and its path is empty or ends in `/v1`. Without `id` it is derived from the name. The key is saved in `keys.json` (permissions 600), never in `settings.json`, and is not sent over plain `http` to another machine (use `https`).
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["ProviderInput"];
                };
            };
            responses: {
                /** @description Provider created. */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Provider"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/providers/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        get?: never;
        /**
         * Edits a saved provider
         * @description An absent `key` leaves the key as it is, an empty one removes it (the provider stays) and any other value saves it. The built-in `ollama` provider is not edited here: its address is changed in the Ollama settings.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["ProviderInput"];
                };
            };
            responses: {
                /** @description Provider after the change. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Provider"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        post?: never;
        /** Deletes a provider and its key */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Deleted. */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/providers/{id}/test": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Tests a provider: lists its models
         * @description Asks for the models (`GET /v1/models` or Ollama's tags) in 5 seconds at most, without following redirects, with a cap of 4 MiB and 200 models. It sends nothing from the user; the key goes only to the provider itself, as Bearer. A provider that does not answer or rejects the key is a normal response (`ok: false` with the reason), not an HTTP error.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Test result. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            ok?: boolean;
                            host?: string;
                            remote?: boolean;
                            models?: {
                                name?: string;
                                /** @description Ollama only. */
                                vision?: boolean;
                            }[];
                            error?: string;
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/routing": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Which provider runs each task
         * @description Five tasks: `assistant` (prompt assistant: image, motion, song and music-video storyboard), `describe_image`, `describe_video`, `quality` (clip quality review) and `motion_graphics` (writing the HTML page of a motion graphic or overlay, text model). By default all go to the built-in Ollama. `model` is the provider's text model for `assistant` and the vision model for the others (empty on an Ollama with no declared model). `remote` says whether the provider is not this machine and `consented` whether the user agreed to send data to its current address. `max_calls` is the cap on calls from one job to a remote provider.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Routing in use. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Routing"];
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        /**
         * Changes the provider of one or more tasks, or the call cap
         * @description `routing` assigns a provider id to a task (`ollama` returns it to the built-in one). Routing a task to a **remote** provider requires the user's acknowledgement that the images, videos or texts of that task will leave this computer: it is given here with `acknowledge_remote: true` or beforehand with `POST /api/providers/{id}/acknowledge`; without it, `400` with the code `consent_required`. An OpenAI-compatible provider without the model the task needs is rejected (`no_model`). Nothing changes if anything fails. `max_calls` (at least 1; default 60) is the cap on calls per job to a remote provider.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @description Task → provider id. */
                        routing?: {
                            [key: string]: string;
                        };
                        acknowledge_remote?: boolean;
                        max_calls?: number;
                    };
                };
            };
            responses: {
                /** @description Routing after the change. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Routing"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/providers/{id}/acknowledge": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Agrees to send data to a remote provider, at its current address
         * @description It is saved tied to the provider and its base address: if the address changes it has to be accepted again. The built-in provider does not need it (404).
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The provider. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Provider"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/generation/options": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Which ways there are to make a video and with which models an image can be retouched
         * @description The ways of making a video now (`video`, in stable order; the first available one is the default) and the models an image can be retouched with (`image_models`), each with what a client needs to draw its form without knowing the engines. An option this machine cannot run comes with `available: false` and the `reason`. A server that hides adult content does not offer the models made for adults (nor in the catalog): they do not exist for the API. The identifiers of the video options (`h3-full`, `wan-high`, `ltx`, `h3-draft`, `wan-medium`, `wan-low`, `ad-high`, `ad-medium`, `ad-low`) are those of the interface. `estimate` is the seconds of a generation at the best quality, 16:9 and with no start image; it does not grow with the duration, because the motion repeats (`clip_seconds`).
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Options. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["GenerationOptions"];
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/generations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Lists the video generations, most recent first */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Generations. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Generation"][];
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        /**
         * Makes a video in a single call
         * @description Plans the generation (engine, models, resolution, duration, audio), creates it as a project of its own (hidden: it does not appear in `GET /api/projects`, the storage or the per-project statistics), launches its run on the usual queue and answers `202` with its identifier and the run's. With a start image the request is `multipart/form-data` (`request` part with the JSON and `image` part); without it, `application/json`. The duration is the scene's: the engine's clip is short (`clip_seconds`) and repeats until it fills it; clips are not chained. `422` with the reason if the option does not accept the request (duration, aspect ratio, quality, audio, unknown option, neither prompt nor image) or if the server does not keep adult content; `503` if the option cannot be run now. In both cases nothing is created.
         *
         *     Besides the start image it accepts an **end image** (`end_image`) with the options whose `inputs` says `end_image: true`, and **references** (images, videos and audios) with those that advertise `reference_images` (`h3-ref`, `h3-ref-draft`), with the maximums and durations of `inputs`, which depend on the card. References cannot be combined with `image` or `end_image`, and carry at least one image, which anchors the scene and is the first reference; in the prompt they are named `<Picture 1>`, `<Picture 2>`… in the order of the parts. An end image needs the start one. With an end image the clip does not go back and forth: it plays once and its last frame is held until the duration is filled. `reuse_inputs_of` uses the files of another generation without sending them again. Each rejection is a `422` with the part and what is accepted.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["GenerationRequest"];
                    "multipart/form-data": {
                        /** @description The request JSON (`GenerationRequest`). */
                        request: string;
                        /**
                         * Format: binary
                         * @description Start image: png, jpg, jpeg or webp.
                         */
                        image?: string;
                        /**
                         * Format: binary
                         * @description End image (png, jpg, jpeg or webp): only with the options that have `inputs.end_image`; needs `image`.
                         */
                        end_image?: string;
                        /** @description Reference images, in order (the first anchors the scene). Only with the options that have `inputs.reference_images`. */
                        reference_images?: string[];
                        /** @description Reference videos (mp4, mov, webm or mkv), each up to `inputs.reference_videos.max_seconds`. */
                        reference_videos?: string[];
                        /** @description Reference audios (mp3, wav, m4a, aac, ogg or flac), each up to `inputs.reference_audios.max_seconds`. */
                        reference_audios?: string[];
                    };
                };
            };
            responses: {
                /** @description Generation accepted. */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Generation"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                422: components["responses"]["Unprocessable"];
                /** @description The option cannot be run now (`unavailable`, with the reason). */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/generations/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * State and progress of a generation
         * @description `state` is `queued`, `running`, `done` or `failed`; `progress` goes from 0 to 100 according to the run phases that have finished; when done, `video` is the video's address (a read-only artifact, with the same access as the rest of the API) and, if it failed, `error` says why. Events are followed at `GET /api/runs/{run_id}/events`.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The generation. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Generation"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        post?: never;
        /** Cancels and deletes a generation with its files and its run history */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Deleted. */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music-motion/catalog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The parts, characters and options a piece is made with
         * @description What is needed to draw a piece's form without knowing the engine: the catalog's animated parts (with their parameters, limits and levels), the characters and backgrounds of the illustrated library, the levels, the styles, the frame rates, a character's actions, the typefaces and the modes. It is read on each request: a part or a character added in the user's folder appears in the next one. The scenes written for the verses of a piece (parts with `scene`) are **not** in `parts` unless asked for: `include=scene` adds all of them, `piece=<id>` adds those written for that piece.
         */
        get: {
            parameters: {
                query?: {
                    /** @description `scene` adds every scene part. */
                    include?: "scene";
                    /** @description Adds the scene parts written for this piece. */
                    piece?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The catalog. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MusicMotionCatalog"];
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music-motion/parts/{name}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Reads back a part
         * @description The `manifest` and the `fragment` (`part.html`) of a part of the catalog, the user's (`source: user`) or one that comes with the program (`source: builtin`), so a part can be carried to another server (post them as a part draft there) or drawn in a browser. `404` for a name that is not a part or is not a valid name. It holds only what is in the two files, and `origin` when the part has one.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    name: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The part. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MusicUserPart"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        /**
         * Replaces a part of the user's
         * @description Writes a new `manifest` and `fragment` over a part of the user's folder, with the checks of an approval (manifest and fragment rules, page, motion, two identical drawings), without going through a draft. The manifest must keep the name of the part. The part keeps its origin and the catalog lists the change at once. `409` for a part that comes with the program (`source: builtin`); `422` with the problems, or with a manifest that names another part, and nothing changes; `503` if Chrome is missing.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    name: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["PartDraftPut"];
                };
            };
            responses: {
                /** @description The part as the catalog lists it. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MusicPart"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
                422: components["responses"]["Unprocessable"];
                /** @description Chrome is missing. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        /**
         * Deletes a part of the user's
         * @description Removes the part's folder; the catalog stops listing it at once. `409` if a piece's script (main part, extra or layer item) or a style uses it, naming them in the message, unless `force=true`; `409` too for a part that comes with the program (`source: builtin`). Nothing is changed in the pieces or styles that used it: they stop being valid until they get another part.
         */
        delete: {
            parameters: {
                query?: {
                    /** @description Delete it even if pieces or styles use it. */
                    force?: boolean;
                };
                header?: never;
                path: {
                    name: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Deleted. */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music-motion/part-drafts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lists the part drafts, most recent first
         * @description A draft is a new part written by the assistant from a sentence and, if given, an image. It is not in the catalog until it is approved. The list carries neither `manifest` nor `fragment` (they are in the read of one).
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Drafts. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            drafts: components["schemas"]["PartDraft"][];
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        /**
         * Requests a part draft from a sentence and, optionally, an image
         * @description The JSON body may be up to 8 MiB (`x-max-body-bytes`: 8388608), enough for a part sent as text with a vector drawing or a picture in it; a larger one is `400` naming the limit.
         *
         *     With a JSON body (`request` and, to use a frame from the library, `reference_id` and `frame`, one of `analysis.frames`) or with `multipart/form-data` (`request` and, if wanted, `file` with a png, jpg or webp of up to 20 MB). The image is optional: without it the part is written from the sentence alone (`with_picture` is `false`). Answers `202` with the draft in the `writing` state; the work continues in the background and moves to `ready` or to `failed` (with `error`). If there is an image, the age is checked before writing anything: a minor, or a person whose age cannot be confirmed, stops the draft and the image is not kept. The assistant is asked up to 3 times, with the reason for the previous rejection. `422` with the reason if the sentence is missing or exceeds 500 characters, the reference or the frame are not valid or the file is not an image (nothing is created); `409` while a run is queued or active and the model is local; `503` with the reason if there is no Chrome or assistant, or if an image is given and there is no vision model (a given image is not discarded in order to continue without it).
         *
         *     **Choosing the model:** `model` (in the JSON body, or a `model` field of the form) names one of the installed models (`GET /api/assist/models`) that writes the part instead of the one the motion-graphics task is routed to. One that is not installed is `422` naming it and the installed ones, and nothing is created. The draft keeps it (`model`), and a retry writes with the same one. It does not choose the vision model that reads an image.
         *
         *     **Choosing the provider:** `provider` (JSON body or form field) is the id of a saved provider (`GET /api/providers`) that writes the part instead of the `motion_graphics` routing, for this draft only (the routing is not written); `model` then names a model of that provider. A remote provider needs consent (`400 consent_required`), an unknown one is `400` naming it, and both are refused before anything is created. The draft keeps it (`provider`) and a retry uses the same one.
         *
         *     **A scene for a verse:** a JSON body with `scene: {piece, script_piece, brief?}` (JSON only; with it `request` is **not needed** and, when sent, is taken as the idea if there is no `brief`; without `scene`, `request` stays required). The server builds the writer's whole input from the saved piece: the script piece's lines with their words and times (in the piece's seconds) and keyword, the hit, the section and its number, the mode, the resolved design, the length, the parts of the neighbouring pieces and the scene rubric; no lyric is sent by the client. `brief` is the idea or metaphor asked for (up to 500 characters, else `422`). An unknown `piece` or `script_piece` is `404` and a piece with no script `422`, before anything is created. The draft carries `scene` and `brief`, is written with the scene instruction, may draw the lyric itself (`verse: own` in its manifest), is checked and previewed in the verse's own lines and fails when a word is not drawn at its time. The part it becomes is named `scene-<short>-<n>` (`<short>` is the end of the piece's id, so the name fits the 32 characters a part name has; the piece is in the manifest's `scene.piece`) and its manifest carries `scene`. `multipart` does not take `scene`. `manifest`/`fragment`, a reference or a frame with `scene` is `422`. A server that has scenes lists `scene` in the `features` of the catalog.
         *
         *     **From scratch, with no assistant:** a JSON body with `manifest` and `fragment` (strings, as in the draft's `PUT`) instead of `request`. They are checked like an edit is (rules, page, motion, a name that is not in the catalog) and the preview is drawn before answering `200` with the draft: `ready`, or `failed` with its `problems` (and the two files, so it can be edited with `PUT`) if they do not pass. It needs only Chrome (`503` without it), no assistant and no vision model. `manifest`/`fragment` with a picture or a frame is `400`.
         *
         *     **Change an existing part with the assistant:** `request` (the instruction, 1 to 500 characters) together with `manifest` and `fragment` (the current text; the manifest must be a JSON with its `name`). The assistant starts from that text instead of from nothing and writes the changed version; it is the same flow as a draft asked for with a sentence (`202` with the draft `writing`, the same checks and preview, up to 3 attempts, then `ready` or `failed`). The draft has `replaces`: the name of the given manifest, which the new version may keep although the catalog already has it (it keeps it unless the instruction asks for another). To store the result over an approved part, send its `manifest` and `fragment` with `PUT /api/music-motion/parts/{name}`; `approve` still refuses a name the catalog has. `422` if the manifest or the fragment is missing or the manifest has no name; with a picture or a frame, `400`. It needs the assistant like a draft from a sentence (`503`, `409` as there).
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["PartDraftRequest"];
                    "multipart/form-data": {
                        request?: string;
                        /** Format: binary */
                        file?: string;
                    };
                };
            };
            responses: {
                /** @description A draft made from a manifest and a fragment (`ready` or `failed`). */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PartDraft"];
                    };
                };
                /** @description Draft accepted; it is being written. */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PartDraft"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                409: components["responses"]["Conflict"];
                422: components["responses"]["Unprocessable"];
                /** @description Chrome, the assistant or, with an image, the vision model is missing. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music-motion/part-drafts/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** A draft with its manifest, its fragment, its problems and its preview */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The draft. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PartDraft"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        /**
         * Replaces a draft's manifest and fragment
         * @description They are checked like any part (manifest and fragment rules, page, motion, two identical drawings, a name that is not in the catalog). If they pass they are saved, another preview is drawn and the draft becomes `ready`; otherwise, `422` with the problems and the draft does not change. `409` while it is being written.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["PartDraftPut"];
                };
            };
            responses: {
                /** @description The draft. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PartDraft"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
                422: components["responses"]["Unprocessable"];
                /** @description Chrome is missing. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        post?: never;
        /**
         * Deletes a draft with its files
         * @description If it is being written, it stops the work.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Deleted. */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music-motion/part-drafts/{id}/retry": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Another attempt on a failed draft
         * @description Asks the assistant for the part again with the same sentence and the same description of the image (it is not described again). Answers `202` with the draft in `writing`. `422` if it is not `failed` or if its image was deleted (because of a minor); `409` if it is being written or there is a run with a local model; `503` if Chrome or the assistant is missing.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Another attempt in progress. */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PartDraft"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
                422: components["responses"]["Unprocessable"];
                /** @description Chrome or the assistant is missing. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music-motion/part-drafts/{id}/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Approves a draft: the part moves to the catalog
         * @description Only a `ready` draft. It is checked again, the manifest and the fragment are copied to the user's parts folder (where the catalog lists it) and the draft is deleted. Answers the part as the catalog lists it. `409` if that folder already has a part with that name (the name is changed by editing the draft) or if it is being written; `422` if it is not `ready` or no longer passes the checks. Nothing approves a draft by itself.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The new catalog part. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MusicPart"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
                422: components["responses"]["Unprocessable"];
                /** @description Chrome is missing. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music-motion/part-drafts/{id}/preview/{name}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * A frame of a draft's preview
         * @description `name` is one of those in `preview` (for example `01.png`).
         */
        get: {
            parameters: {
                query?: {
                    /** @description Ticket from `POST /api/auth/ticket`, for clients that cannot send headers. */
                    ticket?: components["parameters"]["Ticket"];
                };
                header?: never;
                path: {
                    id: string;
                    name: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The frame. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "image/png": string;
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music-motion/presets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lists the styles, most recent first
         * @description A style is a design, a rhythm and a list of catalog parts taken from a reference; a piece can start from one (`preset` when creating it). A style is kept even if its reference is deleted.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Styles. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            presets: components["schemas"]["MotionPreset"][];
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        /**
         * Extracts a style from an already analysed reference, or makes one from its fields
         * @description Without `reference_id` the style is made from `name` (required), `design`, `rhythm` and `parts`, with the same validation as `PUT /presets/{id}` (`422` naming the field), and no reference or assistant is involved; sending `reference_id` together with those fields is a `422`. With `reference_id`:
         *             The design comes from the video's colors by rules (always valid: if the accent does not contrast enough it is
         *     adjusted and the style says so in `adjustments`), the typefaces and finishes from what the description of the look says, the rhythm from how long a shot lasts, and the parts are chosen by the assistant from the description and the catalog (without an assistant, or if it fails, the list stays empty and the style is made anyway). `422` with the reason if the reference does not exist or is not ready yet. Answers `201`.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["MotionPresetRequest"];
                };
            };
            responses: {
                /** @description Style created. */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MotionPreset"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                422: components["responses"]["Unprocessable"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music-motion/presets/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** A style */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The style. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MotionPreset"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        /**
         * Replaces a style's name, design, rhythm and parts
         * @description Validates the whole style (the design as a whole design, the rhythm between 2 and 15 seconds, the catalog parts without repeats and at most 8): `422` with the reason, which names the field (`design.accent`, `rhythm`, `parts[0]`…).
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["MotionPresetPut"];
                };
            };
            responses: {
                /** @description The style. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MotionPreset"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                422: components["responses"]["Unprocessable"];
            };
        };
        post?: never;
        /** Deletes a style */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Deleted. */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music-motion/references": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lists the references, most recent first
         * @description The reference library: videos given as an example of a good piece. Each one with its state (`analysing`, `ready` or `failed`), title, tags and, if ready, its analysis.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description References. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            references: components["schemas"]["MotionReference"][];
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        /**
         * Adds a reference from a YouTube address or an uploaded video
         * @description With a JSON body (`url`, `title`, `notes`, `tags`) it takes the address of a YouTube video like a project's sources (no account or cookies); with `multipart/form-data` it receives the video in the `file` field (and `title`, `notes`, `tags`). Answers `202` with the reference in the `analysing` state: the analysis is done in the background and the reference moves to `ready` or to `failed` (with the reason in `error`). `422` with the reason if the address is not valid, the file is not a video or the video lasts more than 20 minutes; in that case nothing is created. The video is not kept: only its key frames and the analysis. A reference does not leave the server nor is it used to generate images or video.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["MotionReferenceRequest"];
                    "multipart/form-data": {
                        /** Format: binary */
                        file?: string;
                        title?: string;
                        notes?: string;
                        /** @description JSON list of tags or comma-separated tags. */
                        tags?: string;
                    };
                };
            };
            responses: {
                /** @description Reference accepted; it is being analysed. */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MotionReference"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                422: components["responses"]["Unprocessable"];
                /** @description yt-dlp is missing. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music-motion/references/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** A reference with its analysis */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The reference. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MotionReference"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        post?: never;
        /**
         * Deletes a reference with its files
         * @description If it is being analysed, it stops the analysis.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Deleted. */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        options?: never;
        head?: never;
        /**
         * Changes a reference's title, notes or tags
         * @description Each field is optional; one that is not sent stays as it was. `422` if any is not valid.
         */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["MotionReferencePatch"];
                };
            };
            responses: {
                /** @description The changed reference. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MotionReference"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                422: components["responses"]["Unprocessable"];
            };
        };
        trace?: never;
    };
    "/api/music-motion/references/{id}/learn": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Learn from a reference
         * @description Learns from a `ready` reference in the background and proposes only what is different from what exists: one style and up to three parts. A proposal whose distance to the closest style, part or draft is below the threshold of the `strictness` is not made and is listed under `discarded` with the reason. A style that is kept is a normal style (`origin` `learned`); a part is a draft (`origin` `learned`) until it is approved. Nothing enters the catalog by itself. Without an assistant, a browser or a vision model the style is still drawn and what was left out is said in `skipped`. Answers `202` with the learning in `running`; read it with `GET /api/music-motion/learnings/{id}`. If a learning of this reference is running it answers `200` with that one and starts nothing. `404` for a reference that does not exist, `409` if it is not `ready`, `422` for a strictness that is not `low`, `normal` or `high`.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": components["schemas"]["LearnRequest"];
                };
            };
            responses: {
                /** @description A learning of this reference was already running. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Learning"];
                    };
                };
                /** @description The learning started. */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Learning"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
                422: components["responses"]["Unprocessable"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music-motion/learnings": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** The learnings, newest first */
        get: {
            parameters: {
                query?: {
                    /** @description Only the learnings of this reference. */
                    reference_id?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The learnings. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            learnings: components["schemas"]["Learning"][];
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music-motion/learnings/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * A learning with its proposals
         * @description What the learning kept (`styles` and `part_drafts`, each with what became of it now), what it dropped as too similar (`discarded`) and what it could not do (`skipped`). The drafts are read live: one that is still being written says `writing`. An item that no longer exists (deleted, or a draft approved into the catalog) says `gone`. A learning that was running when the server stopped reads `failed`.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The learning. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Learning"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music-motion/references/{id}/frames/{name}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * A key frame of a reference
         * @description `name` is one of those in `analysis.frames` (for example `03.jpg`).
         */
        get: {
            parameters: {
                query?: {
                    /** @description Ticket from `POST /api/auth/ticket`, for clients that cannot send headers. */
                    ticket?: components["parameters"]["Ticket"];
                };
                header?: never;
                path: {
                    id: string;
                    name: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The frame. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "image/jpeg": string;
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music-motion/pieces": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lists the pieces, most recent first
         * @description Summaries, without the script, the design or the song map (they are in `GET /api/music-motion/pieces/{id}`).
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Pieces. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MusicPiece"][];
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        /**
         * Creates a piece from a song of a music project
         * @description Reads the song (tempo, beats, sections, lyrics with timings and volume: the song map), picks a design and proposes a script with a fixed rule (no assistant: it is immediate), and saves everything as a piece of its own (a hidden project: it does not appear in `GET /api/projects`, the statistics or the per-project storage). Without `style` it is `typographic`; without `level`, `simple`; without `fps`, 30 (24 in the `illustrated` style); without `resolution`, 1280x720. If the song has not been transcribed, the lyrics' verses are distributed across its sections and `song_map.words_estimated` is `true`. `422` with the reason if anything is not valid (level, style, speed, resolution, client, design, unknown song); in that case nothing is created. Answers `201`.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["MusicPieceRequest"];
                };
            };
            responses: {
                /** @description Piece created. */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MusicPiece"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                422: components["responses"]["Unprocessable"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music-motion/pieces/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * A piece with its design, its script and its song map
         * @description `state` is `draft` (not yet drawn), `queued`, `running`, `done` or `failed`; `progress` goes from 0 to 100; when done, `video` is the video's address (a read-only artifact). `estimate` is a forecast of the drawing time (always `estimate: true`), corrected with how long the previous drawings took on this machine. Events are followed at `GET /api/runs/{run_id}/events`.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The piece. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MusicPiece"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        post?: never;
        /** Cancels and deletes a piece with its files and its run history */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Deleted. */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music-motion/pieces/{id}/design": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Sets the piece's design
         * @description Replaces the design after validating it (hexadecimal colors, typefaces from the list, modes, an accent with 3:1 contrast against the background of the modes in use, a concept of up to 200 characters) and checking that the saved script is still valid with it. A design set this way is marked as the user's (`edited`): a new song does not overwrite it. `422` with the reason if it is not valid; `409` while it is being drawn.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["MusicDesign"];
                };
            };
            responses: {
                /** @description The saved design. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MusicDesignStored"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
                422: components["responses"]["Unprocessable"];
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music-motion/pieces/{id}/script": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Sets the piece's script
         * @description Replaces the script after validating it whole: the pieces cover the song with no gaps or overlaps, each part is in the catalog and its parameters within their limits, the keyword and the word hit are words of their verses, and the stages use characters, poses, expressions and actions from the library and do not leave a character half out of frame (unless it enters or leaves). `422` with the piece and the reason if it is not valid; `409` while it is being drawn.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["MusicScript"];
                };
            };
            responses: {
                /** @description The saved script. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MusicScript"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
                422: components["responses"]["Unprocessable"];
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music-motion/pieces/{id}/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Builds the pages of a piece without saving anything
         * @description The pages the render would draw, each wrapped for a sandboxed frame (the virtual clock and the beat clock, and `postMessage({type:"seek", t})` to move it) with the song map cut to its piece. The body may carry a `design` and a `script`; they replace the saved ones for this call only. `422` with the same reason as `PUT /design` and `PUT /script` when one is not valid, and nothing is saved in any case. `?scenes=p1,p4` builds only those pieces (`422` for a name that is not a piece). Needs no Chrome and is allowed while the piece is being drawn. `replacements` lists the pieces whose part was swapped for the level; a saved script is drawn as it is, so it is empty today.
         */
        post: {
            parameters: {
                query?: {
                    /** @description Piece ids, separated by commas. */
                    scenes?: string;
                };
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        design?: components["schemas"]["MusicDesign"];
                        script?: components["schemas"]["MusicScript"];
                    };
                };
            };
            responses: {
                /** @description The pages. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MusicPiecePreview"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                422: components["responses"]["Unprocessable"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music-motion/pieces/{id}/frame": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * A frame of the saved piece, drawn like the render
         * @description A PNG of the saved piece at second `t`, drawn with Chrome as the render draws it, to compare with a preview in the browser; not for scrubbing. `422` for a `t` that is not a number or is outside the piece (no browser is started); `503` when there is no Chrome.
         */
        get: {
            parameters: {
                query: {
                    t: number;
                };
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The frame. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "image/png": string;
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                422: components["responses"]["Unprocessable"];
                /** @description There is no Chrome. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music-motion/library/characters/{name}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Reads a character of the library with its drawings
         * @description The character as the server reads it, with the SVG of each pose. `404` for a name that is not in the library or is not a valid name.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    name: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The character. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MusicLibraryCharacter"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music-motion/library/backgrounds/{name}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Reads a background of the library with its drawing
         * @description `404` for a name that is not in the library or is not a valid name.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    name: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The background. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MusicLibraryBackground"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music-motion/pieces/{id}/review": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Grades the whole piece with the vision model, scene by scene and as a whole
         * @description In the background (`202`): for each script piece three frames of its page (near the start, at its first word, near the end) are graded against the scene rubric by the vision model of the `check` task, then one frame of each scene is tiled into a contact sheet and graded for consistency of type, palette and frame and for scenes that repeat a metaphor. Read it on the piece as `review` (`state` `running`, then `done` or `failed`). `409` while a proposal, a render, a batch of scenes or another review of this piece runs, or a run holds the memory a local vision model needs; `422` without a script; `503` without Chrome or a vision model. A server with it lists `review` in the `features` of `GET /api/music-motion/catalog`.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The review has started. */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MusicPieceReview"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
                422: components["responses"]["Unprocessable"];
                /** @description Chrome or the vision model is missing. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music-motion/pieces/{id}/scenes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Writes a scene for every script piece, in the background
         * @description One draft per script piece (or the ones in `script_pieces`), written one after the other with the same engine as `POST /part-drafts` with `scene` (so each has its previews and problems) and reported in the piece's `scenes` (`done` rises to `total`). `brief_mode` is `metaphor` (the default: the writer chooses the visual metaphor for what each verse means) or `literal` (it draws what the words say). `model`/`provider` as in the drafts. Nothing is approved: each draft is approved like any draft, or all at once with `POST /scenes/approve`. `202` with the batch. `409` while a proposal, a render or another batch of this piece runs, or a run holds the memory a local model needs; `422` without a script; `404` for a `script_pieces` id that is not in the script; `503` without Chrome or assistant. Listed as `scene` in the catalog's `features`.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: {
                content: {
                    "application/json": {
                        /** @description Script piece ids; empty writes every piece. */
                        script_pieces?: string[];
                        /**
                         * @default metaphor
                         * @enum {string}
                         */
                        brief_mode?: "metaphor" | "literal";
                        model?: string;
                        provider?: string;
                        /** @description As `review` in `POST /part-drafts`, passed to every draft of the batch. */
                        review?: boolean | {
                            min?: number;
                            attempts?: number;
                        };
                    };
                };
            };
            responses: {
                /** @description The batch has started. */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MusicSceneBatch"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
                422: components["responses"]["Unprocessable"];
                /** @description Chrome or the assistant is missing. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        /**
         * Stops the batch after the draft it is writing
         * @description Answers `202` with the batch (`cancelled` once the current draft is finished); `404` when the piece has no batch.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The batch. */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MusicSceneBatch"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music-motion/pieces/{id}/scenes/approve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Approves every ready scene of the batch and puts it in the script
         * @description Each `ready` draft of the batch is approved (it becomes a scene part, `scene-<short>-<n>`) and becomes the `part` of its script piece (its `params` and `animate` are cleared); the script is validated and saved as `PUT /script` does. Answers `200` with `approved` (script piece, part, draft), `not_approved` (the drafts that were not ready or failed the checks, with their state and reason; their script pieces keep their parts) and the saved `script`. `422` naming the script piece when the script changed since the batch started (a script piece is not the one its scene was written for, or is gone); `409` while the batch is still writing; `404` without a batch.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description What was approved. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            approved: {
                                script_piece?: string;
                                part?: string;
                                draft_id?: string;
                            }[];
                            not_approved: {
                                script_piece?: string;
                                draft_id?: string;
                                state?: string;
                                error?: string;
                            }[];
                            script: components["schemas"]["MusicScript"];
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
                422: components["responses"]["Unprocessable"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music-motion/pieces/{id}/propose": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Asks the assistant for a new design or script
         * @description With `what: design` it proposes a design from the style and the lyrics; with `what: script`, a script from the song map, the design, the level and the catalog. The assistant's answer is validated and, if it is not valid, it is asked again with the reason, up to 3 times; without an assistant, or if all 3 fail, the result comes from a fixed rule and `source` is `fallback` (it is not an error). Parts the level does not support are replaced by simpler ones and are reported in `replacements`. What is proposed is saved and replaces what was there. Every `fallback` carries its `fallback_reason`, and the answer names the `model`. `what: all`, and any proposal with `async: true`, answers `202` with the state and works in the background: read `proposal` in the piece until it is `done` or `failed`; while a run is queued or active it is `waiting` instead of falling back at once. A synchronous proposal falls back at once when a run holds the memory. The fixed rule does not read the `prompt`. `409` while another proposal of the piece is being written, and for an edit of the piece meanwhile.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["MusicProposeRequest"];
                };
            };
            responses: {
                /** @description What was proposed. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MusicProposeAnswer"];
                    };
                };
                /** @description Accepted; it is written in the background (`proposal` in the piece). */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MusicProposal"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
                422: components["responses"]["Unprocessable"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music-motion/pieces/{id}/render": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Draws the piece
         * @description Validates the script, writes the piece's project (one scene per script piece, with its page and its song map, and the song as the soundtrack), launches its run on the usual queue and answers `202` with the run identifier and the time forecast. Scenes whose piece has not changed come from the cache. `409` if it is already being drawn; `503` if there is no Chrome or Chromium.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Drawing started. */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MusicRenderAnswer"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
                422: components["responses"]["Unprocessable"];
                /** @description There is no browser to draw with (`unavailable`). */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/music-motion/pieces/{id}/transcribe": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Hears when each word of the piece's song is sung
         * @description Reads the song with Whisper word by word (on the CPU: about a third of the song's duration) and rebuilds the song map: each word of the written lyrics carries the time at which it is heard (the lyrics do not change: what is heard only sets the times; a word that Whisper hears differently or does not hear takes a time between its neighbours), the verses keep their number and each section starts where its first word is sung; `song_map.words_estimated` becomes `false`. If the user did not edit the script, it is rebuilt with the fixed rule; if they edited it, it is kept and `script_warning` says how many of its pieces end up more than a second from a boundary of the new sections. It does not change the design, the level, the style or the frames. Without words heard it returns the piece as it was, with `words_note`. `409` if a run is in progress (also the piece's own: Whisper needs memory), `503` with the reason if Whisper is not installed or does not fit in memory, `404` if the piece does not exist.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The piece with the rebuilt map. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["MusicPiece"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
                /** @description Whisper failed to read the song (`internal`). */
                502: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Whisper is not installed or does not fit in memory (`unavailable`, with the reason). */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/image-edits": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Retouches an image in a single call
         * @description Takes an image (the `image` part of a `multipart/form-data` request), a model, a prompt, an optional negative prompt, an optional strength and a number of variants; creates the retouch as a project of its own (hidden, like the generations), launches its run on the usual queue and answers `202`. An `img2img` model starts from the image with `strength` (default 0.6) and makes up to `max_variants` variants; an `instruction` one changes the image according to the text («put a red cap on the man»), keeping the image's shape, and does not accept `strength` or `negative_prompt`. `422` with the reason if the model does not accept the request (blank prompt, `strength` outside (0, 1], variants outside 1 up to what the model makes, a setting it does not take) and `503` if the model cannot be run now; in both cases nothing is created.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "multipart/form-data": {
                        /** @description The request JSON (`ImageEditRequest`). */
                        request: string;
                        /**
                         * Format: binary
                         * @description The image to retouch: png, jpg, jpeg or webp.
                         */
                        image: string;
                    };
                };
            };
            responses: {
                /** @description Retouch accepted. */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ImageEdit"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                422: components["responses"]["Unprocessable"];
                /** @description The model cannot be run now (`unavailable`, with the reason). */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/image-edits/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * State, progress and results of a retouch
         * @description When done, `results` carries one image per variant with the seed that recreates it and its address (a read-only artifact).
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The retouch. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ImageEdit"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        post?: never;
        /** Cancels and deletes a retouch with its files and its run history */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Deleted. */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/video-edits/options": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Which tools can edit a video on this machine
         * @description Lists the tools in stable order (`scale`, `interpolate`, `reframe`, `remove-background`, `depth`, `extend`, `motion-control`), each with its identifier, name, description, `available`, the reason if it is not available, the settings it accepts (name, type, limits, default value) and whether it needs a reference image. A tool that lacks files, binaries or the vision service comes with `available: false` and the reason; the list never fails.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The tools. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["VideoEditOptions"];
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/video-edits": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lists the video edits, most recent first
         * @description Edits do not appear in `GET /api/projects`, nor in the storage or in the per-project statistics.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The edits. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["VideoEdit"][];
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        /**
         * Edits a video in a single call
         * @description Takes a video (the `video` part), a tool with its settings, a reference image if the tool takes one (the `image` part) and an optional `client`; creates the edit as a project of its own (hidden), launches its run on the usual queue and answers `202` with the edit's identifier and the run's. `motion-control` can take, instead of `video`, the identifier of a motion from the library (`motion` in `request`); with both, with neither, with a motion that does not exist or is not `ready`, or with a `start` that leaves fewer than 33 frames, it is `422`. `422` also for a setting the tool does not accept (it says which), a file that is not a readable video, an image that is missing or extra; `503` with the reason if the tool cannot be run now. In no case is anything created. If another heavy process is running, the response carries the same warning as any run and the edit waits its turn.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "multipart/form-data": {
                        /** @description The request JSON (`VideoEditRequest`). */
                        request: string;
                        /**
                         * Format: binary
                         * @description The video: mp4, mov, webm or mkv. Required except in `motion-control` with `motion`.
                         */
                        video?: string;
                        /**
                         * Format: binary
                         * @description The reference image: png, jpg, jpeg or webp. Only if the tool takes one (`motion-control`), and then required.
                         */
                        image?: string;
                    };
                };
            };
            responses: {
                /** @description Edit accepted. */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["VideoEdit"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                422: components["responses"]["Unprocessable"];
                /** @description The tool cannot be run now (`unavailable`, with the reason). */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/video-edits/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * State, progress and result of a video edit
         * @description When done, `result` carries the video's address (a read-only artifact) and what it has. If it failed, `error` says why and no partial result is offered.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The edit. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["VideoEdit"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        post?: never;
        /** Cancels, if running, and deletes an edit with its files and its project */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Deleted. */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/motions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Lists the motion library
         * @description Short videos of people moving that `motion-control` can apply to any image. The library starts empty: the server ships no videos.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The motions. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Motion"][];
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        /**
         * Adds a motion from a video
         * @description Takes a video (`multipart/form-data`: the `request` part with optional `title` and `tags` and the `video` part, or in `request` the `source` address of a YouTube video (an `https` address, the only kind the sources of a project take too; anything else is `422`)), answers `202` with the motion in the `processing` state and prepares it in the background: its control frames (people's depth with the background in black, at 16 fps and 832x480) and its preview. It lasts at most 30 seconds and has at least one person; otherwise, `422` with the reason and nothing is saved.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "multipart/form-data": {
                        /** @description The request JSON (`MotionRequest`). */
                        request: string;
                        /**
                         * Format: binary
                         * @description The video; not needed if `request` carries `source`.
                         */
                        video?: string;
                    };
                };
            };
            responses: {
                /** @description Motion accepted, being prepared. */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Motion"];
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                422: components["responses"]["Unprocessable"];
                /** @description The vision service is not available (`unavailable`, with the reason). */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/motions/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** A motion from the library */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The motion. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Motion"];
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        post?: never;
        /** Removes a motion from the library */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Deleted. */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/motions/{id}/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * A motion's preview
         * @description Accepts `?ticket=` in place of the Authorization header, so a `<video>` element can play it.
         */
        get: {
            parameters: {
                query?: {
                    /** @description Ticket from `POST /api/auth/ticket`, for clients that cannot send headers. */
                    ticket?: components["parameters"]["Ticket"];
                };
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description A small video with the source image. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "video/mp4": string;
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/models/availability": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Which model tasks can run now
         * @description For each routed task (`assistant`, `describe_image`, `describe_video`, `quality`, `motion_graphics`) it resolves the provider and says whether it can be used now: `{available, provider: {id, name, type}, reason?}`. `reason`: `unreachable` (no answer in 3 s), `no_models` (an Ollama with no chat model; embedding and reranker models do not count), `no_vision_model` (no model that reads images), `no_model` (an OpenAI-compatible provider without the task's model), `no_consent` (remote not accepted: it is not contacted) or `key_rejected` (its model list answers 401 or 403). It sends nothing from the user and loads no model. It is cached for 30 s on the server and discarded when settings, providers, keys or routing change. The interface hides the controls of an unavailable task.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Availability per task. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            tasks?: {
                                [key: string]: {
                                    available?: boolean;
                                    provider?: {
                                        id?: string;
                                        name?: string;
                                        /** @enum {string} */
                                        type?: "ollama" | "openai";
                                    };
                                    /** @enum {string} */
                                    reason?: "unreachable" | "no_models" | "no_vision_model" | "no_model" | "no_consent" | "key_rejected";
                                };
                            };
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/describe": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Describes an image or a video uploaded to `sources/` and returns the prompt that would draw it
         * @description Reads the file with a local Ollama vision model (nothing leaves the machine) and writes a prompt in English. For a video, 4 to 8 frames are extracted, described and merged into an image prompt and a motion prompt. The file is only read: it reaches no generator. Before returning anything the age of each person is checked (every frame, in a video): if anyone is or looks under 18, or it cannot be confirmed, the response is `describe_minor`, there is no prompt and the file is deleted from `sources/`. The application adds no further filters: if it is the model itself that refuses or does not describe, the response is `describe_refused` and the message names the other installed vision models. It is rejected while an execution is queued or active.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        project: string;
                        /** @description Name of an image (png, jpg, webp) or a video (mp4, mov, webm, mkv, avi) among the project's sources. */
                        source: string;
                        /** @description An installed vision model (see `GET /api/describe/models`); empty = `gemma4:26b`, or the first installed. */
                        model?: string;
                        /** @description Without `model`: use the most detailed model, if there is one (only the private edition has one; it is ignored in the public one). */
                        detail?: boolean;
                        /** @description Videos only: describe one shot per scene (`shots`) instead of a single prompt. Cuts are found with ffmpeg; shots shorter than 1.5 s are merged with the previous one and there are at most 12. An image ignores it. */
                        split?: boolean;
                        /** @description A provider that replaces the task's routing for this call only (the retry after a refusal); if remote it requires consent. There is never an automatic switch. */
                        provider?: string;
                    };
                };
            };
            responses: {
                /** @description Description. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            prompt?: string;
                            /** @description Videos only: motion prompt of about 25 words (may be missing). */
                            motion?: string;
                            /** @description The model that described. */
                            model?: string;
                            /** @enum {string} */
                            kind?: "image" | "video";
                            frames?: number;
                            /** @description The id of the provider that described. */
                            provider?: string;
                            /** @description Only with `split` on a video: one element per shot, in order (a video without cuts gives one that covers everything). `prompt` is the first one's. */
                            shots?: {
                                /** @description Second at which the shot starts. */
                                start?: number;
                                end?: number;
                                prompt?: string;
                                /** @description Motion of about 25 words (may be missing). */
                                motion?: string;
                            }[];
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
                /** @description `describe_refused` (the model refused or did not describe; the error body adds `provider` and `alternatives: [{provider, name, model}]` with other models of the same provider and the other providers with a vision model, to retry with `provider`) or `describe_minor` (a person is or looks under 18, or their age could not be confirmed; the file was deleted). */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["Error"];
                    };
                };
                /** @description Ollama is not responding, the model is not installed or there is not enough memory. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/describe/models": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Vision models installed in Ollama that the describe step can use
         * @description `default` is the one used without `model` (`gemma4:26b`, or the first installed); `detail` is the most detailed model if installed (private edition only), empty if not. `fits` says whether it passes the memory rule (its size times 1.3 plus 4 GiB) with the memory free now.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Vision models, from smallest to largest. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            default?: string;
                            detail?: string;
                            models?: {
                                name?: string;
                                /** Format: int64 */
                                size_bytes?: number;
                                fits?: boolean;
                            }[];
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
                /** @description Ollama is not responding. */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/assets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Installed files by type (models, voices, LoRA, video, music, adapters)
         * @description The `adapter` type (music LoRA adapters, in `models/music/adapters/`) lists each adapter once, whether it is a `.safetensors` file or a folder with `adapter_model.safetensors` and `adapter_config.json`, with the total size of its files.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Inventory. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            kinds?: {
                                kind?: string;
                                dir?: string;
                                extensions?: string[];
                                note?: string;
                                assets?: {
                                    name?: string;
                                    size?: number;
                                }[];
                            }[];
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/assets/catalog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Recommended catalog, with whether each entry is installed
         * @description Adapter entries (`kind: adapter`) name their files as `<folder>/<file>` (a single level). Music entries (`kind: music`) are packages of four files with `role` `lm`, `text_encoder`, `dit` and `vae` that are installed in `models/music/`; the supporting ones are shared between packages.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Catalog entries. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            entries?: {
                                [key: string]: unknown;
                            }[];
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/assets/{kind}/{name}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Deletes an installed file */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    kind: "model" | "voice" | "lora" | "video" | "music" | "adapter";
                    name: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Deleted. */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/civitai/resolve": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Files of a Civitai model version */
        get: {
            parameters: {
                query: {
                    /** @description URL of the model on Civitai. */
                    ref: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Model, version and available files. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            [key: string]: unknown;
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                422: components["responses"]["Unprocessable"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/tokens/{service}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * Saves the download key for Hugging Face or Civitai
         * @description The key is never returned in any response.
         */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    service: components["parameters"]["TokenService"];
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        token: string;
                    };
                };
            };
            responses: {
                /** @description Saved. */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
            };
        };
        post?: never;
        /**
         * Deletes the saved key
         * @description 409 if there is no file and the key comes from an environment variable.
         */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    service: components["parameters"]["TokenService"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Deleted (also if there was none). */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                409: components["responses"]["Conflict"];
            };
        };
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/downloads": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Recent downloads, newest first */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description List of downloads. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            downloads?: components["schemas"]["Download"][];
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
            };
        };
        put?: never;
        /** Queues a download (direct URL, Hugging Face or catalog entry) */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        kind?: "model" | "voice" | "lora" | "video" | "music" | "adapter";
                        url?: string;
                        repo?: string;
                        file?: string;
                        /** @default main */
                        revision?: string;
                        /** @description Id of a catalog entry. */
                        id?: string;
                        name?: string;
                        overwrite?: boolean;
                    };
                };
            };
            responses: {
                /** @description Download queued. */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            download?: components["schemas"]["Download"];
                        };
                    };
                };
                400: components["responses"]["BadRequest"];
                401: components["responses"]["Unauthorized"];
                409: components["responses"]["Conflict"];
                422: components["responses"]["Unprocessable"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/downloads/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** A download */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Download identifier. */
                    id: components["parameters"]["DownloadId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description The download. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            download?: components["schemas"]["Download"];
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/downloads/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cancels a queued or in-progress download */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    /** @description Download identifier. */
                    id: components["parameters"]["DownloadId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Download cancelled. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            download?: components["schemas"]["Download"];
                        };
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
                409: components["responses"]["Conflict"];
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/downloads/{id}/events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Live download progress (SSE)
         * @description For `EventSource`, not for a one-off request. Events
         *     `download-state`, `progress` and `stream-end`. With a token use `?ticket=`.
         */
        get: {
            parameters: {
                query?: {
                    /** @description Ticket from `POST /api/auth/ticket`, for clients that cannot send headers. */
                    ticket?: components["parameters"]["Ticket"];
                };
                header?: never;
                path: {
                    /** @description Download identifier. */
                    id: components["parameters"]["DownloadId"];
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Event stream. */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "text/event-stream": string;
                    };
                };
                401: components["responses"]["Unauthorized"];
                404: components["responses"]["NotFound"];
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        PromptPreset: {
            /** @description Given by the server. */
            id?: string;
            /** @enum {string} */
            kind: "image" | "video" | "motion" | "music" | "animation";
            title?: string;
            prompt: string;
            negative?: string;
            /** @description Lower case, at most 20. */
            tags?: string[];
            engine?: string;
            language?: string;
            /** @description Where it comes from; required in a bundle (`user` for the person's own). */
            source?: string;
            /** @description Its id at the source; with `kind` and `source` it says a preset was already imported. */
            source_id?: string;
            /** @description Required in a bundle. */
            licence?: string;
            nsfw?: boolean;
            /** @description The person's own; only these can be deleted. */
            own?: boolean;
            /** Format: date-time */
            created_at?: string;
        };
        /** @description All fields are optional. An empty body, or an empty `address`, removes the tool (and its key). Without `user`, no user is saved. With `secret` absent the saved key is kept if the address and the user do not change; with `secret` (even if empty) what arrives is saved. */
        MonitoringRequest: {
            address?: string;
            user?: string;
            /** @description Omit to keep the saved one. */
            secret?: string;
        };
        MonitoringTools: {
            tools: {
                /** @enum {string} */
                id: "grafana" | "prometheus" | "loki" | "redis";
                address?: string;
                user?: string;
                secret_set: boolean;
            }[];
        };
        DatabaseRequest: {
            /** @enum {string} */
            driver: "sqlite" | "mysql" | "postgres";
            host?: string;
            port?: number;
            name?: string;
            user?: string;
            /** @description Omit to keep the saved one. */
            password?: string;
            /** @description Name of this server in the history (empty: the machine's own). PUT only. */
            server_name?: string;
        };
        DatabaseView: {
            driver: string;
            host?: string;
            port?: number;
            name?: string;
            user?: string;
            password_set: boolean;
        };
        DatabaseSettings: {
            saved: components["schemas"]["DatabaseView"];
            active: components["schemas"]["DatabaseView"];
            restart_required: boolean;
            server_name: string;
            servers: string[];
        };
        SoundTag: {
            tag: string;
            /** @description Cosine similarity with the sound (not a probability). */
            score: number;
        };
        LibraryPlaylist: {
            /**
             * @description Lowercase letters, digits and hyphens.
             * @example for-running
             */
            id: string;
            name: string;
            /** @description Song keys (`project/track/seed`) in order. */
            songs: string[];
        };
        /** @description How a finding is fixed. `trim` requires `seconds`, `reseed` requires `seed`, `motion_prompt` requires `motion_prompt` and `prompt` requires `prompt`. */
        Fix: {
            /** @enum {string} */
            kind: "trim" | "reseed" | "motion_prompt" | "prompt";
            params?: {
                [key: string]: unknown;
            };
        };
        Review: {
            id: string;
            project: string;
            /** @enum {string} */
            state: "analyzing" | "ready" | "failed";
            /** @description Vision model used; empty if it was only measured. */
            model?: string;
            /** @description Clips being analysed. */
            total: number;
            /** @description Clips already analysed. */
            done: number;
            notes?: string;
            error?: string;
            /** Format: date-time */
            created_at: string;
            /** Format: date-time */
            finished_at?: string;
        };
        ReviewSummary: components["schemas"]["Review"] & {
            findings?: number;
            pending?: number;
        };
        Finding: {
            id: string;
            review_id: string;
            scene: string;
            /** @description deformation, color_drift, blur or observation (the user's own). */
            kind: string;
            /** @enum {string} */
            source: "auto" | "manual";
            from_seconds: number;
            severity: number;
            description: string;
            has_frame: boolean;
            fix: components["schemas"]["Fix"];
            /** @enum {string} */
            status: "pending" | "running" | "done" | "failed" | "skipped";
            run_id?: string;
            message?: string;
            /** Format: date-time */
            created_at: string;
        };
        Provider: {
            id: string;
            name: string;
            /** @enum {string} */
            type: "ollama" | "openai";
            base_url: string;
            text_model: string;
            vision_model: string;
            builtin: boolean;
            remote: boolean;
            /** @description Whether a key is saved; the key is never returned. */
            key_set: boolean;
            /** @description `true` when this edition does not use the provider's address (another edition saved it): no task runs on it. */
            blocked?: boolean;
        };
        ProviderInput: {
            /** @description On create only; lowercase letters, digits and hyphens, up to 40. Without it, it is derived from the name. */
            id?: string;
            name: string;
            /** @enum {string} */
            type: "ollama" | "openai";
            base_url: string;
            text_model?: string;
            vision_model?: string;
            /** @description API key (up to 500 characters, no spaces). Absent: unchanged; empty: remove it. */
            key?: string;
        };
        Routing: {
            routing: {
                [key: string]: {
                    provider: string;
                    name: string;
                    remote: boolean;
                    consented: boolean;
                    model: string;
                };
            };
            max_calls: number;
        };
        /** @description The server settings in use. All the blocks always arrive. */
        SettingsResponse: {
            ollama: components["schemas"]["OllamaSetting"];
            heartmula: components["schemas"]["MusicServiceSetting"];
            diffrhythm2: components["schemas"]["MusicServiceSetting"];
            /** @description Remote model provider. */
            remote: {
                /** @description Cap on calls to a remote provider. */
                max_calls: number;
            };
            browser: components["schemas"]["BrowserSetting"];
            motion_model: components["schemas"]["MotionModelSetting"];
            /** @description The settings of the music-motion pieces. */
            music_motion: {
                /** @description When true every part draft is graded by the vision model of the `check` task after its previews are drawn (a request's own `review` wins). Off by default. Saved with `PUT /api/settings {music_motion: {review_drafts}}`. */
                review_drafts: boolean;
            };
        };
        OllamaSetting: {
            /** @description The address in use. */
            host: string;
            /** @enum {string} */
            source: "setting" | "env" | "default";
            /** @description `true` when the address is not this machine. */
            remote: boolean;
            /** @description The saved value, or empty. */
            saved: string;
        };
        /** @description Optional external music service (HeartMuLa or DiffRhythm2). The token is never returned: it only says whether there is one. */
        MusicServiceSetting: {
            /** @description The saved address, or empty. */
            saved: string;
            /** @description A token is saved. */
            token_set: boolean;
            /** @description `true` when the address is not this machine: the lyrics and tags leave this computer. */
            remote: boolean;
            /** @description The person agreed to send them to that address (always `true` if it is this machine). */
            consented: boolean;
        };
        /** @description The browser that draws the motion graphics. */
        BrowserSetting: {
            /** @description The saved path, or empty (it is looked up in the PATH). */
            saved: string;
            /** @description There is a browser that can be used now. */
            found: boolean;
            path?: string;
            version?: string;
            /** @description Why none can be used, and how to fix it. */
            error?: string;
        };
        /** @description The model that writes the pages of the motion graphics. */
        MotionModelSetting: {
            /** @description The saved model, or empty. */
            saved: string;
            /** @description The one used if none is saved. */
            default: string;
        };
        Error: {
            error: {
                /** @enum {string} */
                code: "invalid_request" | "validation_failed" | "not_found" | "conflict" | "forbidden" | "internal_error" | "method_not_allowed" | "unauthorized" | "engine_not_running" | "content_not_allowed" | "describe_refused" | "describe_minor" | "unavailable" | "assist_refused" | "consent_required" | "no_model" | "model_not_allowed" | "too_many_calls";
                message: string;
                reason?: string;
                /** @description Who refused the request (with `describe_refused`). */
                provider?: string;
                /** @description What it can be retried with (with `describe_refused`): other vision models of the same provider and other providers that have one. */
                alternatives?: {
                    provider: string;
                    name: string;
                    model: string;
                }[];
            };
        };
        /** @description What is asked for. All fields are optional except that a `prompt` or a start image is needed. Without `option` the default is used; without `duration`, 5 s; without `aspect_ratio`, 16:9; without `quality`, `high`. */
        GenerationRequest: {
            /** @description The text (up to 2000 characters). With a start image it describes the motion. */
            prompt?: string;
            /** @description Identifier from `GET /api/generation/options`. */
            option?: string;
            /** @description Seconds of the scene (each option gives the range). */
            duration?: number;
            /** @enum {string} */
            aspect_ratio?: "16:9" | "9:16" | "1:1" | "4:3" | "3:4";
            /**
             * @description Scales the sides of the image and the clip: half, three quarters, full.
             * @enum {string}
             */
            quality?: "draft" | "normal" | "high";
            /** @description Have the model write the sound (MiniMax H3 and LTX 2.3 only). */
            audio?: boolean;
            /** @description The label the client puts on the generation (like `adult` in a scenes.yaml). With `true` a server that hides adult content rejects it. */
            adult?: boolean;
            /** @description The identifier of another generation of the API whose input files (start image, end image, references) are used without sending them again. `422` if input parts are also sent, if it does not exist or if it kept none. */
            reuse_inputs_of?: string;
            /** @description The name of the dashboard making the request, its own (for example `video-studio`): 1 to 32 lowercase letters, digits or hyphens. Without it, `unknown` applies; if it does not match the pattern, `422` and nothing is created. It is saved in the project's `scenes.yaml` and in the run, and is used to group in the statistics and the metrics. */
            client?: string;
        };
        Generation: {
            id: string;
            /** @description The dashboard that requested it (`unknown` if it named none or if it predates this field). */
            client: string;
            /** @enum {string} */
            state: "queued" | "running" | "done" | "failed";
            /** @description 0 to 100. */
            progress: number;
            request: components["schemas"]["GenerationRequest"];
            run_id: string;
            /** @description How long the clip the engine makes lasts; a longer duration repeats it. */
            clip_seconds: number;
            /** @description Seconds it takes on this machine. */
            estimate?: number;
            /** Format: date-time */
            created_at: string;
            /**
             * Format: int64
             * @description What its files take up on disk (counted here and not in the per-project storage).
             */
            size_bytes: number;
            /** @description The video's address, when done. */
            video?: string;
            /** @description Why it failed. */
            error?: string;
            /** @description The files it used, in the order they were sent: the start image first and then the others. A generation that predates the inputs gives only its start image; with none, the list is empty. */
            inputs: components["schemas"]["GenerationInput"][];
        };
        GenerationInput: {
            /** @enum {string} */
            kind: "start_image" | "end_image" | "reference_image" | "reference_video" | "reference_audio";
            /** @description Its name in the generation project's `sources/`. */
            name: string;
            /** @description Read-only address it is downloaded from (a project artifact, with the same access as the video). */
            address: string;
        };
        MusicMotionCatalog: {
            parts: components["schemas"]["MusicPart"][];
            characters: components["schemas"]["MusicCharacter"][];
            backgrounds: components["schemas"]["MusicBackground"][];
            /** @description `simple`, `medium`, `advanced`. */
            levels: string[];
            /** @description `typographic`, `illustrated`. */
            styles: string[];
            frame_rates: number[];
            /** @description A character's actions, in time with the beat. */
            actions: string[];
            /** @description The typefaces a design can use. */
            fonts: string[];
            /** @description The CSS font stack of each name in `fonts`, as the page of a piece sets it. */
            font_stacks: {
                [key: string]: string;
            };
            /** @description Which names in `fonts` are embedded in the pages as `data:` fonts: the six of the free pack (`inter`, `space-grotesk`, `jetbrains-mono`, `playfair-display`, `bebas-neue`, `fraunces`) and the old names that map to it (`grotesk` to Inter, `mono` to JetBrains Mono, `serif` to Fraunces, `heavy` to Bebas Neue; their old system stack stays as the fallback). `rounded` and `condensed` stay system stacks and are not here. */
            font_files: {
                [key: string]: {
                    family?: string;
                    weights?: number[];
                    /** @description `OFL-1.1` for the whole pack. */
                    licence?: string;
                };
            };
            /** @description `dark`, `light`. */
            modes: string[];
            /** @description What this server's scripts support beyond the base format: `animate` (keyframes on a parameter, see `MusicScriptPiece.animate`) and `layers` (lanes of parts over the pieces, see `MusicScript.layers`). A dashboard checks it before it saves a script that needs it. `svg` is not about scripts: it says `POST /api/assist/svg` exists. `review` says part drafts and pieces can be graded by the vision model (`review` on `POST /part-drafts` and `/scenes`, `POST /pieces/{id}/review`, the setting `music_motion.review_drafts`). `theme` says a design may carry `theme` and `transition_seconds`, the pack of fonts is embedded and the built-in `hud-chrome` and `grain` parts exist. `scene` says scenes written for the verses of a piece exist: `scene` on `POST /part-drafts`, `verse: own`/`hit: own` in a part's manifest, `POST /pieces/{id}/scenes` and `include=scene`/`piece=` on the catalog. */
            features: string[];
        };
        /** @description The last batch of scenes written for the script of a piece (`POST /pieces/{id}/scenes`). */
        MusicSceneBatch: {
            /** @enum {string} */
            state: "writing" | "done" | "cancelled" | "failed";
            /** @description Drafts finished (ready or failed) so far. */
            done: number;
            total: number;
            drafts: {
                script_piece: string;
                /** @description The part draft (`GET /part-drafts/{id}`, with its preview); empty while pending. */
                draft_id?: string;
                /**
                 * @description The draft's own state; `approved` when the draft is gone because it became a part.
                 * @enum {string}
                 */
                state: "pending" | "writing" | "ready" | "failed" | "approved";
                error?: string;
            }[];
            model?: string;
            provider?: string;
            /** @enum {string} */
            brief_mode: "metaphor" | "literal";
            /** @description What every draft of the batch was asked to be reviewed with. */
            review?: {
                min?: number;
                attempts?: number;
            };
            /** Format: date-time */
            started_at: string;
            /** Format: date-time */
            finished_at?: string;
            error?: string;
        };
        /** @description The last review of a whole piece (`POST /pieces/{id}/review`). */
        MusicPieceReview: {
            /** @enum {string} */
            state: "running" | "done" | "failed";
            /** Format: date-time */
            started_at: string;
            /** Format: date-time */
            finished_at?: string;
            model?: string;
            scenes: {
                script_piece: string;
                score: number;
                /** @enum {string} */
                verdict?: "pass" | "weak" | "fail";
                notes: string[];
                error?: string;
            }[];
            /** @description The piece as a whole, from a contact sheet of one frame per scene: whether type, palette and frame are consistent and whether scenes repeat a metaphor. */
            overall?: {
                score?: number;
                notes?: string[];
                /** @description Groups of script pieces that use the same metaphor. */
                repeated?: string[][];
                error?: string;
            };
            error?: string;
        };
        MusicPiecePreview: {
            width: number;
            height: number;
            fps: number;
            scenes: {
                id: string;
                start: number;
                end: number;
                /** @description The page of the piece, wrapped for a sandboxed frame. */
                html: string;
                /** @description The song map cut to the piece, as the renderer gives it to the page. */
                song: Record<string, never>;
            }[];
            replacements: {
                piece: string;
                from: string;
                to: string;
            }[];
        };
        MusicLibraryCharacter: {
            name: string;
            width: number;
            height: number;
            anchor: {
                x: number;
                y: number;
            };
            default_pose: string;
            default_expression: string;
            expressions: string[];
            /** @description Pose name to its SVG. */
            poses: {
                [key: string]: string;
            };
            /** @enum {string} */
            source: "builtin" | "user";
        };
        MusicLibraryBackground: {
            name: string;
            svg: string;
            /** @enum {string} */
            source: "builtin" | "user";
        };
        /** @description A part of the catalog as it is carried to another server or drawn in a browser. */
        MusicUserPart: {
            name: string;
            /** @enum {string} */
            source: "user" | "builtin";
            origin?: components["schemas"]["MusicPartOrigin"];
            /** @description The content of manifest.json (name, description, version, levels, cost_ms, manual, params, and `verse`, `hit` and `scene` when it has them). */
            manifest: Record<string, never>;
            /** @description The content of part.html. */
            fragment: string;
        };
        MusicPart: {
            name: string;
            description: string;
            levels: string[];
            /** @description Milliseconds it costs to draw a frame at 1280x720 (measured). */
            cost_ms: number;
            /** @description Only used if the script names it (the fixed rule does not choose it). */
            manual?: boolean;
            /** @enum {string} */
            source: "builtin" | "user";
            origin?: components["schemas"]["MusicPartOrigin"];
            /**
             * @description Who draws the lyric when this is the main part of a piece: `page` (the default, also when absent) is the page's own layer, `own` is the part itself, which reads `window.__scene.lines`; the page then leaves `#verse` out.
             * @enum {string}
             */
            verse?: "page" | "own";
            /**
             * @description The same for the word hit (`#hit`/`#hitbg`). An extra part cannot declare `own` for either (`PUT /script` refuses it).
             * @enum {string}
             */
            hit?: "page" | "own";
            /** @description Set on a scene written for one script piece of one piece; such parts are listed only with `include=scene` or `piece=`, read back with `GET /parts/{name}`, deleted with their piece and refused as the part of a script piece of another piece (`422`). */
            scene?: {
                piece?: string;
                script_piece?: string;
            };
            params: components["schemas"]["MusicParam"][];
        };
        /** @description Where a part of the user came from: the reference video that inspired it. Kept in `origin.json` beside the part when its draft is approved; absent for the parts that come with the program and for the ones written by hand. */
        MusicPartOrigin: {
            /** @description The reference of the library (it may have been deleted since). */
            reference_id?: string;
            /** @description The title of the reference. */
            title?: string;
            /** @description The address of the video. */
            video?: string;
            /** @description The key frame the draft was inspired by, when it was. */
            frame?: string;
            /** @description True when a learning from a reference proposed the part. */
            learned?: boolean;
            learning_id?: string;
            /** Format: date-time */
            approved_at: string;
        };
        MusicParam: {
            name: string;
            /** @enum {string} */
            type: "string" | "int" | "number" | "bool" | "enum";
            description?: string;
            /** @description The default value written as text (`3`, `true`, `allow`); `type` says how to read it. */
            default: string;
            min?: number;
            max?: number;
            max_length?: number;
            options?: string[];
            /** @description A script may change this parameter over a piece with `animate`. The part reads it on every frame; a parameter written into the page as text is never animatable. */
            animatable?: boolean;
        };
        MusicCharacter: {
            name: string;
            description: string;
            poses: string[];
            expressions: string[];
            /** @enum {string} */
            source: "builtin" | "user";
        };
        MusicBackground: {
            name: string;
            description: string;
            /** @enum {string} */
            source: "builtin" | "user";
        };
        MusicPieceRequest: {
            /** @description The music project that has the song. */
            project: string;
            track_id: string;
            /** @description The song's version (from 0). */
            variant: number;
            /** @enum {string} */
            style?: "typographic" | "illustrated";
            /** @enum {string} */
            level?: "simple" | "medium" | "advanced";
            /** @enum {integer} */
            fps?: 24 | 30 | 60;
            /** @description For example `1280x720`. */
            resolution?: string;
            /** @description The name of the dashboard making the request (as in `GenerationRequest`). */
            client?: string;
            design?: components["schemas"]["MusicDesign"];
            /** @description Identifier of a style (`/api/music-motion/presets`): the piece's design starts as the style's (that of `design`, if sent, takes precedence) and the fixed rule uses its parts and its rhythm. `422` if the style does not exist (nothing is created). Without `preset` the piece is made as usual. */
            preset?: string;
            /** @description The person's direction for the video: it is kept with the piece and read by the proposals that send no prompt of their own. `422` above 2000 characters. */
            prompt?: string;
            /** @description Hear when each word is sung (Whisper, on the CPU) instead of distributing the lyrics across the sections; `false` by default. If it cannot be done (no Whisper, no memory, a run in progress) the piece is created anyway with estimated timings and `words_note` says why. */
            transcribe?: boolean;
        };
        PartDraft: {
            id: string;
            /** @enum {string} */
            state: "writing" | "ready" | "failed";
            /** @description What the part has to do. */
            request: string;
            /** @description Whether it was requested with an image. */
            with_picture: boolean;
            /** @description Where the image came from: `upload` or `reference:<id>/<frame>`; absent without an image. */
            source?: string;
            /** @description The look of the image, written by the vision model. */
            description?: string;
            /** @description Attempts the assistant made on this job (up to 3). */
            attempts: number;
            /** @description The part's name, when it is `ready` (for a scene, decided by the server as soon as it starts). */
            name?: string;
            /** @description Set on a draft asked for with `scene`. */
            scene?: {
                piece?: string;
                script_piece?: string;
            };
            /** @description The idea the scene was asked for with. */
            brief?: string;
            /** @description What the request asked of the review (absent: none); a retry keeps it. */
            review_ask?: {
                min?: number;
                attempts?: number;
            };
            review?: components["schemas"]["PartDraftReview"];
            /** @description What failed on the last attempt. */
            problems: string[];
            /** @description What the checks let pass but the person should know, on a `ready` draft: an `{{asset:name}}` slot the theme of the design has no drawing for (the slot is empty). */
            warnings?: string[];
            /** @description Why it is `failed`. */
            error?: string;
            /** Format: date-time */
            created_at: string;
            /** @description Names of the preview frames. */
            preview: string[];
            /** @description The text of manifest.json (in the read of one). */
            manifest?: string;
            /** @description The text of part.html (in the read of one). */
            fragment?: string;
            /**
             * @description `learned` when a learning from a reference proposed it; absent when it was asked for by hand.
             * @enum {string}
             */
            origin?: "learned";
            /** @description The learning that proposed it (with `origin` `learned`). */
            learning_id?: string;
            /** @description The model the person chose to write it; absent when the routing's own was used. A retry keeps it. */
            model?: string;
            /** @description The saved provider the person chose to write it instead of the routing; absent when the routing's own was used. A retry keeps it. */
            provider?: string;
            /** @description The name of the part whose text the assistant is changing (a draft asked for with `request`, `manifest` and `fragment`); that name may be kept. */
            replaces?: string;
            /** @description The reference whose video inspired it (it may have been deleted since). */
            reference_id?: string;
            /** @description The title of that reference. */
            video_title?: string;
            /** @description The address of that video. */
            video?: string;
        };
        /** @description The grade of a draft by the vision model against the scene rubric (`docs/MUSIC_MODE_MOTION.md` prints it; the writer reads the same one). The score is worked out from a 0 to 2 score for each of six criteria, not taken from the model. */
        PartDraftReview: {
            score?: number;
            /**
             * @description `pass` from 7, `weak` 5 and 6, `fail` under 5; absent when `error` is set.
             * @enum {string}
             */
            verdict?: "pass" | "weak" | "fail";
            /** @description Concrete fixes, up to five. */
            notes?: string[];
            model?: string;
            /** @description Every version that was reviewed, in order, when the draft was rewritten from its review: the climb. The version left `ready` is the best one. */
            attempts?: {
                score?: number;
                verdict?: string;
                notes?: string[];
            }[];
            /** @description Why there is no grade (no vision model, it failed or answered nothing readable); the draft is still `ready`. */
            error?: string;
        };
        PartDraftRequest: {
            /** @description Between 1 and 500 characters. Required, except with `scene` (then optional: it is the idea when there is no `scene.brief`). */
            request?: string;
            /** @description Asks for the draft to be graded by the vision model of the `check` task after its previews are drawn: `true` (a review), `false` (none, even if the setting `music_motion.review_drafts` is on) or `{min, attempts}`: with `min` (1 to 10) a draft that scores under it is rewritten with the reviewer's notes as the problem, up to `attempts` times (2 by default, at most 3); the best version is left `ready`. A form field `review` (and `review_min`, `review_attempts`) in multipart. Without a vision model, a consent or a provider problem on the `check` route it is refused before anything is created (`503`, `400 consent_required`...); `422` for `min` or `attempts` out of range. */
            review?: boolean | {
                min?: number;
                attempts?: number;
            };
            /** @description Asks for a scene written for one script piece of one piece (JSON body only): the server builds the input from the saved piece. */
            scene?: {
                /** @description A music-motion piece id. */
                piece: string;
                /** @description The id of a script piece of that piece's script (ids are kept when the script is saved). */
                script_piece: string;
                /** @description The idea or metaphor to draw; empty lets the writer choose. */
                brief?: string;
            };
            /** @description A reference from the library, to use one of its frames. */
            reference_id?: string;
            /** @description One of that reference's `analysis.frames`. */
            frame?: string;
            /** @description With `fragment`, instead of `request`: makes the draft from these files with no assistant. */
            manifest?: string;
            fragment?: string;
            /** @description An installed model (see `GET /api/assist/models`) that writes the part; `422` if it is not installed. Without it, the routing's own. */
            model?: string;
            /** @description The id of a saved provider (`GET /api/providers`) that writes the part instead of the routing, for this draft only; `model` then names one of its models. `400 consent_required` if it is remote and not consented, `400` if unknown. */
            provider?: string;
        };
        PartDraftPut: {
            manifest: string;
            fragment: string;
        };
        MotionColour: {
            /** @description Color as #rrggbb. */
            hex: string;
            /** @description Share of the pixels it covers, 0 to 1. */
            share: number;
        };
        MotionAnalysis: {
            /** @description Seconds. */
            duration: number;
            fps: number;
            width: number;
            height: number;
            /** @description Names of the key frames (between 12 and 24 when possible), in order. */
            frames: string[];
            /** @description The five dominant colors of the whole video. */
            colours: components["schemas"]["MotionColour"][];
            /** @description Those of each third of the video. */
            thirds: components["schemas"]["MotionColour"][][];
            /** @description Shot changes. */
            cuts: number;
            /** @description Mean duration of a shot, in seconds. */
            mean_shot: number;
            /** @description Estimated tempo of the audio (bpm); absent without sound or without a clear beat. */
            tempo?: number;
            /** @description Estimated key of the audio; absent without sound or without a clear key. */
            key?: string;
            /** @description The look of the video, written by the vision model; absent if there is no model. */
            description?: string;
            /** @description Why there is no description. */
            description_note?: string;
        };
        MotionReference: {
            id: string;
            title: string;
            notes?: string;
            tags: string[];
            /** @description The YouTube address; absent on an uploaded video. */
            source?: string;
            /** @enum {string} */
            state: "analysing" | "ready" | "failed";
            /** @description The reason when `state` is `failed`. */
            error?: string;
            /** Format: date-time */
            created_at: string;
            analysis?: components["schemas"]["MotionAnalysis"];
        };
        MotionReferenceRequest: {
            /** @description Address of a YouTube video. */
            url?: string;
            /** @description Up to 120 characters; by default the video's title. */
            title?: string;
            /** @description Up to 2000 characters. */
            notes?: string;
            /** @description Up to 10 tags of up to 40 characters. */
            tags?: string[];
        };
        MotionReferencePatch: {
            title?: string;
            notes?: string;
            tags?: string[];
        };
        MotionPreset: {
            id: string;
            name: string;
            /** @description The reference it came from (it may no longer exist). */
            reference_id?: string;
            /** Format: date-time */
            created_at: string;
            design: components["schemas"]["MusicDesign"];
            /** @description How long a script piece lasts, in seconds (between 2 and 15). */
            rhythm: number;
            /** @description Catalog parts that suit it; empty means all the usual ones. */
            parts: string[];
            /** @description What had to be changed in the video's colors for the design to be valid. */
            adjustments: string[];
            /**
             * @description `learned` when a learning from a reference kept it; absent when it was made by hand.
             * @enum {string}
             */
            origin?: "learned";
        };
        LearnRequest: {
            /**
             * @description How far from what exists a proposal has to be to count as new. `normal` by default.
             * @enum {string}
             */
            strictness?: "low" | "normal" | "high";
        };
        Learning: {
            id: string;
            reference_id: string;
            /** @enum {string} */
            state: "running" | "ready" | "failed";
            /** @description Why it is `failed`. */
            reason?: string;
            /** @enum {string} */
            strictness: "low" | "normal" | "high";
            /** Format: date-time */
            created_at: string;
            /** Format: date-time */
            finished_at?: string;
            /** @description The styles it kept (they are in `GET /api/music-motion/presets`). */
            styles: components["schemas"]["LearnedItem"][];
            /** @description The drafts of parts it made (they are in `GET /api/music-motion/part-drafts` until approved). */
            part_drafts: components["schemas"]["LearnedItem"][];
            /** @description What it did not make because it is too similar to what exists. */
            discarded: components["schemas"]["LearnDiscarded"][];
            /** @description What it could not do and why (what is missing). */
            skipped: components["schemas"]["LearnSkipped"][];
        };
        LearnedItem: {
            /** @description The id of the style or of the draft. */
            id: string;
            name: string;
            novel: boolean;
            similar_to?: components["schemas"]["LearnSimilar"];
            /** @description `ready` for a style; the state of the draft (`writing`, `ready`, `failed`) for a part; `gone` when it no longer exists. */
            state: string;
            /** @description Why a draft is `failed`. */
            reason?: string;
        };
        LearnSimilar: {
            /**
             * @description A style, a part of the catalog or a draft.
             * @enum {string}
             */
            kind: "style" | "part" | "draft";
            id?: string;
            name: string;
            /** @description From 0 (the same) to 1 (nothing in common). */
            distance: number;
            reason: string;
        };
        LearnDiscarded: {
            /** @enum {string} */
            kind: "style" | "part";
            name: string;
            /** @description The sentence of a part idea. */
            idea?: string;
            /** @description Always false here. */
            novel: boolean;
            similar_to: components["schemas"]["LearnSimilar"];
            reason: string;
        };
        LearnSkipped: {
            /** @description `style`, `parts` or `part <name>`. */
            what: string;
            reason: string;
        };
        MotionPresetRequest: {
            reference_id?: string;
            /** @description By default, the reference's title. */
            name?: string;
            /** @description Changes, for this call only, the assistant provider that chooses the parts. */
            provider?: string;
            /** @description Without `reference_id`: the design of the style (validated as a whole design). */
            design?: components["schemas"]["MusicDesign"];
            /** @description Without `reference_id`: how long a piece lasts, in seconds (2 to 15). */
            rhythm?: number;
            /** @description Without `reference_id`: catalog parts, without repeats, at most 8. */
            parts?: string[];
        };
        MotionPresetPut: {
            name: string;
            design: components["schemas"]["MusicDesign"];
            rhythm: number;
            parts: string[];
        };
        MusicPiece: {
            id: string;
            /** @enum {string} */
            state: "draft" | "queued" | "running" | "done" | "failed";
            /** @description 0 to 100. */
            progress: number;
            title?: string;
            source: {
                project: string;
                track_id: string;
                variant: number;
            };
            style: string;
            level: string;
            fps: number;
            width: number;
            height: number;
            client: string;
            /** Format: date-time */
            created_at: string;
            run_id?: string;
            estimate?: components["schemas"]["MusicEstimate"];
            /** @description The video's address, when done. */
            video?: string;
            error?: string;
            /** Format: int64 */
            size_bytes: number;
            design?: components["schemas"]["MusicDesignStored"];
            script?: components["schemas"]["MusicScript"];
            /** @description The style the piece started from, if it was made with one (later changes to the style do not touch it). */
            preset?: string;
            /** @enum {string} */
            script_source?: "assistant" | "fallback" | "user";
            /** @description The direction the proposals read when they send none. */
            prompt?: string;
            proposal?: components["schemas"]["MusicProposal"];
            scenes?: components["schemas"]["MusicSceneBatch"];
            review?: components["schemas"]["MusicPieceReview"];
            song_map?: components["schemas"]["SongMap"];
            /** @description Why the words were not heard when they were requested (only in the response that causes it). */
            words_note?: string;
            /** @description The user edited the script and it was kept, but it may need adjusting to the new sections (only in the `transcribe` response). */
            script_warning?: string;
        };
        /** @description The last proposal written in the background (`what: all` or `async: true`). One that was running when the server stopped reads as `failed`. */
        MusicProposal: {
            /**
             * @description `waiting` while a run is queued or active and the assistant needs its memory (up to 15 minutes, then it falls back with the reason); `writing`; `done`; `failed`.
             * @enum {string}
             */
            state: "waiting" | "writing" | "done" | "failed";
            /** @enum {string} */
            what: "design" | "script" | "all";
            model?: string;
            /** @description The provider asked for on the request; absent when the routing's own wrote. */
            provider?: string;
            /** Format: date-time */
            started_at: string;
            /** Format: date-time */
            finished_at?: string;
            /** @enum {string} */
            design_source?: "assistant" | "fallback";
            design_fallback_reason?: string;
            /** @enum {string} */
            script_source?: "assistant" | "fallback";
            script_fallback_reason?: string;
            error?: string;
        };
        MusicEstimate: {
            /** @description Forecast of how long the drawing takes on this machine. */
            seconds: number;
            /** @description Always `true`: it is a forecast, not a promise. */
            estimate: boolean;
            frames: number;
            /** @description Whether it was scaled with how long the previous drawings took. */
            corrected: boolean;
            factor: number;
        };
        MusicDesign: {
            /** @description Dark hexadecimal color: the background of a dark section and the text of a light one. */
            dark: string;
            /** @description Light hexadecimal color. */
            light: string;
            /** @description Paints each verse's keyword; minimum 3:1 contrast with the background of the modes used. */
            accent: string;
            /** @description Typeface of the large words (one of the catalog's `fonts`). */
            display: string;
            body: string;
            /** @enum {string} */
            default_mode: "dark" | "light";
            /** @description The mode of each section tag, in lowercase. */
            modes?: {
                [key: string]: "dark" | "light";
            };
            /** @description The visual idea each scene returns to (up to 200 characters). */
            concept: string;
            /**
             * @description How the verse is marked as it is sung: `plain` (the default and if missing: the words appear and the key one is in the accent color), `highlight` (the word being sung gets a background in the accent color and stays marked), `karaoke` (those already sung switch to the accent color) or `glow` (each word in the text color with a soft glow and a halo, no background).
             * @enum {string}
             */
            verse_style?: "plain" | "highlight" | "karaoke" | "glow";
            /**
             * @description What the word hit looks like: `plain` (the default and if missing), `metal` (metallic letters with a shine that crosses them) or `glow` (letters in the accent color with light around them); in `metal` and `glow` the letters enter one after another.
             * @enum {string}
             */
            hit_style?: "plain" | "metal" | "glow";
            theme?: components["schemas"]["MusicTheme"];
            /** @description The crossfade between the pieces of the script, in seconds (0, the default and if missing: hard cuts). A script piece may set its own (`MusicScriptPiece.transition_seconds`, the join into that piece). The video dissolves for that long on every join and each piece is drawn that long more, so the pieces still land on the song; the pages are not affected. Advice: 0 on a piece that lands on a word hit, 0.2 to 0.4 elsewhere. */
            transition_seconds?: number;
        };
        /** @description What a piece shares across its pages (`design.theme`, a server that has it lists `theme` in the catalog's `features`). It is injected in every page of the render and of the preview, so both draw the same. */
        MusicTheme: {
            /** @description A stylesheet injected after the page's own one: it may restyle `#verse` and `#hit`, define the glow and the type scale and add `@font-face` from `data:` URLs. Refused with `422 design.theme.css: ...` when it has `@import`, a `url(` that is not `data:`, `expression(`, `behavior:`, `javascript:` or `<`. */
            css?: string;
            /** @description Small SVG drawings by name (`^[a-z][a-z0-9_]{0,31}$`; no script, foreignObject, event handler or outside reference). A part reads `window.__theme.assets[name]` or places one with the slot `{{asset:name}}` in its fragment (an unknown name leaves the slot empty and a draft warns of it). */
            assets?: {
                [key: string]: string;
            };
            /** @description Four corner labels (up to 40 characters each) the `hud-chrome` part draws; a script piece's design override may replace them (`MusicDesignOverride.hud`). */
            hud?: {
                tl?: string;
                tr?: string;
                bl?: string;
                br?: string;
            };
        };
        MusicThemeHud: {
            tl?: string;
            tr?: string;
            bl?: string;
            br?: string;
        };
        MusicDesignStored: {
            design: components["schemas"]["MusicDesign"];
            /** @enum {string} */
            source: "assistant" | "fallback" | "user";
            /** @description Why the design is a fallback; absent otherwise. */
            fallback_reason?: string;
            /** @description Whether the user set it: a new proposal does not overwrite it unless asked to. */
            edited: boolean;
        };
        MusicScript: {
            /** @enum {integer} */
            version: 1;
            pieces: components["schemas"]["MusicScriptPiece"][];
            /**
             * @description Lanes of parts drawn over the sequence of pieces, in this order (the last on top, over the parts of the pieces and under the verse and the word hit).
             *     Each item is drawn in the page of every piece its range touches, and is visible only between its `start` and `end`. A part reads its time as
             *     seconds from the item's `start`, so one that draws from `t` carries on across the cuts (the beat clock of a part is still the piece's own).
             *     Refused with `422`, naming the layer and the item, for a part that is not in the catalog, bad parameters, an empty range or one outside the song,
             *     items of one lane that overlap (they follow one another, in order), a repeated layer id, more than 4 layers or 32 items in a layer, and a piece whose
             *     page would draw the same part twice (as its main part, an extra or another item) or more than 8 parts. A script without `layers` is drawn as always.
             */
            layers?: components["schemas"]["MusicLayer"][];
        };
        MusicLayer: {
            /** @description Lower case letters, digits and dashes, up to 24 characters; unique in the script. */
            id: string;
            items: components["schemas"]["MusicLayerItem"][];
        };
        MusicLayerItem: {
            part: string;
            params?: {
                [key: string]: unknown;
            };
            /** @description Song seconds. */
            start: number;
            /** @description Song seconds, after `start` and not after the end of the song. */
            end: number;
            animate?: components["schemas"]["MusicAnimate"];
        };
        MusicScriptPiece: {
            id: string;
            start: number;
            end: number;
            section?: string;
            part: string;
            params?: {
                [key: string]: unknown;
            };
            animate?: components["schemas"]["MusicAnimate"];
            /** @enum {string} */
            mode?: "dark" | "light";
            /** @description The crossfade into this piece from the one before (0 is a cut); without it, the design's `transition_seconds`. Ignored on the first piece. */
            transition_seconds?: number;
            lines?: components["schemas"]["MusicScriptLine"][];
            hit?: components["schemas"]["MusicScriptHit"];
            stage?: components["schemas"]["MusicStage"];
            /** @description Extra parts drawn alongside the main one, on top and in this order (up to three, without repeating any part of the piece): for example a year bar that stays while the main screen changes. */
            with?: components["schemas"]["MusicPartRef"][];
            design?: components["schemas"]["MusicDesignOverride"];
        };
        MusicPartRef: {
            part: string;
            params?: {
                [key: string]: unknown;
            };
            animate?: components["schemas"]["MusicAnimate"];
        };
        MusicKeyframe: {
            /** @description Seconds from the start of the piece. */
            t: number;
            /** @description A value the parameter accepts as a static one. */
            value: unknown;
            /**
             * @description How the value travels from this keyframe to the next.
             * @default linear
             * @enum {string}
             */
            ease: "linear" | "in" | "out" | "in-out" | "step";
        };
        /**
         * @description Parameters that change over the piece: a parameter name (of a part whose manifest marks it `animatable`) to its keyframes, with `t` strictly
         *     increasing inside the piece. Between two keyframes a number is interpolated with the ease of the earlier one (`linear`; `in` and `out` are
         *     cubic; `in-out`; `step` holds), integer parameters are rounded; any value that is not a number is held until the next keyframe. Before the
         *     first keyframe and after the last the value is the nearest one. Refused with `422`, naming the piece and the parameter, for a parameter that
         *     is not animatable, no keyframe, `t` outside the piece or not increasing, an unknown ease, or a value outside the parameter's limits.
         */
        MusicAnimate: {
            [key: string]: components["schemas"]["MusicKeyframe"][];
        };
        /** @description Design fields that this piece overrides for itself (another palette for an era). The result is validated as a whole design and, if it is not valid, the script is rejected naming the piece and the field. Without it, the piece uses the song's design. */
        MusicDesignOverride: {
            dark?: string;
            light?: string;
            accent?: string;
            display?: string;
            body?: string;
            /** @enum {string} */
            verse_style?: "plain" | "highlight" | "karaoke" | "glow";
            /** @enum {string} */
            hit_style?: "plain" | "metal" | "glow";
            /** @description Replaces the theme's HUD texts for this piece alone. */
            hud?: components["schemas"]["MusicThemeHud"];
        };
        MusicScriptLine: {
            /** @description The verse number among the map's words; with it the text and timings come from the map. */
            line?: number;
            text?: string;
            start?: number;
            end?: number;
            /** @description A word of the verse. */
            keyword?: string;
        };
        MusicScriptHit: {
            word: string;
            /** @description Second of the song. */
            at: number;
            length: number;
        };
        MusicStage: {
            background?: string;
            characters?: components["schemas"]["MusicStageCharacter"][];
        };
        MusicStageCharacter: {
            character: string;
            pose?: string;
            expression?: string;
            action?: string;
            /** @description Percentage of the frame width where the anchor goes. */
            x: number;
            /** @description Percentage of the height, counted from the top. */
            y: number;
            /** @description Character height as a percentage of the frame height. */
            size: number;
        };
        SongMap: {
            version: number;
            audio_key?: string;
            duration: number;
            bpm: number;
            beats: number[];
            beat_base: number;
            /** @description Whether it was found where the beat falls; if not, the grid starts at 0. */
            grid_anchored: boolean;
            sections: {
                tag: string;
                start: number;
                end: number;
            }[];
            words: {
                text: string;
                start: number;
                end: number;
                line: number;
            }[];
            /** @description The word timings were distributed across the sections instead of being heard. */
            words_estimated?: boolean;
            loudness_hop: number;
            loudness: number[];
        };
        MusicProposeRequest: {
            /**
             * @description `all` writes the design and then the script, from the same prompt and model, in the background (`202`).
             * @enum {string}
             */
            what: "design" | "script" | "all";
            /** @description The id of a saved provider (`GET /api/providers`) that writes this proposal instead of the `motion_graphics` routing, for this call only (the routing is not written); `model` then names a model of that provider. A remote one needs consent (`400 consent_required`, until `POST /api/providers/{id}/acknowledge`); an unknown one is `400` naming it. An asked-for provider that cannot be used is refused, never replaced by the fixed rule; one that is reachable at the start but fails while writing falls back with a `fallback_reason`. */
            provider?: string;
            /** @description The person's direction for the video, free text: the assistant reads it for the design and for the script. It replaces the one kept with the piece; without it the kept one (if any) is used. `422` above 2000 characters. */
            prompt?: string;
            /** @description An installed model of the assistant (`GET /api/assist/models`); `422` naming it when a local Ollama does not have it. Without it the routing decides. */
            model?: string;
            /** @description Answer `202` and work in the background; `what: all` always does. Follow it in `proposal` of `GET /api/music-motion/pieces/{id}`. */
            async?: boolean;
        };
        MusicProposeAnswer: {
            /** @enum {string} */
            what: "design" | "script";
            /** @enum {string} */
            source: "assistant" | "fallback";
            /** @description Why the fixed rule wrote it (present only when `source` is `fallback`): there is no assistant, a run holds the memory, the assistant failed, its last answer was refused, or the wait timed out. It says that the fixed rule does not read the prompt when one was sent. */
            fallback_reason?: string;
            /** @description The model that wrote it, or the one asked for when it failed. */
            model?: string;
            /** @description The provider asked for on the request; absent when the routing's own wrote. */
            provider?: string;
            design?: components["schemas"]["MusicDesignStored"];
            script?: components["schemas"]["MusicScript"];
            replacements?: {
                piece: string;
                from: string;
                to: string;
            }[];
        };
        MusicRenderAnswer: {
            run_id: string;
            estimate: components["schemas"]["MusicEstimate"];
        };
        DurationRange: {
            min: number;
            max: number;
            default: number;
        };
        VideoOption: {
            id: string;
            name: string;
            description: string;
            /** @enum {string} */
            engine: "wan" | "animatediff" | "minimax-h3" | "ltx-2.3";
            available: boolean;
            /** @description What is missing or why it does not fit, when it is not available. */
            reason?: string;
            clip_seconds: number;
            duration: components["schemas"]["DurationRange"];
            /** @description Whether the engine can write the sound. */
            audio: boolean;
            /** @description Seconds of a generation at the best quality, 16:9 and with no start image. */
            estimate?: number;
            default: boolean;
            inputs?: components["schemas"]["GenerationInputs"];
        };
        /** @description What the option accepts besides the text, with its limits. What is absent is not accepted. The reference limits are those measured for the memory of the card the server would use. */
        GenerationInputs: {
            /** @description Accepts the start image (`image`). */
            start_image: boolean;
            /** @description Accepts an end image (`end_image`): MiniMax H3 with its first-and-last-frame package, and LTX 2.3. */
            end_image: boolean;
            reference_images?: components["schemas"]["InputLimit"];
            reference_videos?: components["schemas"]["InputLimit"];
            reference_audios?: components["schemas"]["InputLimit"];
        };
        InputLimit: {
            /** @description Minimum (reference images require at least one). */
            min?: number;
            max: number;
            /** @description Maximum duration of each video or audio. */
            max_seconds?: number;
        };
        ImageModel: {
            id: string;
            name: string;
            description: string;
            /**
             * @description `img2img` starts from the image with a strength; `instruction` is an editing model that changes the image according to the text.
             * @enum {string}
             */
            kind: "img2img" | "instruction";
            available: boolean;
            reason?: string;
            /** @description Whether it accepts `strength`. */
            strength: boolean;
            /** @description Whether it accepts `negative_prompt`. */
            negative_prompt: boolean;
            max_variants: number;
            default: boolean;
        };
        GenerationOptions: {
            video: components["schemas"]["VideoOption"][];
            image_models: components["schemas"]["ImageModel"][];
            aspect_ratios: string[];
            qualities: string[];
        };
        /** @description `prompt` is required; without `model` the default from `GET /api/generation/options` is used; without `variants`, 1. */
        ImageEditRequest: {
            /** @description Identifier from `image_models`. */
            model?: string;
            prompt?: string;
            /** @description Only `img2img` models take it. */
            negative_prompt?: string;
            /** @description How far it departs from the image, greater than 0 and at most 1; only `img2img` models take it. */
            strength?: number;
            /** @description From 1 to the model's `max_variants`. */
            variants?: number;
            /** @description The label the client puts on the retouch. */
            adult?: boolean;
            /** @description The name of the dashboard making the request, its own (for example `video-studio`): 1 to 32 lowercase letters, digits or hyphens. Without it, `unknown` applies; if it does not match the pattern, `422` and nothing is created. It is saved in the project's `scenes.yaml` and in the run, and is used to group in the statistics and the metrics. */
            client?: string;
        };
        ImageEditResult: {
            /** @description From 1. */
            variant: number;
            /** Format: int64 */
            seed: number;
            /** @description Address of the image. */
            image: string;
        };
        ImageEdit: {
            id: string;
            /** @description The dashboard that requested it (`unknown` if it named none or if it predates this field). */
            client: string;
            /** @enum {string} */
            state: "queued" | "running" | "done" | "failed";
            progress: number;
            request: components["schemas"]["ImageEditRequest"];
            run_id: string;
            /** Format: date-time */
            created_at: string;
            /**
             * Format: int64
             * @description What its files take up on disk.
             */
            size_bytes: number;
            results?: components["schemas"]["ImageEditResult"][];
            error?: string;
        };
        VideoEditSetting: {
            name: string;
            /** @enum {string} */
            kind: "choice" | "number" | "integer" | "boolean" | "string" | "color";
            /** @description The accepted values when `kind` is `choice`. */
            values?: unknown[];
            min?: number;
            max?: number;
            /** @description The value used if it is not sent. */
            default?: unknown;
            /** @description It must be sent and cannot be blank. */
            required?: boolean;
            description?: string;
        };
        VideoEditTool: {
            /** @enum {string} */
            id: "scale" | "interpolate" | "reframe" | "remove-background" | "depth" | "extend" | "motion-control";
            name: string;
            description: string;
            available: boolean;
            /** @description Why it is not available (only with `available: false`): a file, a binary, the vision service or card memory is missing. */
            reason?: string;
            /** @description Whether it needs a reference image. */
            needs_image: boolean;
            /** @description Whether it can take a motion from the library instead of a video (`motion-control`). */
            accepts_motion?: boolean;
            /** @description Limits the client should show (for example «human silhouettes only», «33 frames», «quality drops with each extension»). */
            notes?: string[];
            settings: components["schemas"]["VideoEditSetting"][];
        };
        VideoEditOptions: {
            tools: components["schemas"]["VideoEditTool"][];
        };
        /** @description `settings` carries the tool's settings, with the names from `GET /api/video-edits/options`: `scale` {factor: 2|4, engine: fast|quality}; `interpolate` {fps: 24|30|60}; `reframe` {aspect_ratio: 16:9|9:16|1:1|4:5, mode: crop|pad, color}; `remove-background` {background (color, default #00ff00), alpha}; `depth` with no settings; `extend` {seconds: 2 to 10, prompt (required), engine: minimax-h3|ltx}; `motion-control` {prompt, strength: 0.2 to 1 (default 0.6), guidance: 1 to 10 (default 6; lower burns the highlights less but follows the prompt less), start (seconds, default 0, only with `motion`)}. */
        VideoEditRequest: {
            /** @enum {string} */
            tool: "scale" | "interpolate" | "reframe" | "remove-background" | "depth" | "extend" | "motion-control";
            settings?: {
                [key: string]: unknown;
            };
            /** @description `motion-control` only: the identifier of a `ready` motion from the library, instead of the `video` part. */
            motion?: string;
            /** @description The name of the dashboard making the request, as in `POST /api/generations`. Without it, `unknown` applies; if it does not match the pattern, `422` and nothing is created. */
            client?: string;
        };
        VideoEditResult: {
            /** @description The video's address (a read-only artifact). */
            video: string;
            /**
             * @description MP4 (H.264, yuv420p), or WebM with alpha in `remove-background` with `alpha`.
             * @enum {string}
             */
            format: "mp4" | "webm";
            /** @description The original's sound is kept in `scale`, `reframe` and `remove-background`; not in the other tools. */
            has_audio: boolean;
            width?: number;
            height?: number;
            fps?: number;
            /** @description Seconds. */
            duration?: number;
            /** @description What it was made with, when there are alternatives (`fast`/`quality`, the interpolation network or the fallback filter). */
            engine?: string;
            /** @description Run warnings, for example that the fallback filter was used or that nobody was found. */
            notes?: string[];
            /** @description `extend` only: how many times the video has been extended since its original. */
            extended_times?: number;
        };
        VideoEdit: {
            id: string;
            /** @description The dashboard that requested it (`unknown` if it named none). */
            client: string;
            tool: string;
            /** @enum {string} */
            state: "queued" | "running" | "done" | "failed" | "cancelled";
            progress: number;
            request: components["schemas"]["VideoEditRequest"];
            run_id: string;
            /** Format: date-time */
            created_at: string;
            /**
             * Format: int64
             * @description What its files take up on disk.
             */
            size_bytes: number;
            result?: components["schemas"]["VideoEditResult"];
            error?: string;
        };
        /** @description All fields are optional; the `video` or `source` part is required. */
        MotionRequest: {
            title?: string;
            tags?: string[];
            /** @description The address of a video the server can already read, instead of the `video` part. */
            source?: string;
        };
        Motion: {
            id: string;
            title: string;
            tags: string[];
            /** @description Seconds, at most 30. */
            duration: number;
            people: number;
            /** @enum {string} */
            state: "processing" | "ready" | "failed";
            /** @description Address of the preview (`GET /api/motions/{id}/preview`). */
            preview: string;
            /** @description The YouTube address the video was taken from; absent when it was uploaded as a file. The video itself is never kept. */
            source?: string;
            error?: string;
        };
        PhaseDuration: {
            /** @enum {string} */
            phase: "render" | "animate";
            model: string;
            resolution: string;
            gpu: string;
            steps?: number;
            frames?: number;
            /** @description Executions that meet all of the above. */
            executions: number;
            /** @description How many are needed to trust the history. */
            min_executions: number;
            enough: boolean;
            /** @description Only with enough history. */
            median_seconds?: number;
            /** @description Only with enough history. */
            p95_seconds?: number;
            /** @description How many days back the history counts. */
            period_days: number;
        };
        EstimateRequest: {
            /** @description The scenes.yaml to estimate (a draft or a project's). */
            yaml: string;
            /** @description A server project whose cache is read: what it will reuse adds nothing. */
            project?: string;
            /** @description Index of the card; without it, the one the server would choose. */
            gpu?: string;
        };
        Estimate: {
            seconds: number;
            /**
             * @description Where the figure for the image and animation phases comes from.
             * @enum {string}
             */
            source: "history" | "table" | "mixed";
            /** @description The executions of the history figure that has the fewest; only if there is a history part. */
            executions?: number;
            /** @description Parts whose time comes from this machine's history: each image or animation phase and, as one more, the rest (narration, clip and join) when there is history for both. */
            history_phases: number;
            /** @description Parts whose time comes from the table. */
            table_phases: number;
            /** @description Phases the cache will reuse that add nothing. */
            cached_phases: number;
            /** @description The card the calculation was made with. */
            gpu?: string;
        };
        ProjectSummary: {
            id: string;
            name: string;
            /**
             * @description Empty when the project cannot be read (`invalid`); in that case `name` is also empty and `scene_count` is 0.
             * @enum {string}
             */
            mode: "video" | "images" | "music" | "";
            /** @description Scenes of the project; 0 for a music one and for one that cannot be read. */
            scene_count: number;
            /** @description Number of tracks of a music project. */
            track_count?: number;
            /** @description Project label: `true` for over-18s, `false` reviewed and suitable for everyone; absent, not reviewed. */
            adult?: boolean;
            invalid?: boolean;
            error?: string;
            /** @description Who made the project: its `client:` (a client name), `embedded` (a normal project without it) or `unknown` (a generation API one without it). */
            client: string;
            /**
             * @description Only on a generation API project (with `managed=include`).
             * @enum {string}
             */
            kind?: "generation" | "image_edit" | "video_edit";
        };
        /** @description A run from the history. */
        Run: {
            id: string;
            project: string;
            /** @enum {string} */
            state: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "interrupted";
            /** @description `false` when the run's project or its files no longer exist: the run stays in the history and the statistics, but there is no result to link to. */
            result_available: boolean;
            /** @description The server that made the run, for a history that several share (empty if not recorded). */
            server?: string;
            /** @description Card or cards requested (empty: the one the server chooses). */
            gpu: string;
            keep_tmp: boolean;
            force: boolean;
            /** @description Scene the run was limited to. */
            only?: string;
            vram_warn_mb: number;
            /** @description Lookahead scenes requested (only appears if greater than 0). */
            overlap?: number;
            /** @description Output mode requested for this run; empty: the project's. */
            mode?: string;
            /** @description The dashboard that requested the run through the generation API (copied from its project's `scenes.yaml`); empty in normal projects and in anything predating the field. */
            client?: string;
            /** Format: date-time */
            created_at: string;
            /** Format: date-time */
            started_at?: string;
            /** Format: date-time */
            finished_at?: string;
            artifact?: string;
            error?: string;
        };
        Download: {
            id: string;
            /** @enum {string} */
            state: "queued" | "running" | "succeeded" | "failed" | "cancelled";
            kind: string;
            name: string;
            files: string[];
            source: string;
            bytes: number;
            total?: number;
            error?: string;
            /** Format: date-time */
            created_at: string;
            /** Format: date-time */
            finished_at?: string;
        };
        /** @description Lifecycle of a music generator's local service (the field is called `container` for compatibility). */
        ContainerState: {
            /** @enum {string} */
            state: "stopped" | "starting" | "running";
            /** @description Card it runs on. */
            gpu?: number;
            /** @description Port on 127.0.0.1 where the service is published. */
            port?: number;
            /** @description When it started (RFC 3339). */
            since?: string;
            /** @description RAM it uses (only with ?stats=1). */
            memory_mb?: number;
            /** @description Why the last start failed. */
            error?: string;
        };
        BinaryStatus: {
            name: string;
            /** @description Without it some mode cannot run (optional ones, like the music engine, do not require it). */
            required: boolean;
            present: boolean;
            path?: string;
            version?: string;
            /** @description How to install it, if missing (or why it is no good: Blender too old). */
            fix?: string;
            /** @description Devices it renders on, if it has several (Blender: those of Cycles, e.g. "OPTIX NVIDIA GeForce RTX 4070"). */
            devices?: string[];
        };
        AssetEntry: {
            name: string;
            /**
             * Format: int64
             * @description Bytes (the sum of its files, for an adapter folder).
             */
            size: number;
            /** @description The speakers of a Piper voice that has several (omitted on the usual single-speaker one). */
            speakers?: {
                id: number;
                name: string;
            }[];
        };
        GpuStatus: {
            index: number;
            name: string;
            free_vram_mb: number;
            /** @description The card's memory. */
            total_vram_mb?: number;
            /** @description What an Ollama process holds on this GPU. */
            ollama_mb?: number;
            /** @description How many times slower than the reference machine (an RTX 5060 Ti) it has been in its runs; below 1 it is faster. Appears when there are enough samples. */
            speed_factor?: number;
            speed_samples?: number;
            /** @description Little free memory is left for a render. */
            low_vram?: boolean;
            warnings?: string[];
        };
        /** @description Only if the server has a models folder (`--models-dir`, `MODELS_DIR` or `~/.config/mediaorquestator/models-dir`). The repository's `models/` is a link to it, so models are installed and read there. If the disk is not mounted `available` is false and nothing is installed (nothing is written to the local disk); it is not the same as having no models. */
        ModelsDirectory: {
            /** @description Absolute path of the models folder, as the server sees it. */
            dir: string;
            /** @description The folder exists and is writable. */
            available: boolean;
            /** @description The repository's `models/` leads to this folder. If false and `available` is true, `orchestrator models migrate` needs to be run. */
            linked: boolean;
            /** @description Why it is not available, or what is missing. */
            reason?: string;
            disk?: components["schemas"]["DiskReport"];
        };
        DiskReport: {
            /** Format: int64 */
            free_bytes: number;
            /** Format: int64 */
            total_bytes: number;
            /** Format: int64 */
            warn_below_bytes: number;
            low: boolean;
        };
        /** @description Whether an optional music engine (HeartMuLa, DiffRhythm2) can be used now and, if not, why. */
        EngineAvailability: {
            available: boolean;
            /** @enum {string} */
            mode?: "local" | "external";
            reason?: string;
            detail?: string;
            missing?: string[];
            version?: string;
            container?: components["schemas"]["ContainerState"];
        };
        EnvironmentReport: {
            /** @enum {string} */
            edition: "private" | "public";
            /** @enum {string} */
            content_mode: "censored" | "strict" | "all";
            models_dir?: components["schemas"]["ModelsDirectory"];
            binaries: components["schemas"]["BinaryStatus"][];
            /** @description The image models. */
            models: components["schemas"]["AssetEntry"][];
            /** @description The files used only by the retouch models. */
            retouch: components["schemas"]["AssetEntry"][];
            voices: components["schemas"]["AssetEntry"][];
            loras: components["schemas"]["AssetEntry"][];
            music: components["schemas"]["AssetEntry"][];
            music_adapters: components["schemas"]["AssetEntry"][];
            /** @description The Whisper models. */
            transcription: components["schemas"]["AssetEntry"][];
            /** @description Whether a spoken request can be transcribed here and, if not, why. */
            dictation: {
                available: boolean;
                reason?: string;
            };
            gpus: components["schemas"]["GpuStatus"][];
            gpu_error?: string;
            ollama: {
                host: string;
                /** @enum {string} */
                source: "setting" | "env" | "default";
                remote: boolean;
            };
            /** @description Whether there is a download key per service (never the value). */
            tokens: {
                huggingface: boolean;
                civitai: boolean;
            };
            /** @description Where the key in use comes from; the service does not appear if it has none. */
            token_sources: {
                /** @enum {string} */
                huggingface?: "env" | "file";
                /** @enum {string} */
                civitai?: "env" | "file";
            };
            disk?: components["schemas"]["DiskReport"];
            ram?: {
                /** Format: int64 */
                total_bytes: number;
                /** Format: int64 */
                available_bytes: number;
            };
            heartmula?: components["schemas"]["EngineAvailability"];
            diffrhythm2?: components["schemas"]["EngineAvailability"];
        };
        StatsGroup: {
            /** @description The project id, the GPU index or the type; empty in runs with no fixed GPU or of a project that no longer exists. */
            name: string;
            runs: number;
            seconds: number;
            success_rate?: number;
            /** @description GPU rows only. */
            peak_vram_pct?: number;
            mean_peak_vram_pct?: number;
            sampled_runs?: number;
        };
        StatsRunPoint: {
            id: string;
            project: string;
            /** @enum {string} */
            state: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "interrupted";
            created_at: string;
            seconds: number;
            /**
             * @description Absent if the project no longer exists.
             * @enum {string}
             */
            mode?: "video" | "images" | "music";
            result_available: boolean;
        };
        StatsResult: {
            period: {
                /** Format: date-time */
                since: string;
                /** Format: date-time */
                until: string;
            };
            /** @description The filter they were computed with, if any. */
            project?: string;
            mode?: string;
            totals: {
                runs: number;
                by_state: {
                    [key: string]: number;
                };
                /** @description Successfully finished out of finished. */
                success_rate?: number;
                total_seconds: number;
                queue_wait_mean_seconds?: number;
            };
            duration: {
                /** @description The successful runs that have a duration. */
                runs: number;
                mean_seconds?: number;
                median_seconds?: number;
                p95_seconds?: number;
                total_seconds: number;
            };
            by_day: {
                date: string;
                succeeded: number;
                failed: number;
                other: number;
                seconds: number;
            }[];
            phases: {
                phase: string;
                executions: number;
                reused: number;
                total_seconds: number;
                mean_seconds?: number;
                p95_seconds?: number;
            }[];
            cache: {
                executed: number;
                reused: number;
                reuse_share?: number;
            };
            by_project: components["schemas"]["StatsGroup"][];
            by_gpu: components["schemas"]["StatsGroup"][];
            by_mode: components["schemas"]["StatsGroup"][];
            /** @description One group per requester of the runs: the name of each generation API dashboard, `unknown` (unnamed or predating the field) and `embedded` (the normal projects). */
            by_client: components["schemas"]["StatsGroup"][];
            run_durations: components["schemas"]["StatsRunPoint"][];
            slowest: components["schemas"]["StatsRunPoint"][];
        };
        ResourcePoint: {
            /**
             * Format: int64
             * @description Milliseconds since the start of the run.
             */
            t_ms: number;
            used_mb: number;
            /** @description GPU utilization; RAM does not carry it. */
            util_pct?: number;
        };
        RunResources: {
            /** Format: int64 */
            interval_ms: number;
            /** @description There were more samples than are returned. */
            truncated: boolean;
            gpus: {
                index: number;
                total_mb: number;
                samples: components["schemas"]["ResourcePoint"][];
            }[];
            ram: {
                total_mb: number;
                samples: components["schemas"]["ResourcePoint"][];
            };
            peaks: {
                vram: {
                    gpu: number;
                    mb: number;
                    pct: number;
                }[];
                ram: {
                    mb: number;
                    pct: number;
                } | null;
            };
        };
    };
    responses: {
        /** @description Created. */
        CreatedId: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": {
                    id?: string;
                };
            };
        };
        /** @description Malformed request (`invalid_request`). */
        BadRequest: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description The token is missing or invalid (`unauthorized`). */
        Unauthorized: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Does not exist (`not_found`). */
        NotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Conflict with the current state (`conflict`). */
        Conflict: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
        /** @description Fails validation (`validation_failed`). */
        Unprocessable: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["Error"];
            };
        };
    };
    parameters: {
        /** @description `include` also lists the generation API projects (`api-gen-`, `api-edit-`, `api-vid-`) as ordinary projects, with their `client` and `kind`. Without it they are not listed. Any other value is a 400. Music motion animations (`api-mm-`) never appear. */
        ManagedInclude: "include";
        /** @description Comma-separated list of clients (client names, `embedded` or `unknown`): only the items of those clients appear. A name that is not valid is a 400. */
        ClientFilter: string;
        /** @description Project identifier. */
        ProjectId: string;
        /** @description Scene identifier. */
        SceneId: string;
        /** @description Run identifier. */
        RunId: string;
        /** @description Review identifier. */
        ReviewId: string;
        /** @description Finding identifier. */
        FindingId: string;
        /** @description Download identifier. */
        DownloadId: string;
        TokenService: "huggingface" | "civitai";
        /** @description Ticket from `POST /api/auth/ticket`, for clients that cannot send headers. */
        Ticket: string;
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
