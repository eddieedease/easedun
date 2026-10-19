import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActorDef, ActorKind } from '../core/models';
import { KIND_LABELS } from '../game/level-format';
import { DialogueEditor } from './dialogue-editor';

const SPRITES: Record<ActorKind, string[]> = {
  npc: ['🧑‍🎤', '👩‍💻', '🧔', '👮', '🕵️', '🧑‍🔧', '👵', '🧙', '💃', '🥷'],
  enemy: ['🤖', '🦹', '🧟', '👾', '🐺', '💀', '🛸', '🦾', '👹'],
  item: ['💾', '🎫', '💉', '💳', '🔧', '🔫', '🔑', '📦', '🍜', '💊', '🗡️'],
  terminal: ['📟', '🖥️', '🪧', '🏧', '📺', '🚪', '🛗'],
  trigger: ['💬'],
};

const KIND_HINTS: Record<ActorKind, string> = {
  npc: 'Blocks the street. The player talks to it by walking into it or pressing F.',
  enemy: 'Hostile enemies attack when bumped. Non-hostile enemies talk first; use a "Start fight" effect to turn them.',
  item: 'Picked up when the player steps on it. Optional dialogue shows on pickup.',
  terminal: 'An object to read or use: signs, terminals, doors. Works like a character.',
  trigger: 'Invisible. Its dialogue plays once when the player steps on the cell: narration, flashbacks, radio calls.',
};

/** Edits one actor definition in place and emits `changed` after each edit. */
@Component({
  selector: 'app-actor-editor',
  imports: [FormsModule, DialogueEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let a = actor();
    <div class="head">
      <span class="sprite">{{ a.sprite }}</span>
      <div class="grow">
        <input class="name" [(ngModel)]="a.name" (ngModelChange)="touch()" aria-label="Name" />
        <small>{{ kindLabels[a.kind] }} · id <code>{{ a.id }}</code></small>
      </div>
      <button class="btn danger" (click)="remove.emit()">Delete</button>
    </div>
    <p class="hint">{{ kindHints[a.kind] }}</p>

    @if (a.kind !== 'trigger') {
      <div class="sprites">
        @for (s of sprites[a.kind]; track s) {
          <button class="pick" [class.active]="a.sprite === s" (click)="a.sprite = s; touch()">{{ s }}</button>
        }
        <input class="custom" [(ngModel)]="a.sprite" (ngModelChange)="touch()" maxlength="8" title="Any emoji" aria-label="Custom sprite" />
      </div>
    }

    @if (a.kind === 'enemy') {
      <div class="fields">
        <label>HP <input type="number" min="1" [(ngModel)]="a.hp" (ngModelChange)="touch()" /></label>
        <label>Damage min <input type="number" min="0" [ngModel]="a.attack?.[0] ?? 1" (ngModelChange)="setAttack(0, +$event)" /></label>
        <label>Damage max <input type="number" min="0" [ngModel]="a.attack?.[1] ?? 3" (ngModelChange)="setAttack(1, +$event)" /></label>
        <label>Flag on defeat <input [(ngModel)]="a.defeatFlag" (ngModelChange)="touch()" placeholder="e.g. razor_down" /></label>
        <label class="check"><input type="checkbox" [(ngModel)]="a.hostile" (ngModelChange)="touch()" /> Hostile on sight</label>
      </div>
      <div class="drops">
        <span>Drops:</span>
        @for (item of items(); track item.id) {
          <label class="check"><input type="checkbox" [checked]="a.drops?.includes(item.id)" (change)="toggleDrop(item.id)" /> {{ item.sprite }} {{ item.name }}</label>
        } @empty {
          <span class="hint">Create items first.</span>
        }
      </div>
    }

    @if (a.kind === 'item') {
      <div class="fields">
        <label>Heals HP <input type="number" min="0" [(ngModel)]="a.heal" (ngModelChange)="touch()" /></label>
        <label>Attack bonus <input type="number" min="0" [(ngModel)]="a.attackBonus" (ngModelChange)="touch()" /></label>
        <label>Credits on pickup <input type="number" min="0" [(ngModel)]="a.credits" (ngModelChange)="touch()" /></label>
      </div>
      <p class="hint">Story items (keys, passes, data) need no numbers: use them in conditions and give/take effects.</p>
    }

    <h3>Dialogue</h3>
    <app-dialogue-editor [nodes]="a.dialogue" [actors]="actors()" (changed)="touch()" />
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 8px; }
    .head { display: flex; gap: 10px; align-items: center; }
    .sprite { font-size: 42px; }
    .grow { flex: 1; display: flex; flex-direction: column; }
    .name { font-size: 1.1em; }
    small { color: var(--muted); }
    code { color: var(--neon-yellow); }
    .hint { color: var(--muted); font-size: .85em; margin: 0; }
    .sprites { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
    .pick { font-size: 22px; background: var(--panel-dark); border: 1px solid var(--edge-light); cursor: pointer; padding: 2px 4px; }
    .pick.active { border-color: var(--neon-cyan); box-shadow: 0 0 8px rgba(0, 240, 255, 0.5); }
    .custom { width: 70px; font-size: 18px; }
    .fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 6px; }
    .fields label { display: flex; flex-direction: column; font-size: .85em; }
    .check { flex-direction: row !important; align-items: center; gap: 6px; color: var(--text); }
    .drops { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; font-size: .9em; }
    h3 { margin-top: 8px; font-size: .9rem; }
  `,
})
export class ActorEditor {
  readonly actor = input.required<ActorDef>();
  readonly actors = input.required<ActorDef[]>();
  readonly changed = output<void>();
  readonly remove = output<void>();

  protected readonly kindLabels = KIND_LABELS;
  protected readonly kindHints = KIND_HINTS;
  protected readonly sprites = SPRITES;
  protected readonly items = computed(() => this.actors().filter((a) => a.kind === 'item'));

  protected touch() {
    this.changed.emit();
  }

  protected setAttack(i: 0 | 1, value: number) {
    const a = this.actor();
    const attack: [number, number] = [...(a.attack ?? [1, 3])];
    attack[i] = value;
    a.attack = attack;
    this.touch();
  }

  protected toggleDrop(id: string) {
    const a = this.actor();
    const drops = a.drops ?? [];
    a.drops = drops.includes(id) ? drops.filter((d) => d !== id) : [...drops, id];
    this.touch();
  }
}
