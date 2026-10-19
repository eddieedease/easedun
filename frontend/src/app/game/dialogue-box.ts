import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal } from '@angular/core';
import { DialogueView } from './engine';

const CHARS_PER_TICK = 2;
const TICK_MS = 16;

/** Conversation / narration box with a typewriter effect and numbered choices. */
@Component({
  selector: 'app-dialogue-box',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="box" (click)="skip()">
      <div class="who">
        <span class="sprite">{{ view().sprite }}</span>
        @if (view().speaker) {
          <span class="name">{{ view().speaker }}</span>
        }
      </div>
      <p class="text">{{ shown() }}@if (!done()) {<span class="caret">▌</span>}</p>
      @if (done()) {
        <ol class="options">
          @for (option of view().options; track $index) {
            <li>
              <button class="btn" (click)="choose.emit($index); $event.stopPropagation()">
                <span class="num">{{ $index + 1 }}</span>{{ option }}
              </button>
            </li>
          }
        </ol>
      }
    </div>
  `,
  styles: `
    .box {
      background: rgba(6, 4, 16, 0.92);
      border-top: 1px solid var(--neon-pink);
      box-shadow: 0 -6px 24px rgba(255, 43, 214, 0.25);
      padding: 12px 16px 14px;
      max-height: 100%;
      overflow: auto;
    }
    .who { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
    .sprite { font-size: 30px; line-height: 1; filter: drop-shadow(0 0 6px rgba(0, 240, 255, 0.6)); }
    .name { font-family: var(--font-display); color: var(--neon-pink); letter-spacing: .1em; text-transform: uppercase; font-size: .85rem; }
    .text { margin: 0 0 10px; white-space: pre-line; min-height: 2.8em; }
    .caret { color: var(--neon-cyan); animation: blink .8s steps(2) infinite; }
    @keyframes blink { 50% { opacity: 0; } }
    .options { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
    .options .btn { width: 100%; justify-content: flex-start; text-align: left; }
    .num { color: var(--neon-yellow); min-width: 1.2em; }
  `,
})
export class DialogueBox {
  readonly view = input.required<DialogueView>();
  readonly choose = output<number>();

  private readonly count = signal(0);
  protected readonly shown = computed(() => this.view().text.slice(0, this.count()));
  readonly done = computed(() => this.count() >= this.view().text.length);
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    effect(() => {
      this.view();
      this.count.set(0);
      clearInterval(this.timer);
      this.timer = setInterval(() => {
        this.count.update((c) => c + CHARS_PER_TICK);
        if (this.done()) clearInterval(this.timer);
      }, TICK_MS);
    });
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
  }

  /** Reveals the full text at once. */
  skip() {
    this.count.set(this.view().text.length);
  }
}
