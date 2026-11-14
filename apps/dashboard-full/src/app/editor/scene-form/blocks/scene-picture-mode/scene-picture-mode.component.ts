import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';

import { PictureMode } from '../../dynamic/scene-model.adapter';

/** How the scene's picture is made: generated, its own picture, its own clip, an animated graphic or a part of the catalog. */
@Component({
  selector: 'app-scene-picture-mode',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonToggleModule],
  templateUrl: './scene-picture-mode.component.html',
  styleUrl: './scene-picture-mode.component.scss',
})
export class ScenePictureModeComponent {
  readonly mode = input.required<PictureMode>();
  /** The animated graphic is offered only when the model that writes it can run (or the scene already is one). */
  readonly motionAllowed = input(false);
  /** A part of the catalog is offered when the server has the catalog (or the scene already is drawn by one). */
  readonly partAllowed = input(false);

  readonly modeChange = output<PictureMode>();
}
