const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../node_modules/@rancher/shell/components');

function patchFile(relPath, patches, marker) {
  const target = path.join(root, relPath);

  if (!fs.existsSync(target)) {
    return;
  }

  let source = fs.readFileSync(target, 'utf8');

  if (source.includes(marker)) {
    return;
  }

  let applied = 0;

  for (const { before, after } of patches) {
    if (!source.includes(before)) {
      console.warn(`patch-shell-vue3-refs: pattern missing in ${relPath}`);
      continue;
    }
    source = source.replace(before, after);
    applied += 1;
  }

  if (applied > 0) {
    fs.writeFileSync(target, source);
    console.log(`patch-shell-vue3-refs: applied ${applied} patch(es) to ${relPath}`);
  }
}

patchFile('SortableTable/index.vue', [
  {
    before: `    updateDelayedColumns() {
      clearTimeout(this._delayedColumnsTimer);

      if (!this.$refs.column || this.pagedRows.length === 0) {
        return;
      }

      const delayedColumns = this.$refs.column.filter((c) => c.startDelayedLoading && !c.__delayedLoading);`,
    after: `    getColumnRefs() {
      const ref = this.$refs.column;

      if (!ref) {
        return [];
      }

      return Array.isArray(ref) ? ref : [ref];
    },

    updateDelayedColumns() {
      clearTimeout(this._delayedColumnsTimer);

      const columnRefs = this.getColumnRefs();

      if (columnRefs.length === 0 || this.pagedRows.length === 0) {
        return;
      }

      const delayedColumns = columnRefs.filter((c) => c.startDelayedLoading && !c.__delayedLoading);`,
  },
  {
    before: `    updateLiveColumns() {
      clearTimeout(this._liveColumnsTimer);

      if (!this.$refs.column || !this.hasLiveColumns || this.pagedRows.length === 0) {
        return;
      }

      const clientHeight = window.innerHeight || document.documentElement.clientHeight;
      const liveColumns = this.$refs.column.filter((c) => !!c.liveUpdate);`,
    after: `    updateLiveColumns() {
      clearTimeout(this._liveColumnsTimer);

      const columnRefs = this.getColumnRefs();

      if (columnRefs.length === 0 || !this.hasLiveColumns || this.pagedRows.length === 0) {
        return;
      }

      const clientHeight = window.innerHeight || document.documentElement.clientHeight;
      const liveColumns = columnRefs.filter((c) => !!c.liveUpdate);`,
  },
], 'getColumnRefs()');

patchFile('SideNav.vue', [
  {
    before: `    groupSelected(selected) {
      this.$refs.groups.forEach((grp) => {`,
    after: `    getGroupRefs() {
      const ref = this.$refs.groups;

      if (!ref) {
        return [];
      }

      return Array.isArray(ref) ? ref : [ref];
    },

    groupSelected(selected) {
      this.getGroupRefs().forEach((grp) => {`,
  },
  {
    before: `    collapseAll() {
      this.$refs.groups.forEach((grp) => {`,
    after: `    collapseAll() {
      this.getGroupRefs().forEach((grp) => {`,
  },
  {
    before: `    syncNav() {
      const refs = this.$refs.groups;

      if (refs) {
        // Only expand one group - so after the first has been expanded, no more will
        // This prevents the 'More Resources' group being expanded in addition to the normal group
        let canExpand = true;
        const expanded = refs.filter((grp) => grp.isExpanded)[0];`,
    after: `    syncNav() {
      const refs = this.getGroupRefs();

      if (refs.length) {
        // Only expand one group - so after the first has been expanded, no more will
        // This prevents the 'More Resources' group being expanded in addition to the normal group
        let canExpand = true;
        const expanded = refs.filter((grp) => grp.isExpanded)[0];`,
  },
], 'getGroupRefs()');

patchFile('nav/Group.vue', [
  {
    before: `    syncNav() {
      const refs = this.$refs.groups;

      if (refs) {
        // Only expand one group - so after the first has been expanded, no more will
        let canExpand = true;

        refs.forEach((grp) => {`,
    after: `    getGroupRefs() {
      const ref = this.$refs.groups;

      if (!ref) {
        return [];
      }

      return Array.isArray(ref) ? ref : [ref];
    },

    syncNav() {
      const refs = this.getGroupRefs();

      if (refs.length) {
        // Only expand one group - so after the first has been expanded, no more will
        let canExpand = true;

        refs.forEach((grp) => {`,
  },
], 'getGroupRefs()');

// Vue 3.2 compiler-sfc rejects intersection/imported type aliases in defineProps().
const rcRoot = path.join(__dirname, '../node_modules/@rancher/shell/rancher-components');

function patchAbsolute(base, relPath, patches, marker) {
  const target = path.join(base, relPath);

  if (!fs.existsSync(target)) {
    return;
  }

  let source = fs.readFileSync(target, 'utf8');

  if (source.includes(marker)) {
    return;
  }

  let applied = 0;

  for (const { before, after } of patches) {
    if (!source.includes(before)) {
      console.warn(`patch-shell-vue3-refs: pattern missing in ${relPath}`);
      continue;
    }
    source = source.replace(before, after);
    applied += 1;
  }

  if (applied > 0) {
    fs.writeFileSync(target, source);
    console.log(`patch-shell-vue3-refs: applied ${applied} patch(es) to ${relPath}`);
  }
}

patchAbsolute(rcRoot, 'RcButton/RcButton.vue', [
  {
    before: 'const props = defineProps<ButtonRoleProps & ButtonSizeProps>();',
    after: `interface RcButtonComponentProps extends ButtonRoleProps, ButtonSizeProps {}

const props = defineProps<RcButtonComponentProps>();`,
  },
], 'RcButtonComponentProps');

patchAbsolute(rcRoot, 'RcDropdown/types.ts', [
  {
    before: `export type RcDropdownMenuComponentProps = {
  options: DropdownOption[];
  buttonRole?: keyof ButtonRoleProps;
  buttonSize?: keyof ButtonSizeProps;
  buttonAriaLabel?: string;
  dropdownAriaLabel?: string;
  dataTestid?: string;
}`,
    after: `export interface RcDropdownMenuComponentProps {
  options: DropdownOption[];
  buttonRole?: keyof ButtonRoleProps;
  buttonSize?: keyof ButtonSizeProps;
  buttonAriaLabel?: string;
  dropdownAriaLabel?: string;
  dataTestid?: string;
}`,
  },
], 'export interface RcDropdownMenuComponentProps');

patchAbsolute(rcRoot, 'RcDropdown/RcDropdownMenu.vue', [
  {
    before: `import { RcDropdownMenuComponentProps, DropdownOption } from './types';
import IconOrSvg from '@shell/components/IconOrSvg';

withDefaults(defineProps<RcDropdownMenuComponentProps>(), {`,
    after: `import { DropdownOption } from './types';
import { ButtonRoleProps, ButtonSizeProps } from '@components/RcButton/types';
import IconOrSvg from '@shell/components/IconOrSvg';

interface RcDropdownMenuComponentProps {
  options: DropdownOption[];
  buttonRole?: keyof ButtonRoleProps;
  buttonSize?: keyof ButtonSizeProps;
  buttonAriaLabel?: string;
  dropdownAriaLabel?: string;
  dataTestid?: string;
}

withDefaults(defineProps<RcDropdownMenuComponentProps>(), {`,
  },
], 'interface RcDropdownMenuComponentProps {');
