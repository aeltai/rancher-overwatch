import { importTypes } from '@rancher/auto-import';
import extensionRouting from './routing/extension-routing';

export default function(plugin) {
  importTypes(plugin);
  plugin.metadata = require('./package.json');
  plugin.addProduct(require('./product'));
  plugin.addRoutes(extensionRouting);
}
