/**
 * Centralized UI configuration barrel.
 */

export { SERVER_CONFIG } from './server.config';
export {
  NODE_SIZE,
  DAGRE_LAYOUT,
  GRID_LAYOUT,
  LANE_LAYOUT,
} from './layout.config';
export {
  VIEWS,
  EDGE_COLORS,
  EDGE_STYLE,
  EFFECT_GROUP_ORDER,
  EFFECT_GROUP_STYLES,
  type ViewId,
  type ViewDefinition,
  type EffectGroup,
  type EffectGroupStyle,
} from './view.config';
