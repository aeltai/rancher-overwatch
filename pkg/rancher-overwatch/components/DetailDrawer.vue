<script>
import { CATEGORIES, LEVELS, describeRule } from '../rbac/rules.js';
import { effective, visibleGrants } from '../rbac/effective.js';
import { SUBJECT_COLORS, SUBJECT_ICONS, LAYER_COLORS, clip } from '../rbac/graph.js';

export default {
  name: 'DetailDrawer',

  props: {
    model:     { type: Object, required: true },
    opts:      { type: Object, required: true },
    selection: { type: Object, default: null }
  },

  emits: ['close', 'open-subject'],

  data() {
    return { CATEGORIES, LEVELS, SUBJECT_COLORS, SUBJECT_ICONS, LAYER_COLORS };
  },

  computed: {
    node() {
      return this.selection?.node || null;
    },
    edge() {
      return this.selection?.edge || null;
    },
    subject() {
      return this.node?.kind === 'subject' ? this.model.subjects[this.node.id] : null;
    },
    role() {
      return this.node?.kind === 'role' ? this.model.roles[this.node.id] : null;
    },
    eff() {
      return this.subject ? effective(this.model, this.subject.id, this.opts) : null;
    },
    boundTo() {
      if (!this.role) {
        return [];
      }

      return visibleGrants(this.model, { ...this.opts, hideSystem: false }).filter(g => g.roleId === this.role.id).map(g => ({ g, s: this.model.subjects[g.subjectId] }));
    },
    catRoles() {
      if (this.node?.kind !== 'category') {
        return [];
      }
      const cid = this.node.cat.id;
      const ids = new Set(visibleGrants(this.model, this.opts).map(g => g.roleId));

      return [...ids].map(id => this.model.roles[id]).filter(r => r?.cats[cid]?.level).sort((a, b) => b.cats[cid].level - a.cats[cid].level).map(r => ({ r, lv: r.cats[cid].level, verbs: [...r.cats[cid].verbs].filter(v => v !== '*').join(', ') || 'all verbs' }));
    },
    catLevels() {
      return this.eff ? CATEGORIES.map(c => ({ c, ...this.eff.cats[c.id] })).filter(x => x.level) : [];
    }
  },

  methods: { clip, describeRule }
};
</script>

<template>
  <aside
    v-if="selection"
    class="dd"
  >
    <button
      class="x"
      @click="$emit('close')"
    >
      ×
    </button>

    <!-- subject -->
    <template v-if="subject && eff">
      <div class="kicker">
        {{ subject.type === 'serviceaccount' ? 'Service account' : subject.type }}
      </div>
      <h3>{{ subject.label }}</h3>
      <div
        v-if="eff.admin"
        class="adm"
      >
        Full administrator
      </div>
      <h5>Reaches</h5>
      <div class="pills">
        <span
          v-for="x in catLevels"
          :key="x.c.id"
          class="pill"
          :style="{ borderColor: LEVELS[x.level].color, color: LEVELS[x.level].color }"
        >{{ x.c.label }} · {{ LEVELS[x.level].label }}<template v-if="!x.all"> (scoped)</template></span>
        <span
          v-if="!catLevels.length"
          class="muted"
        >nothing</span>
      </div>
      <h5>Bindings ({{ eff.grants.length }})</h5>
      <div class="list">
        <div
          v-for="g in eff.grants"
          :key="g.id"
          class="li"
        >
          <i
            class="dot"
            :style="{ background: LAYER_COLORS[g.layer] }"
          />
          <div>
            <b>{{ model.roles[g.roleId].label }}</b>
            <small>{{ g.scope.label }} · {{ g.kind }}</small>
          </div>
        </div>
      </div>
      <button
        class="btn role-primary open"
        @click="$emit('open-subject', subject.id)"
      >
        Open in subject explorer
      </button>
    </template>

    <!-- role -->
    <template v-else-if="role">
      <div class="kicker">
        {{ role.layer === 'rancher' ? 'Rancher' : 'Kubernetes' }} {{ role.kind }}
      </div>
      <h3>{{ role.label }}</h3>
      <p
        v-if="role.description"
        class="muted"
      >
        {{ role.description }}
      </p>
      <div class="flags">
        <span v-if="role.builtin">built-in</span><span v-if="role.aggregated">aggregated</span><span v-if="role.managed">Rancher-managed</span>
        <span v-if="role.isDefault">default</span><span v-if="role.wildcard">wildcards</span><span
          v-if="role.fullAdmin"
          class="red"
        >full admin</span>
        <span v-if="role.inheritedClusterRoles && role.inheritedClusterRoles.length">grants {{ role.inheritedClusterRoles.join(', ') }} on all clusters</span>
      </div>
      <h5>Bound to ({{ boundTo.length }})</h5>
      <div class="list short">
        <div
          v-for="b in boundTo"
          :key="b.g.id"
          class="li click"
          @click="$emit('open-subject', b.s.id)"
        >
          <i
            class="dot"
            :style="{ background: SUBJECT_COLORS[b.s.type] }"
          />
          <div><b>{{ b.s.label }}</b><small>{{ b.g.scope.label }}</small></div>
        </div>
        <div
          v-if="!boundTo.length"
          class="muted"
        >
          not bound to anything
        </div>
      </div>
      <h5>Rules ({{ role.rules.length }})</h5>
      <div class="rules">
        <div
          v-for="(r, i) in role.rules"
          :key="i"
          class="rule"
        >
          <div><span>groups</span>{{ describeRule(r).groups }}</div>
          <div><span>resources</span>{{ describeRule(r).resources }}</div>
          <div><span>verbs</span><b :class="{ red: (r.verbs || []).includes('*') }">{{ describeRule(r).verbs }}</b></div>
          <div v-if="describeRule(r).names">
            <span>names</span>{{ describeRule(r).names }}
          </div>
        </div>
      </div>
    </template>

    <!-- category -->
    <template v-else-if="node && node.kind === 'category'">
      <div class="kicker">
        Capability
      </div>
      <h3>{{ node.cat.label }}</h3>
      <p class="muted">
        {{ node.cat.hint }}
      </p>
      <h5>Roles that reach it</h5>
      <div class="list">
        <div
          v-for="x in catRoles"
          :key="x.r.id"
          class="li"
        >
          <i
            class="dot"
            :style="{ background: LEVELS[x.lv].color }"
          />
          <div><b>{{ x.r.label }}</b><small>{{ LEVELS[x.lv].label }} · {{ clip(x.verbs, 60) }}</small></div>
        </div>
      </div>
    </template>

    <!-- edge -->
    <template v-else-if="edge">
      <div class="kicker">
        Role bindings
      </div>
      <h3>{{ model.subjects[edge.source].label }} → {{ model.roles[edge.target].label }}</h3>
      <div class="list">
        <div
          v-for="g in edge.grants"
          :key="g.id"
          class="li"
        >
          <i
            class="dot"
            :style="{ background: LAYER_COLORS[g.layer] }"
          />
          <div>
            <b>{{ g.scope.label }}</b>
            <small>{{ g.kind }} · {{ g.name }}<template v-if="g.managed"> · generated by Rancher</template><template v-if="g.inherited"> · inherited</template></small>
          </div>
        </div>
      </div>
    </template>
  </aside>
</template>

<style scoped>
.dd { position: absolute; right: 12px; top: 12px; bottom: 12px; width: 340px; z-index: 6; overflow: auto; padding: 16px 18px 20px; border-radius: var(--border-radius, 4px); background: var(--rbx-card); border: 1px solid var(--rbx-border); box-shadow: 0 2px 10px rgba(0, 0, 0, .18); color: var(--rbx-text); }
.x { position: absolute; right: 10px; top: 6px; border: 0; background: transparent; color: var(--rbx-muted); cursor: pointer; font-size: 22px; line-height: 1; }
.kicker { font-size: 12px; color: var(--rbx-muted); } h3 { margin: 2px 0 8px; font-size: 18px; font-weight: 600; word-break: break-word; padding-right: 20px; }
h5 { margin: 16px 0 6px; font-size: 12px; font-weight: 600; color: var(--rbx-muted); border-bottom: 1px solid var(--rbx-border); padding-bottom: 4px; }
.muted { color: var(--rbx-muted); } .adm { display: inline-block; background: var(--rbx-bad); color: #fff; font-weight: 600; font-size: 12px; padding: 2px 9px; border-radius: 3px; }
.pills { display: flex; flex-wrap: wrap; gap: 6px; } .pill { border: 1px solid; border-radius: 3px; padding: 1px 8px; font-size: 12px; }
.list { display: flex; flex-direction: column; } .list.short { max-height: 190px; overflow: auto; }
.li { display: flex; gap: 10px; align-items: flex-start; padding: 6px 4px; border-bottom: 1px solid var(--rbx-border); } .li.click { cursor: pointer; } .li.click:hover { background: var(--rbx-hover); }
.li small { display: block; color: var(--rbx-muted); font-size: 11.5px; } .dot { width: 8px; height: 8px; border-radius: 2px; margin-top: 6px; flex: none; }
.open { margin-top: 16px; width: 100%; }
.flags { display: flex; gap: 6px; flex-wrap: wrap; } .flags span { font-size: 11.5px; padding: 1px 8px; border-radius: 3px; border: 1px solid var(--rbx-border); color: var(--rbx-muted); } .flags .red, .red { color: var(--rbx-bad); border-color: var(--rbx-bad); }
.rules { display: flex; flex-direction: column; gap: 6px; } .rule { font-size: 12px; padding: 7px 10px; border: 1px solid var(--rbx-border); border-radius: 3px; font-family: ui-monospace, Menlo, monospace; word-break: break-word; background: var(--rbx-bg); }
.rule span { display: inline-block; width: 66px; color: var(--rbx-muted); font-family: inherit; font-size: 11px; }
</style>
