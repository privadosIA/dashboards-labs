import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { EnginesButton } from '@lab/music-studio-kit';

/** The Music section: a slim bar with the Engines button, which the library does not draw, and the song studio itself. */
@Component({
  selector: 'app-song-studio-shell',
  imports: [EnginesButton, RouterOutlet],
  templateUrl: './song-studio-shell.component.html',
  styleUrl: './song-studio-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SongStudioShellComponent {}
