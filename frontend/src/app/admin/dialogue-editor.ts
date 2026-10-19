import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActorDef, Condition, DialogueChoice, DialogueNode, Effect, EffectType } from '../core/models';
import { newId } from '../game/level-format';

export const EFFECT_LABELS: Record<EffectType, string> = {
  setFlag: 'Set flag',
  clearFlag: 'Clear flag',
  giveItem: 'Give item',
  takeItem: 'Take item',
  credits: 'Credits ±',
  heal: 'Heal / hurt ±',
  fight: 'Start fight',
  remove: 'Remove this actor',
  endLevel: 'Complete level',
};

const EFFECT_DEFAULTS: Record<EffectType, () => Effect> = {
  setFlag: () => ({ type: 'setFlag', flag: '' }),
  clearFlag: () => ({ type: 'clearFlag', flag: '' }),
  giveItem: () => ({ type: 'giveItem', item: '' }),
  takeItem: () => ({ type: 'takeItem', item: '' }),
  credits: () => ({ type: 'credits', amount: 10 }),
  heal: () => ({ type: 'heal', amount: 10 }),
  fight: () => ({ type: 'fight' }),
  remove: () => ({ type: 'remove' }),
  endLevel: () => ({ type: 'endLevel' }),
};

/**
 * Edits a conversation tree in place. Nodes hold text; choices lead to other
 * nodes and can be gated by conditions and trigger effects.
 * Emits `changed` after every edit so the parent can mark the level dirty.
 */
@Component({
  selector: 'app-dialogue-editor',
  imports: [FormsModule, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dialogue-editor.html',
  styleUrl: './dialogue-editor.scss',
})
export class DialogueEditor {
  readonly nodes = input.required<DialogueNode[]>();
  /** All actors in the level, for item pickers. */
  readonly actors = input.required<ActorDef[]>();
  readonly changed = output<void>();

  protected readonly effectTypes = Object.keys(EFFECT_LABELS) as EffectType[];
  protected readonly effectLabels = EFFECT_LABELS;
  protected readonly items = computed(() => this.actors().filter((a) => a.kind === 'item'));

  protected touch() {
    this.changed.emit();
  }

  protected addNode() {
    this.nodes().push({ id: newId('node'), text: '', choices: [] });
    this.touch();
  }

  protected removeNode(i: number) {
    const [removed] = this.nodes().splice(i, 1);
    for (const n of this.nodes()) for (const c of n.choices) if (c.next === removed.id) c.next = '';
    this.touch();
  }

  protected moveNode(i: number, delta: number) {
    const nodes = this.nodes();
    const j = i + delta;
    if (j < 0 || j >= nodes.length) return;
    [nodes[i], nodes[j]] = [nodes[j], nodes[i]];
    this.touch();
  }

  protected renameNode(node: DialogueNode, id: string) {
    const clean = id.trim().replace(/\s+/g, '-');
    if (!clean || this.nodes().some((n) => n !== node && n.id === clean)) return;
    for (const n of this.nodes()) for (const c of n.choices) if (c.next === node.id) c.next = clean;
    node.id = clean;
    this.touch();
  }

  protected addChoice(node: DialogueNode) {
    node.choices.push({ label: '', next: '', effects: [] });
    this.touch();
  }

  protected removeChoice(node: DialogueNode, i: number) {
    node.choices.splice(i, 1);
    this.touch();
  }

  protected toggleCondition(target: DialogueNode | DialogueChoice) {
    target.requires = target.requires ? undefined : {};
    this.touch();
  }

  protected setCondition(cond: Condition, field: keyof Condition, value: string | number) {
    if (value === '' || value === null || value === 0) delete cond[field];
    else (cond as Record<string, unknown>)[field] = value;
    this.touch();
  }

  protected addEffect(choice: DialogueChoice, type: string) {
    if (!type) return;
    choice.effects.push(EFFECT_DEFAULTS[type as EffectType]());
    this.touch();
  }

  protected removeEffect(choice: DialogueChoice, i: number) {
    choice.effects.splice(i, 1);
    this.touch();
  }
}
