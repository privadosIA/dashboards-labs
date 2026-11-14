import type { MatDialog } from '@angular/material/dialog';

import type { Texts } from '../core/texts';
import { RetouchDialog } from '../retouch-dialog/retouch.dialog';
import type { ToolId } from '../video-edit/model';
import type { StartImage } from '../video/model';

/** What a tool needs from the page that lists it. */
export interface EditToolContext {
  dialog: MatDialog;
  /** Asks for an image file; resolves with it, or with null when none was given or it was refused (the list says why). */
  pickImage(): Promise<StartImage | null>;
  /** Makes an image the start image of the Create tab and shows that tab. */
  useAsStartImage(image: StartImage): void;
}

export interface EditTool {
  id: string;
  /** The path of a 24x24 stroke icon. */
  icon: string;
  name(t: Texts): string;
  hint(t: Texts): string;
  run(ctx: EditToolContext): Promise<void> | void;
}

/** How a tool of the server's Edit video list looks in the list: the server says which exist and whether they can run. */
export interface VideoToolEntry {
  /** The path of a 24x24 stroke icon. */
  icon: string;
  name(t: Texts): string;
  hint(t: Texts): string;
}

/**
 * The look of each video tool the contract describes. The list shows a server tool only when it has an entry here, in
 * the server's own order; adding a tool is one entry here (and its texts), and nothing in the tabs or the layout changes.
 */
export const VIDEO_TOOLS: Readonly<Partial<Record<ToolId, VideoToolEntry>>> = {
  scale: { icon: 'M4 14v6h6M20 10V4h-6M4 20l7-7M20 4l-7 7', name: (t) => t.videoTools.names.scale, hint: (t) => t.videoTools.hints.scale },
  interpolate: { icon: 'M3 12h4l2-6 4 12 2-6h6', name: (t) => t.videoTools.names.interpolate, hint: (t) => t.videoTools.hints.interpolate },
  reframe: { icon: 'M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14', name: (t) => t.videoTools.names.reframe, hint: (t) => t.videoTools.hints.reframe },
  'remove-background': { icon: 'M12 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM6 20a6 6 0 0 1 12 0', name: (t) => t.videoTools.names['remove-background'], hint: (t) => t.videoTools.hints['remove-background'] },
  depth: { icon: 'M12 3l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 16l9 5 9-5', name: (t) => t.videoTools.names.depth, hint: (t) => t.videoTools.hints.depth },
  extend: { icon: 'M4 12h12M12 6l6 6-6 6M21 5v14', name: (t) => t.videoTools.names.extend, hint: (t) => t.videoTools.hints.extend },
  'motion-control': { icon: 'M7 21l3-8 4 3 3-8M14 4h4v4M6 6a1.5 1.5 0 1 0 0 .01', name: (t) => t.videoTools.names['motion-control'], hint: (t) => t.videoTools.hints['motion-control'] },
};

/**
 * The edit tools that do not come from the server's video tool list: today only Retouch image. A tool is listed only
 * when the contract in `contract/` has the endpoint it needs; one of this kind is one entry here and one port (server and
 * in-memory adapters, like `retouch/`).
 */
export const EDIT_TOOLS: readonly EditTool[] = [
  {
    id: 'retouch',
    icon: 'M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16l-1 4zM14 7l3 3',
    name: (t) => t.editTools.retouch.name,
    hint: (t) => t.editTools.retouch.hint,
    async run(ctx) {
      const image = await ctx.pickImage();
      if (!image) return;
      const used = await new Promise<StartImage | undefined>((resolve) =>
        ctx.dialog.open<RetouchDialog, StartImage, StartImage>(RetouchDialog, { data: image, width: '46rem', maxWidth: '95vw', panelClass: 'studio-kit' }).afterClosed().subscribe(resolve),
      );
      if (used) ctx.useAsStartImage(used);
    },
  },
];
