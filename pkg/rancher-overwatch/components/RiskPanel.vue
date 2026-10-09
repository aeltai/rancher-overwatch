<script>
import { computeRisks, SEVERITY } from '../rbac/effective.js';
import { SUBJECT_COLORS, SUBJECT_ICONS, clip } from '../rbac/graph.js';

export default {
  name: 'RiskPanel',

  props: {
    model: { type: Object, required: true },
    opts:  { type: Object, required: true },
    events: { type: Array, default: () => [] }
  },

  emits: ['select-subject', 'select-role'],

  data() {
    return { SEVERITY, SUBJECT_COLORS, SUBJECT_ICONS };
  },

  computed: {
    findings() {
      return computeRisks(this.model, this.opts, this.events);
    },
    summary() {
      return Object.entries(SEVERITY).map(([k, v]) => ({ k, ...v, n: this.findings.filter(f => f.severity === k).length }));
    }
  },

  methods: {
    clip,
    sub(id) {
      return this.model.subjects[id];
    },
    role(id) {
      return this.model.roles[id];
    }
  }
};
</script>

<template>
  <div class="rp">
    <div class="sum">
      <div
        v-for="s in summary"
        :key="s.k"
        class="tile"
        :style="{ '--c': s.color }"
      >
        <b>{{ s.n }}</b><span>{{ s.label }}</span>
      </div>
    </div>

    <div
      v-if="!findings.length"
      class="banner success"
    >
      <span>Nothing suspicious found for the current filters.</span>
    </div>

    <article
      v-for="f in findings"
      :key="f.id"
      class="f"
      :style="{ '--c': SEVERITY[f.severity].color }"
    >
      <span class="sev">{{ SEVERITY[f.severity].label }}</span>
      <div class="body">
        <h4>{{ f.title }}</h4>
        <p>{{ f.detail }}</p>
        <div class="chips">
          <a
            v-for="id in f.subjects.slice(0, 14)"
            :key="id"
            class="chip"
            @click="$emit('select-subject', id)"
          >
            <i
              class="dot"
              :style="{ background: SUBJECT_COLORS[sub(id) && sub(id).type] }"
            />{{ clip(sub(id) ? sub(id).label : id, 26) }}
          </a>
          <span
            v-if="f.subjects.length > 14"
            class="more"
          >+{{ f.subjects.length - 14 }} more</span>
          <a
            v-for="id in f.roles.slice(0, 10)"
            :key="id"
            class="chip"
            @click="$emit('select-role', id)"
          >
            Role: {{ clip(role(id) ? role(id).label : id, 28) }}
          </a>
        </div>
      </div>
    </article>
  </div>
</template>

<style scoped>
.rp { display: flex; flex-direction: column; gap: 10px; color: var(--rbx-text); }
.sum { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin-bottom: 4px; }
.tile { border: 1px solid var(--rbx-border); border-top: 3px solid var(--c); border-radius: var(--border-radius, 4px); padding: 10px 14px; background: var(--rbx-card); }
.tile b { font-size: 24px; font-weight: 600; display: block; line-height: 1.2; } .tile span { color: var(--rbx-muted); }
.f { display: flex; gap: 14px; padding: 12px 16px; border: 1px solid var(--rbx-border); border-left: 4px solid var(--c); border-radius: var(--border-radius, 4px); background: var(--rbx-card); }
.sev { flex: none; align-self: flex-start; min-width: 56px; text-align: center; font-size: 11px; font-weight: 600; color: #fff; background: var(--c); border-radius: 3px; padding: 2px 8px; }
.body { min-width: 0; } .body h4 { margin: 0 0 2px; font-size: 14px; } .body p { margin: 0 0 8px; color: var(--rbx-muted); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { border: 1px solid var(--rbx-border); background: var(--rbx-bg); color: var(--rbx-text); border-radius: 3px; padding: 2px 9px; font-size: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.chip:hover { border-color: var(--rbx-accent); color: var(--rbx-accent); } .dot { width: 8px; height: 8px; border-radius: 2px; display: inline-block; } .more { color: var(--rbx-muted); align-self: center; }
@media (max-width: 800px) { .sum { grid-template-columns: repeat(2, 1fr); } }
</style>
