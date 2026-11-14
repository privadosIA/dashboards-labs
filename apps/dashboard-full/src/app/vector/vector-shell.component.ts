import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { VectorStudioNav } from '@lab/vector-studio-kit';

/** The Vector tab of the Animation section: a slim bar under the section's with the Editor and Catalog links, which the library does not draw, and the vector studio itself. */
@Component({
  selector: 'app-vector-shell',
  imports: [RouterOutlet, VectorStudioNav],
  templateUrl: './vector-shell.component.html',
  styleUrl: './vector-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VectorShellComponent {}
