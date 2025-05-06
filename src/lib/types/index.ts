import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';

export type NodeTypes = 'prod' | 'dev' | 'peer' | 'optional' | 'normal';
// Define custom node type extending D3's SimulationNodeDatum
export interface NodeType extends SimulationNodeDatum {
  id: string; // Package name@version or unique identifier
  name: string; // Package name
  version: string; // Package version
  type?: NodeTypes; // Added type field
  hasMultipleVersions?: boolean; // Add flag for version conflicts
  dependencies?: string[];
  level?: number;
}

// Define custom link type extending D3's SimulationLinkDatum
export interface LinkType extends SimulationLinkDatum<NodeType> {
  source: string | number | NodeType; // D3 allows string/number IDs initially
  target: string | number | NodeType;
  type?: NodeTypes; // Add link type
}

export interface DependencyGraphData {
  nodes: NodeType[];
  links: LinkType[];
}