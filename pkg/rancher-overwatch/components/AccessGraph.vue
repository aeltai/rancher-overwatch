<script>
import { connected, clip, SUBJECT_COLORS, LAYER_COLORS } from '../rbac/graph.js';
import { LEVELS } from '../rbac/rules.js';

export default {
  name: 'AccessGraph',

  props: {
    graph:      { type: Object, required: true },
    selectedId: { type: String, default: null }
  },

  emits: ['select-node', 'select-edge', 'clear'],

  data() {
    return {
      k: 1, tx: 0, ty: 0, hover: null, hoverEdge: null, tip: null, drag: null, SUBJECT_COLORS, LAYER_COLORS, LEVELS
    };
  },

  computed: {
    active() {
      return this.hover || this.selectedId;
    },
    hl() {
      return this.active ? connected(this.graph, this.active) : null;
    },
    headers() {
      const names = { 0: 'API tokens', 1: 'Subjects', 2: 'Roles', 3: 'Capabilities' };

      return this.graph.colX.map(c => ({ x: c.x, label: names[c.col] }));
    },
    catLevel() {
      const m = {};

      this.graph.edges.filter(e => e.kind === 'capability').forEach(e => {
        m[e.target] = Math.max(m[e.target] || 0, e.level);
      });

      return m;
    },
    nodeById() {
      return Object.fromEntries(this.graph.nodes.map(n => [n.id, n]));
    },
    transform() {
      return `translate(${ this.tx },${ this.ty }) scale(${ this.k })`;
    }
  },

  watch: {
    graph() {
      this.$nextTick(this.fit);
    }
  },

  mounted() {
    this.fit();
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.fit());
      this.ro.observe(this.$refs.wrap);
    }
    window.addEventListener('resize', this.fit);
    window.addEventListener('mouseup', this.onUp);
    window.addEventListener('mousemove', this.onMove);
  },

  beforeUnmount() {
    this.ro && this.ro.disconnect();
    window.removeEventListener('resize', this.fit);
    window.removeEventListener('mouseup', this.onUp);
    window.removeEventListener('mousemove', this.onMove);
  },

  methods: {
    clip,
    fit() {
      const el = this.$refs.wrap;

      if (!el || !this.graph.width) {
        return;
      }
      const r = el.getBoundingClientRect();

      if (!r.width || !r.height) {
        return;
      }
      const k = Math.max(0.3, Math.min((r.width - 24) / this.graph.width, (r.height - 16) / this.graph.height, 1.1));

      this.k = k;
      this.tx = 16 - 44 * k; // layout pad is 44: cancel it so the first column starts at the left edge
      this.ty = 10;
    },
    zoom(f, cx, cy) {
      const r = this.$refs.wrap.getBoundingClientRect();
      const px = cx ?? r.width / 2, py = cy ?? r.height / 2;
      const nk = Math.max(0.2, Math.min(2.5, this.k * f));

      this.tx = px - (px - this.tx) * (nk / this.k);
      this.ty = py - (py - this.ty) * (nk / this.k);
      this.k = nk;
    },
    onWheel(e) {
      if (e.ctrlKey || e.metaKey) {
        const r = this.$refs.wrap.getBoundingClientRect();

        this.zoom(Math.exp(-e.deltaY * 0.0022), e.clientX - r.left, e.clientY - r.top);
      } else {
        this.tx -= e.deltaX;
        this.ty -= e.deltaY;
      }
    },
    onDown(e) {
      this.drag = { x: e.clientX, y: e.clientY, tx: this.tx, ty: this.ty, moved: false };
    },
    onMove(e) {
      if (this.drag) {
        const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;

        if (Math.abs(dx) + Math.abs(dy) > 3) {
          this.drag.moved = true;
        }
        this.tx = this.drag.tx + dx;
        this.ty = this.drag.ty + dy;
      }
      if (this.tip) {
        const r = this.$refs.wrap.getBoundingClientRect();

        this.tip = { ...this.tip, x: e.clientX - r.left + 14, y: e.clientY - r.top + 14 };
      }
    },
    onUp() {
      this.drag = null;
    },
    bgClick() {
      if (!this.drag?.moved) {
        this.$emit('clear');
      }
    },
    nodeDim(n) {
      return this.hl && !this.hl.nodes.has(n.id);
    },
    edgeDim(e) {
      return this.hl && !this.hl.edges.has(e.id);
    },
    edgeColor(e) {
      const s = this.nodeById[e.source], t = this.nodeById[e.target];

      return e.kind === 'capability' ? LEVELS[e.level].color : s?.color;
    },
    showNodeTip(n, ev) {
      const lines = [];

      if (n.kind === 'subject') {
        lines.push(n.sub);
        n.admin && lines.push('★ Full administrator');
      } else if (n.kind === 'role') {
        lines.push(`${ n.role.layer === 'rancher' ? 'Rancher' : 'Kubernetes' } ${ n.role.kind }`);
        lines.push(`${ n.role.rules.length } rule${ n.role.rules.length === 1 ? '' : 's' } · strongest: ${ LEVELS[n.power].label }`);
        n.role.description && lines.push(n.role.description);
      } else {
        lines.push(n.sub);
      }
      this.hover = n.id;
      const r = this.$refs.wrap.getBoundingClientRect();

      this.tip = { x: ev.clientX - r.left + 14, y: ev.clientY - r.top + 14, title: n.label, lines };
    },
    showEdgeTip(e, ev) {
      const lines = [];
      const r = this.$refs.wrap.getBoundingClientRect();

      if (e.kind === 'binding') {
        e.grants.slice(0, 6).forEach(g => lines.push(`${ g.kind } · ${ g.scope.label }`));
        e.grants.length > 6 && lines.push(`+ ${ e.grants.length - 6 } more`);
      } else if (e.kind === 'capability') {
        lines.push(`${ LEVELS[e.level].label }${ e.special ? ' · incl. escalate/bind/impersonate' : '' }`);
      } else {
        lines.push('Token acts with the owner’s permissions');
      }
      this.hoverEdge = e.id;
      this.tip = { x: ev.clientX - r.left + 14, y: ev.clientY - r.top + 14, title: this.nodeById[e.source]?.label + ' → ' + this.nodeById[e.target]?.label, lines };
    },
    leave() {
      this.hover = null;
      this.hoverEdge = null;
      this.tip = null;
    },
    clickNode(n) {
      if (!this.drag?.moved) {
        this.$emit('select-node', n);
      }
    },
    clickEdge(e) {
      if (e.kind === 'binding' && !this.drag?.moved) {
        this.$emit('select-edge', e);
      }
    }
  }
};
</script>

<template>
  <div
    ref="wrap"
    class="ag"
  >
    <svg
      class="ag-svg"
      @wheel.prevent="onWheel"
      @mousedown="onDown"
      @click="bgClick"
    >
      <g :transform="transform">
        <g
          v-for="h in headers"
          :key="h.label"
        >
          <text
            :x="h.x"
            y="20"
            class="ag-col"
          >
            {{ h.label.toUpperCase() }}
          </text>
          <line
            :x1="h.x"
            :x2="h.x + graph.nodeW"
            y1="28"
            y2="28"
            class="ag-colline"
          />
        </g>

        <g class="ag-edges">
          <g
            v-for="e in graph.edges"
            :key="e.id"
          >
            <path
              :d="e.d"
              fill="none"
              :stroke="edgeColor(e)"
              :stroke-width="e.width"
              :stroke-opacity="edgeDim(e) ? 0.07 : (hl ? 0.9 : (e.kind === 'capability' ? 0.45 : 0.5))"
              :stroke-dasharray="e.kind === 'binding' && !e.broad ? '6 4' : null"
            />
            <path
              :d="e.d"
              fill="none"
              stroke="transparent"
              stroke-width="14"
              class="ag-hit"
              @mouseenter="showEdgeTip(e, $event)"
              @mouseleave="leave"
              @click.stop="clickEdge(e)"
            />
          </g>
        </g>

        <g class="ag-nodes">
          <g
            v-for="n in graph.nodes"
            :key="n.id"
            :transform="`translate(${n.x},${n.y})`"
            class="ag-node"
            :class="{ dim: nodeDim(n), sel: selectedId === n.id, admin: n.admin }"
            @mouseenter="showNodeTip(n, $event)"
            @mouseleave="leave"
            @click.stop="clickNode(n)"
          >
            <rect
              :width="n.w"
              :height="n.h"
              rx="4"
              class="ag-card"
            />
            <rect
              width="4"
              :height="n.h"
              :fill="n.color"
            />
            <text
              x="14"
              y="17"
              class="ag-label"
              :class="{ expired: n.expired }"
            >
              {{ clip(n.label, 24) }}
            </text>
            <text
              x="14"
              y="31"
              class="ag-sub"
            >
              {{ clip(n.sub, n.kind === 'subject' ? 30 : 26) }}
            </text>

            <g
              v-if="n.admin"
              :transform="`translate(${n.w - 40},4)`"
            >
              <rect
                width="34"
                height="13"
                rx="3"
                class="ag-adm"
              />
              <text
                x="17"
                y="9.5"
                text-anchor="middle"
                class="ag-badge"
              >
                ADMIN
              </text>
            </g>
            <g
              v-if="n.kind === 'role' || n.kind === 'category'"
              :transform="`translate(${n.w - 30},${n.h - 9})`"
            >
              <rect
                v-for="i in 3"
                :key="i"
                :x="(i - 1) * 8"
                y="-3"
                width="6"
                height="6"
                rx="1"
                :fill="(n.kind === 'role' ? n.power : catLevel[n.id] || 0) >= i ? LEVELS[(n.kind === 'role' ? n.power : catLevel[n.id] || 0)].color : 'currentColor'"
                :fill-opacity="(n.kind === 'role' ? n.power : catLevel[n.id] || 0) >= i ? 1 : 0.2"
              />
            </g>
          </g>
        </g>
      </g>
    </svg>

    <div class="ag-tools">
      <button
        class="btn btn-sm role-secondary"
        title="Zoom in (Ctrl/⌘ + scroll)"
        @click.stop="zoom(1.25)"
      >
        +
      </button>
      <button
        class="btn btn-sm role-secondary"
        title="Zoom out"
        @click.stop="zoom(0.8)"
      >
        −
      </button>
      <button
        class="btn btn-sm role-secondary"
        title="Fit to view"
        @click.stop="fit"
      >
        Fit
      </button>
    </div>

    <div class="ag-legend">
      <span
        v-for="(c, t) in SUBJECT_COLORS"
        :key="t"
      ><i :style="{ background: c }" />{{ t === 'serviceaccount' ? 'Service account' : t.charAt(0).toUpperCase() + t.slice(1) }}</span>
      <span class="sep" />
      <span><i :style="{ background: LAYER_COLORS.rancher }" />Rancher role</span>
      <span><i :style="{ background: LAYER_COLORS.k8s }" />Kubernetes role</span>
      <span class="sep" />
      <span
        v-for="l in LEVELS.slice(1)"
        :key="l.id"
      ><i
        class="line"
        :style="{ background: l.color }"
      />{{ l.label }}</span>
      <span><svg
        width="24"
        height="6"
      ><line
        x1="0"
        y1="3"
        x2="24"
        y2="3"
        stroke="currentColor"
        stroke-width="2"
        stroke-dasharray="5 3"
      /></svg>Project / namespace scope</span>
    </div>
    <div class="ag-hint">
      Drag to pan · Ctrl/⌘ + scroll to zoom · click a node for details
    </div>

    <div
      v-if="tip"
      class="ag-tip"
      :style="{ left: tip.x + 'px', top: tip.y + 'px' }"
    >
      <b>{{ tip.title }}</b>
      <div
        v-for="(l, i) in tip.lines"
        :key="i"
      >
        {{ l }}
      </div>
    </div>
    <div
      v-if="!graph.nodes.length"
      class="ag-empty"
    >
      No bindings match the current filters.
    </div>
    <div
      v-if="graph.hiddenSubjects"
      class="ag-more"
    >
      Showing the {{ graph.nodes.filter(n => n.kind === 'subject' && n.col === 1).length }} most privileged subjects. {{ graph.hiddenSubjects }} more are hidden, use the filter to narrow down.
    </div>
  </div>
</template>

<style scoped>
.ag { position: relative; width: 100%; height: 100%; min-height: 480px; overflow: hidden; user-select: none; color: var(--rbx-text); }
.ag-svg { width: 100%; height: 100%; display: block; cursor: grab; font-family: inherit; }
.ag-svg:active { cursor: grabbing; }
.ag-col { font-size: 11px; font-weight: 600; letter-spacing: .08em; fill: var(--rbx-muted); }
.ag-colline { stroke: var(--rbx-border); stroke-width: 1; }
.ag-card { fill: var(--rbx-card); stroke: var(--rbx-border); stroke-width: 1; }
.ag-node { cursor: pointer; transition: opacity .15s; }
.ag-node:hover .ag-card { stroke: var(--rbx-accent); }
.ag-node.sel .ag-card { stroke: var(--rbx-accent); stroke-width: 2; }
.ag-node.admin .ag-card { stroke: var(--rbx-bad); }
.ag-node.dim { opacity: .18; }
.ag-label { font-size: 12.5px; font-weight: 600; fill: var(--rbx-text); }
.ag-label.expired { text-decoration: line-through; opacity: .55; }
.ag-sub { font-size: 10.5px; fill: var(--rbx-muted); }
.ag-adm { fill: var(--rbx-bad); }
.ag-badge { font-size: 8px; font-weight: 700; fill: #fff; letter-spacing: .04em; }
.ag-hit { cursor: pointer; }
path { transition: stroke-opacity .15s; stroke-linecap: round; }
.ag-tools { position: absolute; right: 12px; top: 12px; display: flex; flex-direction: column; gap: 6px; }
.ag-tools .btn { min-height: 0; padding: 0 10px; line-height: 28px; }
.ag-legend { position: absolute; left: 12px; bottom: 10px; display: flex; flex-wrap: wrap; gap: 4px 14px; align-items: center; font-size: 11.5px; color: var(--rbx-muted); background: var(--rbx-card); border: 1px solid var(--rbx-border); padding: 6px 12px; border-radius: var(--border-radius, 4px); max-width: calc(100% - 330px); }
.ag-legend span { display: inline-flex; align-items: center; gap: 6px; }
.ag-legend i { width: 9px; height: 9px; border-radius: 2px; display: inline-block; } .ag-legend i.line { width: 16px; height: 4px; }
.ag-legend .sep { width: 1px; height: 12px; background: var(--rbx-border); }
.ag-hint { position: absolute; right: 14px; bottom: 14px; font-size: 11.5px; color: var(--rbx-muted); }
.ag-tip { position: absolute; pointer-events: none; z-index: 5; max-width: 320px; padding: 8px 11px; border-radius: var(--border-radius, 4px); background: var(--tooltip-bg, #2b2d33); color: var(--tooltip-text, #fff); font-size: 12px; line-height: 1.45; box-shadow: 0 2px 8px rgba(0, 0, 0, .3); }
.ag-tip b { display: block; margin-bottom: 2px; }
.ag-empty { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--rbx-muted); pointer-events: none; }
.ag-more { position: absolute; left: 50%; transform: translateX(-50%); top: 8px; font-size: 12px; background: var(--rbx-card); color: var(--rbx-muted); border: 1px solid var(--rbx-border); border-radius: var(--border-radius, 4px); padding: 4px 12px; }
</style>
