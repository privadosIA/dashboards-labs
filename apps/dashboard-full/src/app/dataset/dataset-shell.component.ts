import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DatasetStudioNav } from '@lab/dataset-studio-kit';

/** The Dataset section: a slim bar with the library's links (Studio and Presets), which the library does not draw, and its screens. */
@Component({
  selector: 'app-dataset-shell',
  imports: [DatasetStudioNav, RouterOutlet],
  templateUrl: './dataset-shell.component.html',
  styleUrl: './dataset-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DatasetShellComponent {}
