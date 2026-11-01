import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  effect,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

type Tool = 'pencil' | 'eraser' | 'fill' | 'picker';

const VIEW = 384;
const PALETTE = [
  '#000000', '#1a1426', '#3a2f63', '#5a5466', '#9a94a8', '#ffffff',
  '#ff2bd6', '#00f0ff', '#f5f000', '#3dffa2', '#ff2b6a', '#8a5cff',
  '#ff7a1a', '#7a3a1a', '#c8a070', '#2a5a2a', '#1e4fa0', '#a0e0ff',
];
const UNDO_LIMIT = 40;

/**
 * Small pixel-art editor. Pixels are RGBA in a Uint32Array (little-endian ABGR);
 * the result is emitted as a PNG data URL after every stroke.
 */
@Component({
  selector: 'app-pixel-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="tools">
      @for (t of tools; track t.id) {
        <button class="btn" [class.active]="tool() === t.id" (click)="tool.set(t.id)" [title]="t.label">{{ t.icon }}</button>
      }
      <button class="btn" [class.active]="mirror()" (click)="mirror.set(!mirror())" title="Mirror left/right">⇋</button>
      <button class="btn" (click)="undo()" [disabled]="!canUndo()" title="Undo (Ctrl+Z)">↶</button>
      <button class="btn danger" (click)="clear()" title="Clear">✕</button>
      <label class="btn upload" title="Upload an image and turn it into pixel art">
        ⤒ Upload
        <input type="file" accept="image/*" (change)="upload($event)" hidden />
      </label>
    </div>
    <div class="palette">
      @for (c of palette; track c) {
        <button class="swatch" [style.background]="c" [class.active]="color() === c" (click)="color.set(c)" [attr.aria-label]="c"></button>
      }
      <input type="color" [value]="color()" (input)="color.set($any($event.target).value)" title="Any colour" />
    </div>
    <canvas
      #canvas
      [width]="view"
      [height]="view"
      (pointerdown)="down($event)"
      (pointermove)="move($event)"
      (pointerup)="up()"
      (pointercancel)="up()"
    ></canvas>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 6px; }
    .tools, .palette { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
    .tools .btn { padding: 2px 10px; }
    .btn.active { color: var(--neon-yellow); border-color: var(--neon-yellow); }
    .upload { cursor: pointer; }
    .swatch { width: 22px; height: 22px; border: 1px solid #000; cursor: pointer; padding: 0; }
    .swatch.active { outline: 2px solid var(--neon-yellow); outline-offset: 1px; }
    input[type='color'] { width: 34px; height: 24px; padding: 0; }
    canvas {
      width: 100%;
      max-width: 384px;
      aspect-ratio: 1;
      image-rendering: pixelated;
      cursor: crosshair;
      touch-action: none;
      border: 1px solid var(--edge-light);
      background: repeating-conic-gradient(#1b1a24 0% 25%, #24222e 0% 50%) 0 0 / 16px 16px;
    }
  `,
  host: { '(document:keydown)': 'onKey($event)' },
})
export class PixelEditor {
  /** Grid size in pixels. */
  readonly size = input.required<number>();
  /** PNG data URL to start from. */
  readonly value = input<string>('');
  readonly changed = output<string>();

  protected readonly view = VIEW;
  protected readonly palette = PALETTE;
  protected readonly tools: { id: Tool; icon: string; label: string }[] = [
    { id: 'pencil', icon: '✎', label: 'Pencil' },
    { id: 'eraser', icon: '⌫', label: 'Eraser' },
    { id: 'fill', icon: '◧', label: 'Fill' },
    { id: 'picker', icon: '⊙', label: 'Pick colour' },
  ];
  protected readonly tool = signal<Tool>('pencil');
  protected readonly color = signal('#00f0ff');
  protected readonly mirror = signal(false);
  protected readonly canUndo = signal(false);
  /** Bumped on every pixel change so the canvas redraws. */
  private readonly version = signal(0);

  private pixels: Uint32Array<ArrayBuffer> = new Uint32Array(32 * 32);
  private gridSize = 32;
  private undoStack: Uint32Array<ArrayBuffer>[] = [];
  private drawing = false;
  private loaded = false;
  /** The data URL we last emitted, so echoes from the parent don't reload. */
  private emitted = '';
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  constructor() {
    effect(() => {
      const size = this.size();
      const value = this.value();
      untracked(async () => {
        if (value && value === this.emitted && size === this.gridSize) return;
        if (!value) return this.reset(size);
        // A size change resamples the current sprite and emits the resized version.
        const resized = this.loaded && size !== this.gridSize;
        await this.loadImage(value, size, false);
        this.loaded = true;
        if (resized) this.commit();
      });
    });
    afterRenderEffect(() => {
      this.version();
      const ctx = this.canvas().nativeElement.getContext('2d');
      if (ctx) this.draw(ctx);
    });
  }

  protected onKey(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      this.undo();
    }
  }

  protected down(e: PointerEvent) {
    const p = this.cellAt(e);
    if (!p) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const tool = this.tool();
    if (tool === 'picker') {
      const c = this.pixels[p.y * this.gridSize + p.x];
      if (c >>> 24) this.color.set(toHex(c));
      this.tool.set('pencil');
      return;
    }
    this.snapshot();
    if (tool === 'fill') {
      this.fill(p.x, p.y, parseHex(this.color()));
      this.commit();
      return;
    }
    this.drawing = true;
    this.plot(p.x, p.y);
  }

  protected move(e: PointerEvent) {
    if (!this.drawing) return;
    const p = this.cellAt(e);
    if (p) this.plot(p.x, p.y);
  }

  protected up() {
    if (!this.drawing) return;
    this.drawing = false;
    this.commit();
  }

  protected undo() {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.pixels = prev;
    this.canUndo.set(this.undoStack.length > 0);
    this.commit();
  }

  protected clear() {
    this.snapshot();
    this.pixels.fill(0);
    this.commit();
  }

  protected async upload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    this.snapshot();
    await this.loadImage(url, this.gridSize, true);
    this.commit();
  }

  // ---- internals ----------------------------------------------------------

  private reset(size: number) {
    this.gridSize = size;
    this.pixels = new Uint32Array(size * size);
    this.undoStack = [];
    this.canUndo.set(false);
    this.version.update((v) => v + 1);
  }

  /**
   * Draws an image into the grid. Uploads are fitted (keeping aspect ratio)
   * and alpha-thresholded so they come out as crisp pixel art.
   */
  private async loadImage(url: string, size: number, fit: boolean) {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => undefined);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    if (fit) {
      const scale = Math.min(size / img.width, size / img.height);
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, Math.floor((size - w) / 2), size - h, w, h);
    } else {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, size, size);
    }
    const data = new Uint32Array(ctx.getImageData(0, 0, size, size).data.buffer.slice(0));
    // Pixel art has no half-transparent pixels.
    for (let i = 0; i < data.length; i++) data[i] = data[i] >>> 24 < 128 ? 0 : (data[i] | 0xff000000) >>> 0;
    if (size !== this.gridSize || !fit) {
      this.gridSize = size;
      if (!fit) {
        this.undoStack = [];
        this.canUndo.set(false);
      }
    }
    this.pixels = data;
    this.emitted = fit ? this.emitted : url;
    this.version.update((v) => v + 1);
  }

  private cellAt(e: PointerEvent) {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * this.gridSize);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * this.gridSize);
    return x >= 0 && y >= 0 && x < this.gridSize && y < this.gridSize ? { x, y } : null;
  }

  private plot(x: number, y: number) {
    const c = this.tool() === 'eraser' ? 0 : parseHex(this.color());
    this.pixels[y * this.gridSize + x] = c;
    if (this.mirror()) this.pixels[y * this.gridSize + (this.gridSize - 1 - x)] = c;
    this.version.update((v) => v + 1);
  }

  private fill(x: number, y: number, color: number) {
    const n = this.gridSize;
    const target = this.pixels[y * n + x];
    if (target === color) return;
    const stack = [[x, y]];
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      if (cx < 0 || cy < 0 || cx >= n || cy >= n || this.pixels[cy * n + cx] !== target) continue;
      this.pixels[cy * n + cx] = color;
      stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    this.version.update((v) => v + 1);
  }

  private snapshot() {
    this.undoStack.push(this.pixels.slice());
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
    this.canUndo.set(true);
  }

  /** Exports the grid as a PNG data URL. */
  private commit() {
    const n = this.gridSize;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = n;
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(this.pixels.buffer.slice(0)), n, n), 0, 0);
    this.emitted = this.isEmpty() ? '' : canvas.toDataURL('image/png');
    this.version.update((v) => v + 1);
    this.changed.emit(this.emitted);
  }

  private isEmpty() {
    return this.pixels.every((p) => p >>> 24 === 0);
  }

  private draw(ctx: CanvasRenderingContext2D) {
    const n = this.gridSize;
    const cell = VIEW / n;
    ctx.clearRect(0, 0, VIEW, VIEW);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const c = this.pixels[y * n + x];
        if (!(c >>> 24)) continue;
        ctx.fillStyle = toHex(c);
        ctx.fillRect(x * cell, y * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
    if (cell >= 6) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.beginPath();
      for (let i = 0; i <= n; i++) {
        ctx.moveTo(i * cell + 0.5, 0);
        ctx.lineTo(i * cell + 0.5, VIEW);
        ctx.moveTo(0, i * cell + 0.5);
        ctx.lineTo(VIEW, i * cell + 0.5);
      }
      ctx.stroke();
    }
    if (this.mirror()) {
      ctx.strokeStyle = 'rgba(245, 240, 0, 0.5)';
      ctx.beginPath();
      ctx.moveTo(VIEW / 2, 0);
      ctx.lineTo(VIEW / 2, VIEW);
      ctx.stroke();
    }
  }
}

/** '#rrggbb' → opaque ABGR pixel. */
function parseHex(hex: string) {
  const v = parseInt(hex.slice(1), 16);
  return (0xff000000 | ((v & 0xff) << 16) | (v & 0xff00) | ((v >> 16) & 0xff)) >>> 0;
}

function toHex(c: number) {
  const r = c & 0xff;
  const g = (c >> 8) & 0xff;
  const b = (c >> 16) & 0xff;
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}
