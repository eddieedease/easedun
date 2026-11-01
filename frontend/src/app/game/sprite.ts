import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Shows a pixel-art sprite when there is one, otherwise the emoji placeholder. Sized by font-size. */
@Component({
  selector: 'app-sprite',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (image()) { <img [src]="image()" alt="" /> } @else { {{ emoji() }} }`,
  styles: `
    :host { display: inline-grid; place-items: center; width: 1.25em; height: 1.25em; line-height: 1; vertical-align: middle; }
    img { width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated; }
  `,
})
export class Sprite {
  readonly image = input<string | undefined>('');
  readonly emoji = input<string>('');
}
