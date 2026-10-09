<script>
import { CATEGORIES, LEVELS } from '../rbac/rules.js';
import { visibleGrants, effective } from '../rbac/effective.js';
import { SUBJECT_COLORS, SUBJECT_ICONS, clip } from '../rbac/graph.js';

export default {
  name: 'PermissionMatrix',

  props: {
    model: { type: Object, required: true },
    opts:  { type: Object, required: true },
    view:  { type: Object, required: true }
  },

  emits: ['select'],

  data() {
    return { CATEGORIES, LEVELS, SUBJECT_COLORS, SUBJECT_ICONS, mark: ['', 'R', 'RW', 'ALL'] };
  },

  computed: {
    rows() {
      const q = (this.view.search || '').trim().toLowerCase();
      const ids = new Set(visibleGrants(this.model, this.opts).map(g => g.subjectId));
      const types = this.view.types;

      return [...ids]
        .map(id => this.model.subjects[id])
        .filter(s => s && types.has(s.type) && (!q || `${ s.label } ${ s.rawId } ${ s.id }`.toLowerCase().includes(q)))
        .map(s => ({ s, eff: effective(this.model, s.id, this.opts) }))
        .sort((a, b) => b.eff.power - a.eff.power || a.s.label.localeCompare(b.s.label))
        .slice(0, 120);
    },
    footer() {
      return CATEGORIES.map(c => this.rows.filter(r => r.eff.cats[c.id].all >= 2).length);
    }
  },

  methods: {
    clip,
    tip(cat, c) {
      const parts = [];

      c.all && parts.push(`${ LEVELS[c.all].label } — cluster / global wide`);
      c.limited && parts.push(`${ LEVELS[c.limited].label } — only within scope: ${ [...c.scopes].slice(0, 4).join(', ') }`);

      return parts.length ? `${ cat.label }\n${ parts.join('\n') }\nvia ${ [...c.roles].map(r => this.model.roles[r]?.label).slice(0, 5).join(', ') }` : `${ cat.label }: no access`;
    },
    cellStyle(c) {
      if (c.all) {
        return { background: LEVELS[c.all].color, color: '#fff' };
      }
      if (c.limited) {
        return { border: `1.5px dashed ${ LEVELS[c.limited].color }`, color: LEVELS[c.limited].color };
      }

      return {};
    }
  }
};
</script>

<template>
  <div class="pm">
    <div class="pm-intro">
      Strongest access each subject holds per capability area.
      <span class="k"><i class="solid" />Filled: cluster or global wide</span>
      <span class="k"><i class="striped" />Dashed: only inside a project or namespace</span>
      <span
        v-for="l in LEVELS.slice(1)"
        :key="l.id"
        class="k"
      ><i
        class="pip"
        :style="{ background: l.color }"
      />{{ l.label }}</span>
    </div>

    <div class="pm-scroll">
      <table>
        <thead>
          <tr>
            <th class="who">
              Subject
            </th>
            <th
              v-for="c in CATEGORIES"
              :key="c.id"
              :title="c.hint"
            >
              {{ c.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in rows"
            :key="r.s.id"
            @click="$emit('select', r.s.id)"
          >
            <td class="who">
              <i
                class="dot"
                :style="{ background: SUBJECT_COLORS[r.s.type] }"
              />
              <span class="nm">
                <b>{{ clip(r.s.label, 28) }}</b>
                <small>{{ r.s.type === 'serviceaccount' ? 'Service account · ' + r.s.namespace : r.s.type.charAt(0).toUpperCase() + r.s.type.slice(1) }}<template v-if="r.s.enabled === false"> · disabled</template></small>
              </span>
              <span
                v-if="r.eff.admin"
                class="adm"
              >ADMIN</span>
            </td>
            <td
              v-for="c in CATEGORIES"
              :key="c.id"
            >
              <div
                class="cell"
                :class="{ none: !r.eff.cats[c.id].level }"
                :style="cellStyle(r.eff.cats[c.id])"
                :title="tip(c, r.eff.cats[c.id])"
              >
                {{ mark[r.eff.cats[c.id].all || r.eff.cats[c.id].limited] }}
                <i
                  v-if="r.eff.cats[c.id].all && r.eff.cats[c.id].limited > r.eff.cats[c.id].all"
                  class="up"
                  :style="{ background: LEVELS[r.eff.cats[c.id].limited].color }"
                  title="Higher access inside a narrower scope"
                />
              </div>
            </td>
          </tr>
          <tr v-if="!rows.length">
            <td
              :colspan="CATEGORIES.length + 1"
              class="empty"
            >
              No subjects match the current filters.
            </td>
          </tr>
        </tbody>
        <tfoot v-if="rows.length">
          <tr>
            <td class="who">
              <small>Subjects with wide write access</small>
            </td>
            <td
              v-for="(n, i) in footer"
              :key="i"
            >
              <b>{{ n }}</b>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>

<style scoped>
.pm { color: var(--rbx-text); }
.pm-intro { display: flex; flex-wrap: wrap; gap: 6px 18px; align-items: center; color: var(--rbx-muted); padding: 0 2px 10px; }
.k { display: inline-flex; align-items: center; gap: 6px; }
.k i { width: 14px; height: 14px; border-radius: 3px; display: inline-block; }
.k i.solid { background: var(--rbx-muted); } .k i.striped { border: 1.5px dashed var(--rbx-muted); }
.k i.pip { height: 4px; width: 16px; border-radius: 2px; }
.pm-scroll { overflow: auto; max-height: max(520px, calc(100vh - 380px)); border: 1px solid var(--rbx-border); border-radius: var(--border-radius, 4px); background: var(--rbx-card); }
table { border-collapse: separate; border-spacing: 0; width: 100%; min-width: 980px; }
th { position: sticky; top: 0; z-index: 2; background: var(--rbx-head); font-size: 12px; font-weight: 600; padding: 10px 6px; color: var(--rbx-muted); text-align: center; border-bottom: 1px solid var(--rbx-border); }
th.who, td.who { position: sticky; left: 0; z-index: 3; background: var(--rbx-card); text-align: left; padding-left: 14px; min-width: 250px; white-space: nowrap; }
th.who { z-index: 4; background: var(--rbx-head); }
tbody tr { cursor: pointer; } tbody tr:hover td, tbody tr:hover td.who { background: var(--rbx-hover); }
td { padding: 6px; text-align: center; border-bottom: 1px solid var(--rbx-border); }
.dot { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 10px; vertical-align: middle; }
.nm { display: inline-flex; flex-direction: column; vertical-align: middle; line-height: 1.3; } .nm small, tfoot small { color: var(--rbx-muted); font-size: 11.5px; }
.adm { margin-left: 8px; background: var(--rbx-bad); color: #fff; font-size: 9.5px; font-weight: 700; padding: 1px 6px; border-radius: 3px; vertical-align: middle; }
.cell { position: relative; margin: 0 auto; width: 48px; height: 24px; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 10.5px; font-weight: 700; box-sizing: border-box; }
.cell.none { background: var(--rbx-head); }
.cell .up { position: absolute; right: -3px; top: -3px; width: 8px; height: 8px; border-radius: 50%; border: 2px solid var(--rbx-card); }
.empty { padding: 40px; color: var(--rbx-muted); text-align: center; }
tfoot td { border-bottom: 0; position: sticky; bottom: 0; background: var(--rbx-head); z-index: 2; font-weight: 600; } tfoot td.who { z-index: 3; background: var(--rbx-head); }
</style>
