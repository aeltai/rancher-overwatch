export const PRODUCT_NAME = 'rancher-overwatch';
export const EXPLORER_PAGE = 'explorer';

const BLANK_CLUSTER = '_';

// Shield with an all-seeing eye (Rancher Overwatch). Black fill so Rancher can tint it to the theme.
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#000" fill-rule="evenodd" d="M12 1.8l8.2 3.2v6.2c0 5-3.4 9.1-8.2 11-4.8-1.9-8.2-6-8.2-11V5L12 1.8zM5.8 12c1.6-2.7 3.8-4 6.2-4s4.6 1.3 6.2 4c-1.6 2.7-3.8 4-6.2 4s-4.6-1.3-6.2-4zM9.7 12a2.3 2.3 0 1 0 4.6 0 2.3 2.3 0 1 0-4.6 0z"/></svg>';

export function init($plugin, store) {
  const { product } = $plugin.DSL(store, PRODUCT_NAME);

  product({
    icon:                'search',
    svg:                 `data:image/svg+xml;utf8,${ encodeURIComponent(ICON) }`,
    label:               'Rancher Overwatch',
    inStore:             'management',
    weight:              99,
    showClusterSwitcher: false,
    to:                  {
      name:   `${ PRODUCT_NAME }-c-cluster-${ EXPLORER_PAGE }`,
      params: { product: PRODUCT_NAME, cluster: BLANK_CLUSTER }
    }
  });
}
