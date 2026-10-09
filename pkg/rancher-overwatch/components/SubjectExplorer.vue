<script>
import { CATEGORIES, LEVELS, GRID_VERBS, categorize, CATEGORY_BY_ID } from '../rbac/rules.js';
import { visibleGrants, effective, explain, permissionGrid } from '../rbac/effective.js';
import { SUBJECT_COLORS, SUBJECT_ICONS, LAYER_COLORS, clip } from '../rbac/graph.js';
import { describe } from '../rbac/audit.js';

const QUICK = [
  { l: 'Create pods', g: '', r: 'pods', v: 'create' },
  { l: 'Edit deployments', g: 'apps', r: 'deployments', v: 'patch' },
  { l: 'Read secrets', g: '', r: 'secrets', v: 'get' },
  { l: 'Exec into pods', g: '', r: 'pods/exec', v: 'create' },
  { l: 'Delete namespaces', g: '', r: 'namespaces', v: 'delete' },
  { l: 'See nodes', g: '', r: 'nodes', v: 'list' },
  { l: 'Manage RBAC', g: 'rbac.authorization.k8s.io', r: 'clusterrolebindings', v: 'create' },
  { l: 'Create Rancher clusters', g: 'management.cattle.io', r: 'clusters', v: 'create' },
  { l: 'List Rancher users', g: 'management.cattle.io', r: 'users', v: 'list' },
  { l: 'Deploy via Fleet', g: 'fleet.cattle.io', r: 'gitrepos', v: 'create' }
];

export default {
  name: 'SubjectExplorer',

  props: {
    model:     { type: Object, required: true },
    opts:      { type: Object, required: true },
    subjectId: { type: String, default: null },
    events:    { type: Array, default: () => [] }
  },

  emits: ['select', 'open-audit'],

  data() {
    return {
      q: '', onlyGranted: true, CATEGORIES, LEVELS, GRID_VERBS, SUBJECT_COLORS, SUBJECT_ICONS, LAYER_COLORS
    };
  },

  computed: {
    list() {
      const q = this.q.trim().toLowerCase();
      const ids = new Set(visibleGrants(this.model, this.opts).map(g => g.subjectId));

      Object.values(this.model.subjects).filter(s => s.type === 'token').forEach(s => ids.add(s.id));

      return [...ids].map(i => this.model.subjects[i]).filter(s => s && (!q || `${ s.label } ${ s.rawId } ${ s.type }`.toLowerCase().includes(q)))
        .sort((a, b) => ['user', 'group', 'serviceaccount', 'token'].indexOf(a.type) - ['user', 'group', 'serviceaccount', 'token'].indexOf(b.type) || a.label.localeCompare(b.label));
    },
    sel() {
      return this.model.subjects[this.subjectId] || null;
    },
    eff() {
      return this.sel ? effective(this.model, this.sel.id, this.opts) : null;
    },
    owner() {
      return this.sel?.type === 'token' ? this.model.subjects[this.sel.owner] : null;
    },
    bindings() {
      return (this.eff?.grants || []).map(g => ({ g, role: this.model.roles[g.roleId] }))
        .sort((a, b) => b.role.power - a.role.power);
    },
    quick() {
      if (!this.eff) {
        return [];
      }

      return QUICK.map(q => ({ ...q, ...explain(this.model, this.eff.grants, q.g, q.r, q.v) }));
    },
    grid() {
      if (!this.sel) {
        return [];
      }
      const rows = permissionGrid(this.model, this.sel.id, this.opts).map(r => ({ ...r, cat: categorize(r.group, r.resource) }));

      return this.onlyGranted ? rows.filter(r => GRID_VERBS.some(v => r.cells[v].state !== 'none')) : rows;
    },
    activity() {
      const id = this.sel?.type === 'token' ? this.sel.owner : this.sel?.id;

      return this.events.filter(e => e.subjectId === id).sort((a, b) => b.time - a.time);
    },
    tokens() {
      return (this.sel?.tokens || []).map(t => this.model.subjects[t]);
    },
    radar() {
      const n = CATEGORIES.length, R = 84, cx = 175, cy = 130;
      const pt = (i, f) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;

        return [cx + Math.cos(a) * R * f, cy + Math.sin(a) * R * f];
      };
      const poly = key => CATEGORIES.map((cat, i) => pt(i, (this.eff?.cats[cat.id][key] || 0) / 3).join(',')).join(' ');

      return {
        rings:   [1, 2, 3].map(l => CATEGORIES.map((_, i) => pt(i, l / 3).join(',')).join(' ')),
        spokes:  CATEGORIES.map((cat, i) => {
          const p = pt(i, 1.17);

          return { from: pt(i, 0), to: pt(i, 1), label: p, anchor: p[0] < cx - 6 ? 'end' : p[0] > cx + 6 ? 'start' : 'middle', cat };
        }),
        all:     poly('all'),
        limited: poly('level')
      };
    }
  },

  methods: {
    clip,
    describe,
    fmtT(t) {
      return new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    },
    levelColor: l => LEVELS[l].color,
    fmtDate(d) {
      return d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
    },
    ttlText(t) {
      if (t.expired) {
        return 'expired';
      }

      return t.ttl ? `${ Math.round(t.ttl / 864e5) } days` : 'never expires';
    },
    cellTip(cell) {
      return cell.via.map(v => `${ v.role.label }  ·  ${ v.grant.scope.label }${ v.named ? '  (named resources only)' : '' }`).join('\n') || 'no access';
    },
    catColor: id => CATEGORY_BY_ID[id].color
  }
};
</script>

<template>
  <div class="se">
    <aside class="se-list">
      <input
        v-model="q"
        type="search"
        placeholder="Find user, group, service account, token…"
      >
      <div class="se-scroll">
        <button
          v-for="s in list"
          :key="s.id"
          class="se-item"
          :class="{ on: s.id === subjectId }"
          @click="$emit('select', s.id)"
        >
          <i
            class="av"
            :style="{ background: SUBJECT_COLORS[s.type] }"
          />
          <span class="nm"><b>{{ clip(s.label, 24) }}</b><small>{{ s.type === 'serviceaccount' ? 'sa · ' + s.namespace : s.type }}{{ s.enabled === false ? ' · disabled' : '' }}</small></span>
        </button>
        <div
          v-if="!list.length"
          class="muted pad"
        >
          Nothing found.
        </div>
      </div>
    </aside>

    <section
      v-if="sel && eff"
      class="se-main"
    >
      <header class="hero">
        <div
          class="big-av"
          :style="{ background: SUBJECT_COLORS[sel.type] }"
        />
        <div class="hero-t">
          <h2>{{ sel.label }}</h2>
          <div class="chips">
            <span
              class="chip"
              :style="{ color: SUBJECT_COLORS[sel.type], borderColor: SUBJECT_COLORS[sel.type] + '66' }"
            >{{ sel.type === 'serviceaccount' ? 'service account' : sel.type }}</span>
            <span
              v-if="sel.username && sel.username !== sel.label"
              class="chip"
            >@{{ sel.username }}</span>
            <span
              v-if="sel.provider"
              class="chip"
            >{{ sel.provider }}</span>
            <span
              v-if="sel.namespace"
              class="chip"
            >ns: {{ sel.namespace }}</span>
            <span
              v-if="sel.external"
              class="chip warn"
            >not a Rancher user</span>
            <span
              v-if="sel.enabled === false"
              class="chip warn"
            >disabled</span>
            <span
              v-if="eff.admin"
              class="chip admin"
            >FULL ADMIN</span>
          </div>
          <div
            v-if="owner"
            class="muted small"
          >
            API token acting as
            <a @click="$emit('select', owner.id)">{{ owner.label }}</a>
            <template v-if="sel.token.cluster">
              · restricted to cluster <b>{{ model.clusters[sel.token.cluster] ? model.clusters[sel.token.cluster].name : sel.token.cluster }}</b>
            </template>
          </div>
          <div
            v-if="sel.type === 'group'"
            class="muted small"
          >
            Every member of this group inherits the access below.
          </div>
        </div>
        <div class="stats">
          <div><b>{{ bindings.length }}</b><span>bindings</span></div>
          <div><b>{{ new Set(bindings.map(b => b.role.id)).size }}</b><span>roles</span></div>
          <div><b>{{ new Set(bindings.map(b => b.g.scope.label)).size }}</b><span>scopes</span></div>
          <div v-if="sel.type === 'user'">
            <b>{{ tokens.length }}</b><span>tokens</span>
          </div>
        </div>
      </header>

      <div
        v-if="eff.special.length"
        class="banner warning"
      ><span>
        Holds privilege-escalation verbs: <b>{{ eff.special.join(', ') }}</b> — can grant itself or others more access.</span>
      </div>

      <div class="row2">
        <div class="card radar-card">
          <h4>Capability footprint</h4>
          <svg
            viewBox="0 0 350 262"
            class="radar"
          >
            <polygon
              v-for="(r, i) in radar.rings"
              :key="i"
              :points="r"
              class="ring"
            />
            <line
              v-for="s in radar.spokes"
              :key="s.cat.id"
              :x1="s.from[0]"
              :y1="s.from[1]"
              :x2="s.to[0]"
              :y2="s.to[1]"
              class="spoke"
            />
            <polygon
              :points="radar.limited"
              class="shape lim"
            />
            <polygon
              :points="radar.all"
              class="shape all"
            />
            <g
              v-for="s in radar.spokes"
              :key="'l' + s.cat.id"
            >
              <text
                :x="s.label[0]"
                :y="s.label[1]"
                :text-anchor="s.anchor"
                dominant-baseline="middle"
                class="rl"
              >{{ s.cat.label }}</text>
            </g>
          </svg>
          <div class="rlegend">
            <span><i class="all" />cluster / global wide</span>
            <span><i class="lim" />incl. project / namespace scoped</span>
          </div>
          <div class="axis-names">
            <span
              v-for="c in CATEGORIES"
              :key="c.id"
              :class="{ off: !eff.cats[c.id].level }"
            >{{ c.label }}</span>
          </div>
        </div>

        <div class="card">
          <h4>Quick answers</h4>
          <div class="quick">
            <div
              v-for="q in quick"
              :key="q.l"
              class="qa"
              :class="q.state"
              :title="cellTip(q)"
            >
              <span class="ql">{{ q.l }}</span>
              <small>{{ q.state === 'all' ? 'Yes, everywhere' : q.state === 'limited' ? 'Scoped only' : 'No' }}</small>
            </div>
          </div>

          <h4 style="margin-top:18px">
            How access is granted
          </h4>
          <div class="bind-scroll">
            <table class="bt">
              <thead>
                <tr><th /><th>Binding</th><th>Role</th><th>Scope</th></tr>
              </thead>
              <tbody>
                <tr
                  v-for="b in bindings"
                  :key="b.g.id"
                >
                  <td><span
                    class="dot"
                    :style="{ background: LAYER_COLORS[b.g.layer] }"
                    :title="b.g.layer === 'rancher' ? 'Rancher RBAC' : 'Kubernetes RBAC'"
                  /></td>
                  <td>
                    <b>{{ clip(b.g.name, 26) }}</b>
                    <small>{{ b.g.kind }}</small>
                  </td>
                  <td>
                    {{ b.role.label }}
                    <span
                      v-if="b.role.fullAdmin"
                      class="mini-adm"
                    >admin</span>
                    <span
                      class="lv"
                      :style="{ background: levelColor(b.role.power) }"
                      :title="LEVELS[b.role.power].label"
                    />
                  </td>
                  <td :class="{ wide: b.g.scope.type === 'global' || b.g.scope.type === 'cluster' }">
                    {{ b.g.scope.label }}
                  </td>
                </tr>
                <tr v-if="!bindings.length">
                  <td
                    colspan="4"
                    class="muted pad"
                  >
                    No bindings in the current filter (layer / cluster).
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div
        v-if="sel.type === 'user' && tokens.length"
        class="card"
      >
        <h4>API tokens</h4>
        <table class="bt">
          <thead>
            <tr><th>Description</th><th>Lifetime</th><th>Created</th><th>Last used</th><th>Cluster scope</th></tr>
          </thead>
          <tbody>
            <tr
              v-for="t in tokens"
              :key="t.id"
              @click="$emit('select', t.id)"
            >
              <td><b>{{ t.label }}</b></td>
              <td :class="{ bad: !t.token.ttl && !t.token.expired, muted: t.token.expired }">
                {{ ttlText(t.token) }}
              </td>
              <td>{{ fmtDate(t.token.created) }}</td>
              <td>{{ fmtDate(t.token.lastUsed) }}</td>
              <td>{{ t.token.cluster ? (model.clusters[t.token.cluster] ? model.clusters[t.token.cluster].name : t.token.cluster) : 'all clusters' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div
        v-if="events.length"
        class="card"
      >
        <div class="grid-head">
          <h4>Recent activity</h4>
          <span class="muted small">{{ activity.length }} events · {{ activity.filter(e => e.write).length }} changes · {{ activity.filter(e => e.denied).length }} denied in the loaded audit window</span>
          <a
            class="legend"
            @click="$emit('open-audit', sel.type === 'token' ? sel.owner : sel.id)"
          >Open in audit log</a>
        </div>
        <table
          v-if="activity.length"
          class="bt"
        >
          <thead>
            <tr><th>Time</th><th>Action</th><th>Target</th><th>Result</th></tr>
          </thead>
          <tbody>
            <tr
              v-for="e in activity.slice(0, 8)"
              :key="e.id"
            >
              <td>{{ fmtT(e.time) }}</td>
              <td>{{ describe(e).what }}</td>
              <td>{{ clip(describe(e).target, 40) }}</td>
              <td :class="{ bad: e.denied }">
                {{ e.code || '–' }}
              </td>
            </tr>
          </tbody>
        </table>
        <div
          v-else
          class="muted small"
        >
          No requests by this subject in the loaded audit window{{ eff.admin ? ', although it holds full administrator rights' : '' }}.
        </div>
      </div>

      <div class="card">
        <div class="grid-head">
          <h4>Effective permissions</h4>
          <label><input
            v-model="onlyGranted"
            type="checkbox"
          > only resources with access</label>
          <span class="legend"><b class="g all">●</b> everywhere <b class="g lim">◐</b> scoped (project/namespace/named) <b class="g none">–</b> none</span>
        </div>
        <div class="grid-scroll">
          <table class="pg">
            <thead>
              <tr>
                <th>Resource</th>
                <th
                  v-for="v in GRID_VERBS"
                  :key="v"
                >
                  {{ v }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="r in grid"
                :key="r.group + '/' + r.resource"
              >
                <td
                  class="res"
                  :style="{ borderLeftColor: catColor(r.cat) }"
                >
                  {{ r.label }}
                  <small>{{ r.group || 'core' }}</small>
                </td>
                <td
                  v-for="v in GRID_VERBS"
                  :key="v"
                  :title="cellTip(r.cells[v])"
                >
                  <span
                    class="g"
                    :class="r.cells[v].state"
                  >{{ r.cells[v].state === 'all' ? '●' : r.cells[v].state === 'limited' ? '◐' : '–' }}</span>
                </td>
              </tr>
              <tr v-if="!grid.length">
                <td
                  :colspan="GRID_VERBS.length + 1"
                  class="muted pad"
                >
                  No resource access in the current filter.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section
      v-else
      class="se-main empty"
    >
      <div class="big">
        ◌
      </div>
      Pick a user, group, service account or token to see exactly what it can see, create and delete.
    </section>
  </div>
</template>

<style scoped>
.se { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 16px; color: var(--rbx-text); align-items: start; }
@media (max-width: 1000px) { .se { grid-template-columns: 1fr; } }
.se-list { border: 1px solid var(--rbx-border); border-radius: var(--border-radius, 4px); background: var(--rbx-card); padding: 10px; position: sticky; top: 8px; }
.se-list input { width: 100%; box-sizing: border-box; padding: 7px 10px; border-radius: var(--border-radius, 4px); border: 1px solid var(--input-border, var(--rbx-border)); background: var(--input-bg, var(--rbx-card)); color: var(--rbx-text); margin-bottom: 8px; font: inherit; }
.se-scroll { max-height: 620px; overflow: auto; display: flex; flex-direction: column; }
.se-item { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border: 0; border-bottom: 1px solid var(--rbx-border); background: transparent; color: inherit; cursor: pointer; text-align: left; font: inherit; }
.se-item:hover { background: var(--rbx-hover); } .se-item.on { background: var(--rbx-hover); box-shadow: inset 3px 0 0 var(--rbx-accent); }
.av { display: inline-block; width: 9px; height: 9px; border-radius: 2px; flex: none; }
.nm { display: flex; flex-direction: column; line-height: 1.3; min-width: 0; } .nm small { color: var(--rbx-muted); font-size: 11.5px; }
.se-main { min-width: 0; display: flex; flex-direction: column; gap: 14px; }
.se-main.empty { align-items: center; justify-content: center; min-height: 320px; color: var(--rbx-muted); border: 1px dashed var(--rbx-border); border-radius: var(--border-radius, 4px); text-align: center; padding: 20px; }
.hero { display: flex; gap: 16px; align-items: center; padding: 16px 20px; border: 1px solid var(--rbx-border); border-radius: var(--border-radius, 4px); background: var(--rbx-card); flex-wrap: wrap; }
.big-av { width: 6px; align-self: stretch; border-radius: 3px; flex: none; }
.hero-t { flex: 1; min-width: 220px; } .hero-t h2 { margin: 0 0 6px; font-size: 20px; font-weight: 600; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; }
.chip { font-size: 12px; padding: 1px 8px; border-radius: 3px; border: 1px solid var(--rbx-border); color: var(--rbx-muted); }
.chip.warn { color: var(--rbx-warn); border-color: var(--rbx-warn); } .chip.admin { color: #fff; background: var(--rbx-bad); border-color: var(--rbx-bad); font-weight: 600; }
.muted { color: var(--rbx-muted); } .small { font-size: 12.5px; } .pad { padding: 14px; } a { color: var(--rbx-accent); cursor: pointer; }
.stats { display: flex; gap: 24px; } .stats div { text-align: center; } .stats b { display: block; font-size: 22px; font-weight: 600; } .stats span { font-size: 12px; color: var(--rbx-muted); }
.banner { margin: 0; }
.row2 { display: grid; grid-template-columns: 370px minmax(0, 1fr); gap: 14px; }
@media (max-width: 1250px) { .row2 { grid-template-columns: 1fr; } }
.card { border: 1px solid var(--rbx-border); border-radius: var(--border-radius, 4px); background: var(--rbx-card); padding: 14px 18px; min-width: 0; }
.card h4 { margin: 0 0 10px; font-size: 14px; font-weight: 600; }
.radar { width: 100%; max-width: 380px; display: block; margin: 0 auto; }
.ring { fill: none; stroke: var(--rbx-border); stroke-width: 1; } .spoke { stroke: var(--rbx-border); stroke-width: 1; }
.shape.all { fill: rgba(217, 69, 63, .22); stroke: var(--rbx-bad); stroke-width: 2; } .shape.lim { fill: rgba(221, 155, 46, .10); stroke: var(--rbx-warn); stroke-width: 1.5; stroke-dasharray: 4 3; }
.rl { font-size: 10.5px; fill: var(--rbx-muted); }
.rlegend { display: flex; gap: 14px; justify-content: center; font-size: 12px; color: var(--rbx-muted); margin-top: 2px; }
.rlegend i { display: inline-block; width: 12px; height: 8px; border-radius: 2px; margin-right: 5px; } .rlegend i.all { background: rgba(217, 69, 63, .3); border: 1px solid var(--rbx-bad); } .rlegend i.lim { border: 1px dashed var(--rbx-warn); }
.axis-names { display: none; }
.quick { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
.qa { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 7px 10px; border: 1px solid var(--rbx-border); border-left-width: 4px; border-radius: 3px; }
.qa small { font-size: 12px; color: var(--rbx-muted); } .qa .ql { font-weight: 600; }
.qa.all { border-left-color: var(--rbx-ok); } .qa.all small { color: var(--rbx-ok); font-weight: 600; }
.qa.limited { border-left-color: var(--rbx-warn); } .qa.limited small { color: var(--rbx-warn); font-weight: 600; }
.qa.none { border-left-color: var(--rbx-border); }
.bind-scroll { max-height: 270px; overflow: auto; }
.bt { width: 100%; border-collapse: collapse; } .bt th { text-align: left; font-size: 12px; font-weight: 600; color: var(--rbx-muted); padding: 6px 8px; position: sticky; top: 0; background: var(--rbx-head); }
.bt td { padding: 7px 8px; border-top: 1px solid var(--rbx-border); vertical-align: middle; } .bt td small { display: block; color: var(--rbx-muted); font-size: 11.5px; }
.bt tbody tr:hover { background: var(--rbx-hover); } .bad { color: var(--rbx-warn); font-weight: 600; }
.dot { display: inline-block; width: 9px; height: 9px; border-radius: 2px; } .lv { display: inline-block; width: 12px; height: 4px; border-radius: 2px; margin-left: 7px; vertical-align: middle; }
.mini-adm { background: var(--rbx-bad); color: #fff; font-size: 9.5px; font-weight: 700; padding: 0 5px; border-radius: 3px; margin-left: 6px; text-transform: uppercase; } td.wide { font-weight: 600; }
.grid-head { display: flex; gap: 18px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; } .grid-head h4 { margin: 0; } .grid-head label { color: var(--rbx-muted); } .grid-head input { accent-color: var(--rbx-accent); } .legend { margin-left: auto; font-size: 12px; color: var(--rbx-muted); }
.grid-scroll { max-height: 520px; overflow: auto; } .pg { width: 100%; border-collapse: collapse; }
.pg th { position: sticky; top: 0; background: var(--rbx-head); font-size: 12px; font-weight: 600; color: var(--rbx-muted); padding: 7px 4px; z-index: 1; }
.pg th:first-child, .pg td.res { text-align: left; padding-left: 10px; }
.pg td { text-align: center; padding: 5px 4px; border-top: 1px solid var(--rbx-border); } .pg td.res { border-left: 3px solid var(--rbx-border); font-weight: 600; } .pg td.res small { margin-left: 6px; color: var(--rbx-muted); font-weight: normal; font-size: 11px; }
.g { font-size: 14px; } .g.all { color: var(--rbx-ok); } .g.limited, .g.lim { color: var(--rbx-warn); } .g.none { color: var(--rbx-muted); opacity: .5; }
.pg tbody tr:hover { background: var(--rbx-hover); }
</style>
