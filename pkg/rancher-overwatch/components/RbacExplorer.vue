<script>
import AccessGraph from './AccessGraph.vue';
import PermissionMatrix from './PermissionMatrix.vue';
import SubjectExplorer from './SubjectExplorer.vue';
import RiskPanel from './RiskPanel.vue';
import AuditPanel from './AuditPanel.vue';
import DetailDrawer from './DetailDrawer.vue';
import { buildGraph, layoutGraph, SUBJECT_COLORS } from '../rbac/graph.js';
import { computeRisks, visibleGrants } from '../rbac/effective.js';

export default {
  name: 'RbacExplorer',

  components: {
    AccessGraph, PermissionMatrix, SubjectExplorer, RiskPanel, DetailDrawer, AuditPanel
  },

  props: {
    model:          { type: Object, required: true },
    loading:        { type: Boolean, default: false },
    loadingCluster: { type: Boolean, default: false },
    demo:           { type: Boolean, default: false },
    canToggleDemo:  { type: Boolean, default: false },
    initialCluster: { type: String, default: 'local' },
    auditEvents:    { type: Array, default: () => [] },
    auditLoading:   { type: Boolean, default: false },
    auditError:     { type: String, default: '' },
    auditSource:    { type: String, default: '' },
    access:         { type: Object, default: () => ({ level: 'admin', allowed: true, canAudit: true, label: 'Administrator', detail: '', hidden: [] }) },
    viewAs:         { type: String, default: 'admin' },
    viewAsOptions:  { type: Array, default: () => [] }
  },

  emits: ['update:cluster', 'refresh', 'toggle-demo', 'load-audit', 'import-audit', 'update:viewAs'],

  data() {
    return {
      tab:     'graph',
      opts:    { layer: 'both', cluster: this.initialCluster, hideSystem: true, hideManaged: true },
      search:  '',
      types:   ['user', 'group', 'serviceaccount'],
      showTokens: false,
      selection: null,
      exSubject: null,
      auditSubject: null,
      showErrors: false,
      SUBJECT_COLORS
    };
  },

  computed: {
    viewObj() {
      return { search: this.search, types: new Set(this.types), showTokens: this.showTokens, maxSubjects: 40 };
    },
    graph() {
      return layoutGraph(buildGraph(this.model, this.opts, this.viewObj), { pad: 44, nodeH: 40, gapY: 9 });
    },
    clusterOptions() {
      return Object.values(this.model.clusters).sort((a, b) => (b.local - a.local) || a.name.localeCompare(b.name));
    },
    k8sMissing() {
      const c = this.opts.cluster;

      return this.access.allowed && this.opts.layer !== 'rancher' && !this.loadingCluster && c !== 'all' && !this.model.k8sLoaded.includes(c);
    },
    errors() {
      return Object.entries(this.model.errors || {});
    },
    riskBadge() {
      const f = computeRisks(this.model, this.opts, this.auditEvents);

      return f.filter(x => x.severity === 'critical' || x.severity === 'high').length;
    },
    stats() {
      const c = this.model.counts;

      return [
        { l: 'users', v: c.users }, { l: 'groups', v: c.groups }, { l: 'service accounts', v: c.sas },
        { l: 'API tokens', v: c.tokens }, { l: 'roles', v: c.roles }, { l: 'bindings', v: c.grants }
      ];
    },
    tabList() {
      return [['graph', 'Access graph'], ['matrix', 'Permission matrix'], ['explorer', 'Subject explorer'], ...(this.access.canAudit ? [['audit', 'Audit log']] : []), ['risks', 'Findings']];
    },
    accessBanner() {
      return this.access.level === 'admin' ? 'info' : this.access.level === 'none' ? 'error' : 'warning';
    },
    visibleCount() {
      return visibleGrants(this.model, this.opts).length;
    }
  },

  watch: {
    'opts.cluster'(c) {
      this.$emit('update:cluster', c);
    },
    'access.canAudit'(v) {
      if (!v && this.tab === 'audit') {
        this.tab = 'graph';
      }
    },
    'opts.layer'() {
      this.$emit('update:cluster', this.opts.cluster);
    }
  },

  mounted() {
    this.$emit('update:cluster', this.opts.cluster);
  },

  methods: {
    toggleType(t) {
      this.types = this.types.includes(t) ? this.types.filter(x => x !== t) : [...this.types, t];
    },
    openSubject(id) {
      this.exSubject = id;
      this.tab = 'explorer';
      this.selection = null;
    },
    openAudit(id) {
      this.auditSubject = id;
      this.tab = 'audit';
    },
    focusRole(id) {
      this.search = this.model.roles[id]?.label || '';
      this.tab = 'graph';
    },
    reset() {
      this.search = '';
      this.types = ['user', 'group', 'serviceaccount'];
      this.showTokens = false;
      this.selection = null;
      this.opts = { ...this.opts, layer: 'both', hideSystem: true, hideManaged: true };
    }
  }
};
</script>

<template>
  <div class="rbx">
    <header class="page-head">
      <div>
        <h1>Rancher Overwatch</h1>
        <p class="sub">
          See who can do what across Rancher and Kubernetes, and what they actually did.
        </p>
      </div>
      <div class="head-actions">
        <label
          v-if="viewAsOptions.length"
          class="viewas"
          title="Demo only: preview what Rancher would show to this kind of account"
        >
          <span>View as</span>
          <select
            :value="viewAs"
            @change="$emit('update:viewAs', $event.target.value)"
          >
            <option
              v-for="o in viewAsOptions"
              :key="o.id"
              :value="o.id"
            >{{ o.label }}</option>
          </select>
        </label>
        <button
          v-if="canToggleDemo"
          class="btn role-secondary"
          :class="{ 'is-on': demo }"
          @click="$emit('toggle-demo')"
        >
          {{ demo ? 'Use live data' : 'Show demo data' }}
        </button>
        <button
          class="btn role-primary"
          :disabled="loading"
          @click="$emit('refresh')"
        >
          Refresh
        </button>
      </div>
    </header>

    <div
      class="banner"
      :class="accessBanner"
    >
      <span><b>{{ access.label }}.</b> {{ access.detail }}</span>
    </div>

    <div
      v-if="access.allowed"
      class="summary"
    >
      <span
        v-for="s in stats"
        :key="s.l"
      ><b>{{ s.v }}</b> {{ s.l }}</span>
    </div>

    <section
      v-if="access.allowed"
      class="bar"
    >
      <div
        class="seg"
        role="group"
        title="Which RBAC layer to show"
      >
        <button
          v-for="l in [['rancher', 'Rancher'], ['both', 'Both'], ['k8s', 'Kubernetes']]"
          :key="l[0]"
          :class="{ on: opts.layer === l[0] }"
          @click="opts.layer = l[0]"
        >
          {{ l[1] }}
        </button>
      </div>
      <label class="field">
        <span>Cluster</span>
        <select v-model="opts.cluster">
          <option value="all">All clusters</option>
          <option
            v-for="c in clusterOptions"
            :key="c.id"
            :value="c.id"
          >{{ c.name }}</option>
        </select>
      </label>
      <input
        v-model="search"
        class="search"
        type="search"
        placeholder="Filter by subject, role or scope"
      >
      <div class="checks">
        <label
          v-for="t in [['user', 'Users'], ['group', 'Groups'], ['serviceaccount', 'Service accounts']]"
          :key="t[0]"
          class="chk"
        >
          <input
            type="checkbox"
            :checked="types.includes(t[0])"
            @change="toggleType(t[0])"
          >
          <i
            class="swatch"
            :style="{ background: SUBJECT_COLORS[t[0]] }"
          />{{ t[1] }}
        </label>
        <label class="chk"><input
          v-model="showTokens"
          type="checkbox"
        ><i
          class="swatch"
          :style="{ background: SUBJECT_COLORS.token }"
        />API tokens</label>
        <span class="vsep" />
        <label class="chk"><input
          v-model="opts.hideSystem"
          type="checkbox"
        > Hide system</label>
        <label
          class="chk"
          :class="{ dis: opts.layer !== 'both' }"
          title="Kubernetes bindings that Rancher generated from its own bindings (crb-… / rb-…) duplicate the Rancher layer"
        ><input
          v-model="opts.hideManaged"
          type="checkbox"
          :disabled="opts.layer !== 'both'"
        > Hide Rancher-generated</label>
        <a
          class="reset"
          @click="reset"
        >Reset</a>
      </div>
    </section>

    <div
      v-if="demo"
      class="banner info"
    >
      <span>Showing built-in demo data, not the data of this Rancher.</span>
    </div>
    <div
      v-if="loadingCluster"
      class="banner info"
    >
      <span>Reading Kubernetes RBAC from the selected cluster…</span>
    </div>
    <div
      v-else-if="k8sMissing"
      class="banner warning"
    >
      <span>Kubernetes RBAC for this cluster is not available (cluster unreachable or insufficient permissions). Showing Rancher RBAC only.</span>
    </div>
    <div
      v-if="errors.length"
      class="banner warning"
    >
      <span>
        <a @click="showErrors = !showErrors">{{ errors.length }} data source{{ errors.length === 1 ? '' : 's' }} could not be read</a>.
        You may only see what your own account is allowed to see.
        <ul v-if="showErrors">
          <li
            v-for="[k, v] in errors"
            :key="k"
          ><code>{{ k }}</code>: {{ v }}</li>
        </ul>
      </span>
    </div>

    <ul
      v-if="access.allowed"
      class="tabs"
    >
      <li
        v-for="t in tabList"
        :key="t[0]"
        :class="{ active: tab === t[0] }"
        @click="tab = t[0]"
      >
        {{ t[1] }}<span
          v-if="t[0] === 'risks' && riskBadge"
          class="count-badge"
        >{{ riskBadge }}</span>
      </li>
      <li class="spacer">
        {{ visibleCount }} bindings in view
      </li>
    </ul>

    <div
      v-if="loading && access.allowed"
      class="loading"
    >
      <i class="icon icon-spinner icon-spin" /> Reading Rancher RBAC…
    </div>

    <main v-else-if="access.allowed">
      <div
        v-show="tab === 'graph'"
        class="stage"
      >
        <AccessGraph
          :graph="graph"
          :selected-id="selection && selection.node ? selection.node.id : null"
          @select-node="n => selection = { node: n }"
          @select-edge="e => selection = { edge: e }"
          @clear="selection = null"
        />
        <DetailDrawer
          :model="model"
          :opts="opts"
          :selection="selection"
          @close="selection = null"
          @open-subject="openSubject"
        />
      </div>
      <PermissionMatrix
        v-if="tab === 'matrix'"
        :model="model"
        :opts="opts"
        :view="viewObj"
        @select="openSubject"
      />
      <SubjectExplorer
        v-if="tab === 'explorer'"
        :model="model"
        :opts="opts"
        :subject-id="exSubject"
        :events="auditEvents"
        @select="id => exSubject = id"
        @open-audit="openAudit"
      />
      <AuditPanel
        v-if="tab === 'audit'"
        :model="model"
        :events="auditEvents"
        :loading="auditLoading"
        :error="auditError"
        :source="auditSource"
        :subject-filter="auditSubject"
        @load="$emit('load-audit')"
        @import="(t, n) => $emit('import-audit', t, n)"
        @open-subject="openSubject"
        @clear-subject="auditSubject = null"
      />
      <RiskPanel
        v-if="tab === 'risks'"
        :model="model"
        :opts="opts"
        :events="auditEvents"
        @select-subject="openSubject"
        @select-role="focusRole"
      />
    </main>
  </div>
</template>

<style scoped>
.rbx {
  --rbx-bg: var(--body-bg, #f5f6f7); --rbx-card: var(--box-bg, #ffffff); --rbx-text: var(--body-text, #141419);
  --rbx-muted: var(--muted, #6c6c76); --rbx-border: var(--border, #d9dce1); --rbx-accent: var(--primary, #3d98d3);
  --rbx-hover: var(--sortable-table-hover-bg, rgba(125, 135, 150, .10)); --rbx-head: var(--sortable-table-header-bg, rgba(125, 135, 150, .10));
  --rbx-ok: var(--success, #5d995d); --rbx-warn: var(--warning, #dd9b2e); --rbx-bad: var(--error, #d9453f);
  color: var(--rbx-text); display: flex; flex-direction: column; gap: 12px;
}
.page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
.page-head h1 { margin: 0 0 4px; font-size: 24px; font-weight: normal; }
.sub { margin: 0; color: var(--rbx-muted); }
.head-actions { display: flex; gap: 10px; align-items: center; }
.viewas { display: inline-flex; align-items: center; gap: 8px; color: var(--rbx-muted); }
.viewas select { padding: 6px 10px; border: 1px solid var(--input-border, var(--rbx-border)); border-radius: var(--border-radius, 4px); background: var(--input-bg, var(--rbx-card)); color: var(--rbx-text); font: inherit; min-height: 34px; }
.btn.is-on { border-color: var(--rbx-accent); color: var(--rbx-accent); }
.summary { display: flex; flex-wrap: wrap; gap: 4px 22px; color: var(--rbx-muted); padding-bottom: 2px; }
.summary b { color: var(--rbx-text); font-size: 15px; font-weight: 600; }
.bar { display: flex; gap: 14px 18px; align-items: center; flex-wrap: wrap; padding: 12px 14px; border: 1px solid var(--rbx-border); border-radius: var(--border-radius, 4px); background: var(--rbx-card); }
.seg { display: inline-flex; border: 1px solid var(--rbx-border); border-radius: var(--border-radius, 4px); overflow: hidden; }
.seg button { border: 0; border-right: 1px solid var(--rbx-border); background: transparent; color: var(--rbx-text); padding: 6px 14px; cursor: pointer; font: inherit; }
.seg button:last-child { border-right: 0; } .seg button:hover { background: var(--rbx-hover); }
.seg button.on { background: var(--rbx-accent); color: #fff; }
.field { display: inline-flex; align-items: center; gap: 8px; color: var(--rbx-muted); }
.field select, .search { padding: 6px 10px; border: 1px solid var(--input-border, var(--rbx-border)); border-radius: var(--border-radius, 4px); background: var(--input-bg, var(--rbx-card)); color: var(--rbx-text); font: inherit; min-height: 34px; box-sizing: border-box; }
.search { flex: 1; min-width: 200px; }
.field select:focus, .search:focus { outline: none; border-color: var(--rbx-accent); }
.checks { display: flex; gap: 6px 16px; align-items: center; flex-wrap: wrap; }
.chk { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; } .chk.dis { opacity: .5; cursor: default; }
.chk input { accent-color: var(--rbx-accent); margin: 0; }
.swatch { display: inline-block; width: 9px; height: 9px; border-radius: 2px; }
.vsep { width: 1px; height: 18px; background: var(--rbx-border); }
.reset { cursor: pointer; color: var(--rbx-accent); }
.banner { margin: 0; } .banner a { cursor: pointer; text-decoration: underline; } .banner ul { margin: 6px 0 0 18px; padding: 0; }
.tabs { display: flex; list-style: none; margin: 4px 0 0; padding: 0; border-bottom: 1px solid var(--rbx-border); }
.tabs li { padding: 10px 18px; cursor: pointer; color: var(--rbx-muted); border-bottom: 3px solid transparent; margin-bottom: -1px; }
.tabs li:hover { color: var(--rbx-text); } .tabs li.active { color: var(--rbx-accent); border-bottom-color: var(--rbx-accent); }
.tabs li.spacer { margin-left: auto; cursor: default; font-size: 12px; align-self: center; padding: 0; border: 0; }
.count-badge { margin-left: 8px; background: var(--rbx-bad); color: #fff; font-size: 11px; border-radius: 9px; padding: 1px 7px; }
.stage { position: relative; height: max(560px, calc(100vh - 360px)); border: 1px solid var(--rbx-border); border-radius: var(--border-radius, 4px); background: var(--rbx-card); }
.loading { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 80px; color: var(--rbx-muted); }
</style>
