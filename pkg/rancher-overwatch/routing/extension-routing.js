import OverwatchPage from '../OverwatchPage.vue';
import { PRODUCT_NAME, EXPLORER_PAGE } from '../product';

const BLANK_CLUSTER = '_';

// Parent 'plain' = Rancher's header-only template: no side navigation, full-width content.
const routes = [
  {
    parent: 'plain',
    route:  {
      name:      `${ PRODUCT_NAME }-c-cluster-${ EXPLORER_PAGE }`,
      path:      `/${ PRODUCT_NAME }/c/:cluster/${ EXPLORER_PAGE }`,
      component: OverwatchPage,
      meta:      { product: PRODUCT_NAME, cluster: BLANK_CLUSTER }
    }
  }
];

export default routes;
