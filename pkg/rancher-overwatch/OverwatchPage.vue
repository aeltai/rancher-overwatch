<script>
import { markRaw } from 'vue';
import RbacExplorer from './components/RbacExplorer.vue';
import { loadRancher, loadCluster, loadAuditText, listable } from './rbac/loader.js';
import { describeAccess, restrictRaw, can, VIEW_AS, isAdminFromGetters } from './rbac/access.js';
import { parseAuditText, attachSubjects } from './rbac/audit.js';
import { buildModel } from './rbac/normalize.js';
import { demoRaw, demoAudit } from './rbac/demo-data.js';

export default {
  name: 'OverwatchPage',

  components: { RbacExplorer },

  data() {
    return {
      loading:        true,
      loadingCluster: false,
      demo:           false,
      raw:            { rancher: {}, k8s: {}, errors: {} },
      demoData:       null,
      tried:          {},
      restricted:     [],
      viewAs:         'admin',
      VIEW_AS,
      auditRaw:       [],
      auditLoading:   false,
      auditError:     '',
      auditSource:    '',
      demoAuditRaw:   null
    };
  },

  computed: {
    demoView() {
      return this.demo ? restrictRaw(this.demoData, this.viewAs) : null;
    },
    access() {
      if (this.demo) {
        return describeAccess(this.viewAs === 'admin', can(this.demoView.restricted || []));
      }

      return describeAccess(isAdminFromGetters(this.$store.getters), listable(this.$store));
    },
    model() {
      const raw = this.demo ? this.demoView : { ...this.raw, restricted: this.restricted };

      return markRaw(buildModel(raw));
    },
    auditEvents() {
      if (!this.access.canAudit) {
        return [];
      }
      const raw = this.demo ? (this.demoAuditRaw || []) : this.auditRaw;

      return markRaw(attachSubjects(this.model, raw));
    }
  },

  async created() {
    await this.loadAll();
  },

  methods: {
    async loadAll() {
      this.loading = true;
      this.tried = {};
      if (!this.access.allowed) {
        this.loading = false;

        return;
      }
      try {
        const { rancher, errors, restricted } = await loadRancher(this.$store);

        this.restricted = restricted;
        this.raw = { rancher, k8s: {}, errors };
      } catch (e) {
        this.raw = { rancher: {}, k8s: {}, errors: { rancher: e?.message || String(e) } };
      }
      this.loading = false;
    },

    async onCluster(cid) {
      if (this.demo || this.loading || !cid || !this.access.allowed) {
        return;
      }
      const ids = cid === 'all' ? Object.keys(this.model.clusters) : [cid];
      const todo = ids.filter(id => !this.tried[id]);

      if (!todo.length) {
        return;
      }
      this.loadingCluster = true;
      todo.forEach(id => {
        this.tried[id] = true;
      });
      const k8s = { ...this.raw.k8s };
      const errors = { ...this.raw.errors };

      // gentle concurrency – at most 3 clusters at a time
      for (let i = 0; i < todo.length; i += 3) {
        await Promise.all(todo.slice(i, i + 3).map(async(id) => {
          const { data, errors: e } = await loadCluster(this.$store, id);

          k8s[id] = data;
          Object.assign(errors, e);
        }));
      }
      this.raw = { ...this.raw, k8s, errors };
      this.loadingCluster = false;
    },

    async loadAudit() {
      if (this.demo || !this.access.canAudit) {
        return;
      }
      this.auditLoading = true;
      this.auditError = '';
      try {
        const text = await loadAuditText(this.$store);

        this.auditRaw = parseAuditText(text);
        this.auditSource = 'Rancher pods · rancher-audit-log';
        if (!this.auditRaw.length) {
          this.auditError = 'The audit log was readable but contained no parsable events.';
        }
      } catch (e) {
        this.auditError = e?.message || String(e);
      }
      this.auditLoading = false;
    },

    importAudit(text, name) {
      const ev = parseAuditText(text);

      if (!ev.length) {
        this.auditError = `No audit events could be parsed from ${ name } (expected JSON lines).`;

        return;
      }
      this.auditError = '';
      this.auditRaw = ev;
      this.auditSource = name;
    },

    toggleDemo() {
      if (!this.demoData) {
        this.demoData = demoRaw();
        this.demoAuditRaw = parseAuditText(demoAudit().map(e => JSON.stringify(e)).join('\n'));
      }
      this.demo = !this.demo;
    }
  }
};
</script>

<template>
  <div class="rbac-page">
    <RbacExplorer
      :model="model"
      :loading="loading"
      :loading-cluster="loadingCluster"
      :demo="demo"
      :can-toggle-demo="true"
      :initial-cluster="'local'"
      :access="access"
      :view-as="viewAs"
      :view-as-options="demo ? VIEW_AS : []"
      @update:view-as="v => viewAs = v"
      :audit-events="auditEvents"
      :audit-loading="auditLoading"
      :audit-error="demo ? '' : auditError"
      :audit-source="demo ? 'Demo events' : auditSource"
      @update:cluster="onCluster"
      @refresh="loadAll"
      @toggle-demo="toggleDemo"
      @load-audit="loadAudit"
      @import-audit="importAudit"
    />
  </div>
</template>

<style scoped>
.rbac-page { padding: 16px 20px 40px 8px; }
</style>
