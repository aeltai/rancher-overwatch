<script>
import { filterEvents, summarize, bucketEvents, describe } from '../rbac/audit.js';
import { SUBJECT_COLORS, clip } from '../rbac/graph.js';

export default {
  name: 'AuditPanel',

  props: {
    model:          { type: Object, required: true },
    events:         { type: Array, default: () => [] },
    loading:        { type: Boolean, default: false },
    error:          { type: String, default: '' },
    source:         { type: String, default: '' },
    subjectFilter:  { type: String, default: null }
  },

  emits: ['load', 'import', 'open-subject', 'clear-subject'],

  data() {
    return {
      search: '', reads: false, rbac: false, denied: false, writes: false, limit: 250, SUBJECT_COLORS
    };
  },

  computed: {
    filtered() {
      return filterEvents(this.events, {
        search: this.search, reads: this.reads, rbac: this.rbac, denied: this.denied, writes: this.writes, subjectId: this.subjectFilter
      });
    },
    sum() {
      return summarize(this.events);
    },
    buckets() {
      return bucketEvents(filterEvents(this.events, { reads: true, subjectId: this.subjectFilter }), 56);
    },
    maxBucket() {
      return Math.max(1, ...this.buckets.map(b => b.read + b.write + b.rbac + b.denied));
    },
    bars() {
      const w = 1000 / this.buckets.length;

      return this.buckets.map((b, i) => {
        let y = 100;
        const seg = [['read', 'var(--rbx-border)'], ['write', 'var(--rbx-accent)'], ['rbac', 'var(--rbx-warn)'], ['denied', 'var(--rbx-bad)']].map(([k, c]) => {
          const h = (b[k] / this.maxBucket) * 96;

          y -= h;

          return { y, h, c, k, n: b[k] };
        }).filter(s => s.h > 0);

        return { x: i * w + 1, w: w - 2, seg, t: b.t0, n: b.read + b.write + b.rbac + b.denied };
      });
    },
    rows() {
      return this.filtered.slice(0, this.limit);
    },
    subjectLabel() {
      return this.subjectFilter ? this.model.subjects[this.subjectFilter]?.label : '';
    }
  },

  methods: {
    clip,
    describe,
    fmt(t) {
      return new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    },
    fmtShort(t) {
      return new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    },
    who(e) {
      return e.subjectId ? this.model.subjects[e.subjectId] : null;
    },
    codeClass(e) {
      return e.denied ? 'bad' : e.code >= 400 ? 'warn' : 'ok';
    },
    onFile(ev) {
      const f = ev.target.files?.[0];

      if (!f) {
        return;
      }
      const r = new FileReader();

      r.onload = () => this.$emit('import', String(r.result || ''), f.name);
      r.readAsText(f);
      ev.target.value = '';
    }
  }
};
</script>

<template>
  <div class="au">
    <div class="src">
      <div class="src-t">
        <b>Audit log</b>
        <span class="muted">
          {{ events.length ? `${sum.count} events from ${fmtShort(sum.from)} to ${fmtShort(sum.to)} · ${source}` : 'No events loaded' }}
        </span>
      </div>
      <div class="src-a">
        <button
          class="btn role-secondary"
          :disabled="loading"
          @click="$emit('load')"
        >
          {{ loading ? 'Loading…' : 'Load from Rancher' }}
        </button>
        <label class="btn role-secondary file">
          Import log file
          <input
            type="file"
            accept=".log,.json,.jsonl,.txt,application/json,text/plain"
            @change="onFile"
          >
        </label>
      </div>
    </div>

    <div
      v-if="error"
      class="banner warning"
    >
      <span>{{ error }}</span>
    </div>

    <div
      v-if="!events.length"
      class="empty"
    >
      <h3>See who actually used their access</h3>
      <p>
        Rancher does not expose audit events through an API. They are written by the
        <code>rancher-audit-log</code> sidecar of the Rancher pods when the chart is installed with
        <code>auditLog.enabled=true</code> (level 1 or higher) and <code>auditLog.destination=sidecar</code>.
        <b>Load from Rancher</b> reads that sidecar through the Kubernetes API, which needs permission to read pod logs in <code>cattle-system</code>.
      </p>
      <p>
        On a single-node Docker install, enable <code>-e AUDIT_LEVEL=1</code> and import the file
        <code>/var/log/auditlog/rancher-api-audit.log</code> with <b>Import log file</b>.
        Kubernetes API-server audit logs (JSON lines) can be imported the same way.
      </p>
    </div>

    <template v-else>
      <div class="tiles">
        <div><b>{{ sum.count }}</b><span>events</span></div>
        <div><b>{{ sum.writes }}</b><span>changes</span></div>
        <div class="w">
          <b>{{ sum.rbac }}</b><span>RBAC / token changes</span>
        </div>
        <div class="d">
          <b>{{ sum.denied }}</b><span>denied</span>
        </div>
        <div><b>{{ sum.users }}</b><span>distinct users</span></div>
      </div>

      <div class="chart">
        <svg
          viewBox="0 0 1000 100"
          preserveAspectRatio="none"
        >
          <line
            x1="0"
            x2="1000"
            y1="99.5"
            y2="99.5"
            class="base"
          />
          <g
            v-for="(b, i) in bars"
            :key="i"
          >
            <rect
              v-for="s in b.seg"
              :key="s.k"
              :x="b.x"
              :y="s.y"
              :width="b.w"
              :height="s.h"
              :fill="s.c"
            >
              <title>{{ fmtShort(b.t) }} · {{ s.k }}: {{ s.n }}</title>
            </rect>
          </g>
        </svg>
        <div class="axis">
          <span>{{ fmtShort(sum.from) }}</span>
          <span class="lg"><i style="background: var(--rbx-border)" />reads</span>
          <span class="lg"><i style="background: var(--rbx-accent)" />changes</span>
          <span class="lg"><i style="background: var(--rbx-warn)" />RBAC / token changes</span>
          <span class="lg"><i style="background: var(--rbx-bad)" />denied</span>
          <span>{{ fmtShort(sum.to) }}</span>
        </div>
      </div>

      <div class="filters">
        <input
          v-model="search"
          type="search"
          placeholder="Filter by user, resource, cluster, IP or details"
        >
        <label class="chk"><input
          v-model="writes"
          type="checkbox"
        > Changes only</label>
        <label class="chk"><input
          v-model="rbac"
          type="checkbox"
        > RBAC / token changes</label>
        <label class="chk"><input
          v-model="denied"
          type="checkbox"
        > Denied</label>
        <label class="chk"><input
          v-model="reads"
          type="checkbox"
        > Include reads</label>
        <span
          v-if="subjectFilter"
          class="pill"
        >User: {{ subjectLabel }} <a @click="$emit('clear-subject')">×</a></span>
        <span class="muted cnt">{{ filtered.length }} shown</span>
      </div>

      <div class="scroll">
        <table>
          <thead>
            <tr>
              <th>Time</th><th>Who</th><th>Action</th><th>Target</th><th>Details</th><th>Result</th><th>From</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="e in rows"
              :key="e.id"
              :title="`${e.method} ${e.uri}`"
            >
              <td class="nw">
                {{ fmt(e.time) }}
              </td>
              <td class="nw">
                <template v-if="who(e)">
                  <i
                    class="dot"
                    :style="{ background: SUBJECT_COLORS[who(e).type] }"
                  />
                  <a @click="$emit('open-subject', who(e).id)">{{ clip(who(e).label, 22) }}</a>
                </template>
                <span
                  v-else
                  class="muted"
                >{{ clip(e.user || e.userId || 'anonymous', 24) }}</span>
              </td>
              <td class="nw">
                <span
                  v-if="e.rbac"
                  class="tag w"
                >RBAC</span>
                <span
                  v-else-if="e.write"
                  class="tag c"
                >Change</span>
                {{ describe(e).what }}
              </td>
              <td>{{ clip(describe(e).target, 44) }}</td>
              <td class="muted">
                {{ clip(e.detail, 56) }}
              </td>
              <td class="nw">
                <span :class="['code', codeClass(e)]">{{ e.code || '–' }}</span>
              </td>
              <td class="muted nw">
                {{ e.ip }}
              </td>
            </tr>
            <tr v-if="!rows.length">
              <td
                colspan="7"
                class="muted pad"
              >
                No events match these filters.
              </td>
            </tr>
          </tbody>
        </table>
        <div
          v-if="filtered.length > limit"
          class="more"
        >
          Showing the newest {{ limit }} of {{ filtered.length }} events. <a @click="limit += 250">Show more</a>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.au { display: flex; flex-direction: column; gap: 12px; color: var(--rbx-text); }
.src { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; padding: 12px 14px; border: 1px solid var(--rbx-border); border-radius: var(--border-radius, 4px); background: var(--rbx-card); }
.src-t { display: flex; flex-direction: column; gap: 2px; } .src-a { display: flex; gap: 10px; }
.file { position: relative; cursor: pointer; display: inline-flex; align-items: center; } .file input { display: none; }
.muted { color: var(--rbx-muted); } .pad { padding: 30px; text-align: center; }
.banner { margin: 0; }
.empty { border: 1px dashed var(--rbx-border); border-radius: var(--border-radius, 4px); padding: 28px 32px; background: var(--rbx-card); }
.empty h3 { margin: 0 0 8px; font-weight: 600; } .empty p { margin: 0 0 8px; max-width: 880px; color: var(--rbx-muted); line-height: 1.5; }
.empty code { background: var(--rbx-head); padding: 0 5px; border-radius: 3px; color: var(--rbx-text); }
.tiles { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
.tiles div { border: 1px solid var(--rbx-border); border-top: 3px solid var(--rbx-border); border-radius: var(--border-radius, 4px); padding: 8px 14px; background: var(--rbx-card); }
.tiles div.w { border-top-color: var(--rbx-warn); } .tiles div.d { border-top-color: var(--rbx-bad); }
.tiles b { display: block; font-size: 22px; font-weight: 600; line-height: 1.25; } .tiles span { color: var(--rbx-muted); }
.chart { border: 1px solid var(--rbx-border); border-radius: var(--border-radius, 4px); padding: 12px 14px 8px; background: var(--rbx-card); }
.chart svg { width: 100%; height: 100px; display: block; } .base { stroke: var(--rbx-border); }
.axis { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 6px; font-size: 12px; color: var(--rbx-muted); flex-wrap: wrap; }
.lg { display: inline-flex; align-items: center; gap: 5px; } .lg i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.filters { display: flex; gap: 10px 18px; align-items: center; flex-wrap: wrap; padding: 10px 14px; border: 1px solid var(--rbx-border); border-radius: var(--border-radius, 4px); background: var(--rbx-card); }
.filters input[type=search] { flex: 1; min-width: 240px; padding: 6px 10px; border: 1px solid var(--input-border, var(--rbx-border)); border-radius: var(--border-radius, 4px); background: var(--input-bg, var(--rbx-card)); color: var(--rbx-text); font: inherit; min-height: 34px; box-sizing: border-box; }
.chk { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; } .chk input { accent-color: var(--rbx-accent); margin: 0; }
.pill { border: 1px solid var(--rbx-accent); color: var(--rbx-accent); border-radius: 3px; padding: 1px 8px; } .pill a { margin-left: 6px; cursor: pointer; }
.cnt { margin-left: auto; }
.scroll { border: 1px solid var(--rbx-border); border-radius: var(--border-radius, 4px); background: var(--rbx-card); max-height: max(420px, calc(100vh - 640px)); overflow: auto; }
table { width: 100%; border-collapse: collapse; }
th { position: sticky; top: 0; background: var(--rbx-head); text-align: left; font-size: 12px; font-weight: 600; color: var(--rbx-muted); padding: 8px 10px; z-index: 1; }
td { padding: 6px 10px; border-top: 1px solid var(--rbx-border); } tbody tr:hover { background: var(--rbx-hover); } .nw { white-space: nowrap; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 7px; } a { color: var(--rbx-accent); cursor: pointer; }
.tag { font-size: 10.5px; font-weight: 700; padding: 0 6px; border-radius: 3px; margin-right: 6px; color: #fff; } .tag.w { background: var(--rbx-warn); } .tag.c { background: var(--rbx-accent); }
.code { font-weight: 600; } .code.ok { color: var(--rbx-ok); } .code.warn { color: var(--rbx-warn); } .code.bad { color: var(--rbx-bad); }
.more { padding: 10px 14px; border-top: 1px solid var(--rbx-border); color: var(--rbx-muted); }
</style>
