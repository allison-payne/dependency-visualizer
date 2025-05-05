/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';

// Define custom node type extending D3's SimulationNodeDatum
export interface NodeType extends SimulationNodeDatum {
  id: string; // Package name@version or unique identifier
  name: string; // Package name
  version: string; // Package version
  type?: 'prod' | 'dev' | 'peer' | 'optional'; // Added type field
  hasMultipleVersions?: boolean; // Add flag for version conflicts
}

// Define custom link type extending D3's SimulationLinkDatum
export interface LinkType extends SimulationLinkDatum<NodeType> {
  source: string | number | NodeType; // D3 allows string/number IDs initially
  target: string | number | NodeType;
  type?: 'prod' | 'dev' | 'peer' | 'optional'; // Add link type
}

export interface DependencyGraphData {
  nodes: NodeType[];
  links: LinkType[];
}

export async function parseLockfile(
  lockfileContent: string,
  lockfileType: 'package-lock' | 'yarn' | 'pnpm'
): Promise<DependencyGraphData> {
  try {
    if (lockfileType === 'package-lock') {
      return parsePackageLock(lockfileContent);
    } else if (lockfileType === 'yarn') {
      return parseYarnLock(lockfileContent);
    } else {
      throw new Error(`Lockfile type '${lockfileType}' not supported yet`);
    }
  } catch (error: any) {
    console.error("Error parsing lockfile:", error);
    throw new Error(`Failed to parse lockfile: ${error.message}`);
  }
}

function parsePackageLock(content: string): DependencyGraphData {
  const packageLock = JSON.parse(content);
  const nodesMap = new Map<string, NodeType>();
  const links: LinkType[] = [];
  
  // Get the root package name and version
  const rootName = packageLock.name || 'root';
  const rootVersion = packageLock.version || '0.0.0';
  const rootId = `${rootName}@${rootVersion}`;
  
  // Add root node
  nodesMap.set(rootId, {
    id: rootId,
    name: rootName,
    version: rootVersion,
    type: 'prod' // Root is considered a production dependency
  });
  
  // Process dependencies (could be under dependencies, packages, or both depending on npm version)
  const packages = packageLock.packages || {};
  const dependencies = packageLock.dependencies || {};
  
  // Track package names for version conflict detection
  const packageVersions = new Map<string, Set<string>>();
  
  // Handle npm v2/v3 style lockfiles (dependencies object)
  if (Object.keys(dependencies).length > 0) {
    processDependenciesOldFormat(dependencies, rootId, nodesMap, links, packageVersions, false);
  }
  
  // Handle npm v7+ style lockfiles (packages object)
  if (Object.keys(packages).length > 0) {
    // Skip the first empty key which is the root package
    Object.entries(packages).forEach(([pkgPath, details]) => {
      if (pkgPath === '') return; // Skip root
      
      // The package path might look like 'node_modules/package-name' or 'node_modules/scope/package-name'
      const parts = pkgPath.split('/');
      const name = parts[parts.length - 1];
      const version = (details as any).version || 'unknown';
      const nodeId = `${name}@${version}`;
      
      // Determine dependency type from dev flag and path structure
      const isDev = (details as any).dev === true;
      const isPeer = (details as any).peer === true;
      const isOptional = (details as any).optional === true;
      let type: 'prod' | 'dev' | 'peer' | 'optional' = 'prod';
      
      if (isDev) type = 'dev';
      else if (isPeer) type = 'peer';
      else if (isOptional) type = 'optional';
      
      // Track versions for conflict detection
      if (!packageVersions.has(name)) {
        packageVersions.set(name, new Set([version]));
      } else {
        packageVersions.get(name)!.add(version);
      }
      
      // Add node if not exists
      if (!nodesMap.has(nodeId)) {
        nodesMap.set(nodeId, { 
          id: nodeId, 
          name, 
          version,
          type
        });
      }
      
      // Add links based on dependencies
      const pkgDeps = (details as any).dependencies || {};
      Object.keys(pkgDeps).forEach(depName => {
        const depVersion = pkgDeps[depName];
        const targetId = `${depName}@${depVersion}`;
        
        links.push({
          source: nodeId,
          target: targetId,
          type // Inherit the parent's dependency type
        });
      });
      
      // Also add a link from root for direct dependencies
      if (parts.length === 2) { // Only one level deep from node_modules
        links.push({
          source: rootId,
          target: nodeId,
          type // Use the determined dependency type
        });
      }
    });
  }
  
  // Mark nodes with multiple versions
  packageVersions.forEach((versions, packageName) => {
    if (versions.size > 1) {
      // Find all nodes with this package name and mark them
      for (const [, node] of nodesMap.entries()) {
        if (node.name === packageName) {
          node.hasMultipleVersions = true;
        }
      }
    }
  });
  
  const nodes = Array.from(nodesMap.values());
  
  // Validate links to ensure all sources/targets exist
  const nodeIds = new Set(nodes.map(n => n.id));
  const validLinks = links.filter(link => 
    nodeIds.has(link.source as string) && nodeIds.has(link.target as string)
  );
  
  if (nodes.length === 0) {
    throw new Error("No dependencies found in the package-lock.json file.");
  }
  
  return { nodes, links: validLinks };
}

function parseYarnLock(content: string): DependencyGraphData {
  const nodesMap = new Map<string, NodeType>();
  const links: LinkType[] = [];
  
  // Add a pseudo-root node 
  const rootId = "root@1.0.0";
  nodesMap.set(rootId, {
    id: rootId,
    name: "root",
    version: "1.0.0"
  });
  
  // Basic yarn.lock parser
  // Format is typically:
  // package-name@^version:
  //   version "actual-version"
  //   dependencies:
  //     dependency-name "version-spec"
  
  // Split by double newlines to get package blocks
  const packageBlocks = content.split('\n\n');
  
  packageBlocks.forEach(block => {
    if (!block.trim()) return;
    
    const lines = block.split('\n');
    let currentPackage = '';
    let currentVersion = '';
    
    // Parse the package identifier line
    if (lines[0] && lines[0].includes(':')) {
      const packageLine = lines[0].trim();
      currentPackage = packageLine.substring(0, packageLine.indexOf('@'));
      
      // Find the actual version
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('version ')) {
          currentVersion = line.substring(9).replace(/"/g, '').trim();
          break;
        }
      }
      
      if (currentPackage && currentVersion) {
        const nodeId = `${currentPackage}@${currentVersion}`;
        
        // Add the node
        if (!nodesMap.has(nodeId)) {
          nodesMap.set(nodeId, {
            id: nodeId,
            name: currentPackage,
            version: currentVersion
          });
        }
        
        // Add link from root (assume all are direct deps for simplicity)
        links.push({
          source: rootId,
          target: nodeId
        });
        
        // Parse dependencies
        let inDepsSection = false;
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          
          if (line === 'dependencies:') {
            inDepsSection = true;
            continue;
          }
          
          if (inDepsSection && line) {
            const depMatch = line.match(/([^"]+) "([^"]+)"/);
            if (depMatch) {
              const depName = depMatch[1].trim();
              // We don't have exact version from yarn.lock's dependencies section,
              // so we need to find it from the other blocks
              
              // For simplicity, link to any version of this dependency
              const depNodes = Array.from(nodesMap.values())
                .filter(n => n.name === depName);
                
              if (depNodes.length > 0) {
                // Link to the first version we find
                links.push({
                  source: nodeId,
                  target: depNodes[0].id
                });
              }
              // Note: This is simplified and might not correctly link to the exact version
            }
          } else if (inDepsSection && !line) {
            // Empty line ends dependencies section
            inDepsSection = false;
          }
        }
      }
    }
  });
  
  const nodes = Array.from(nodesMap.values());
  
  // Validate links (same as before)
  const nodeIds = new Set(nodes.map(n => n.id));
  const validLinks = links.filter(link => 
    nodeIds.has(link.source as string) && nodeIds.has(link.target as string)
  );
  
  if (nodes.length <= 1) { // Only root node means no dependencies found
    throw new Error("No dependencies found in the yarn.lock file.");
  }
  
  return { nodes, links: validLinks };
}

// Helper function to recursively process dependencies (for older npm lockfile format)
function processDependenciesOldFormat(
  dependencies: Record<string, any>,
  parentId: string,
  nodesMap: Map<string, NodeType>,
  links: LinkType[],
  packageVersions: Map<string, Set<string>>,
  isDev = false
): void {
  for (const [name, details] of Object.entries(dependencies)) {
    const version = details.version || 'unknown';
    const nodeId = `${name}@${version}`;
    
    // Determine dependency type
    const isPeer = details.peer === true;
    const isOptional = details.optional === true;
    const currentIsDev = isDev || details.dev === true;
    
    let type: 'prod' | 'dev' | 'peer' | 'optional' = 'prod';
    if (currentIsDev) type = 'dev';
    else if (isPeer) type = 'peer';
    else if (isOptional) type = 'optional';
    
    // Track versions for conflict detection
    if (!packageVersions.has(name)) {
      packageVersions.set(name, new Set([version]));
    } else {
      packageVersions.get(name)!.add(version);
    }
    
    // Add node if it doesn't exist
    if (!nodesMap.has(nodeId)) {
      nodesMap.set(nodeId, {
        id: nodeId,
        name,
        version,
        type
      });
    }
    
    // Add link from parent to this dependency
    links.push({
      source: parentId,
      target: nodeId,
      type
    });
    
    // Process nested dependencies recursively
    if (details.dependencies) {
      processDependenciesOldFormat(
        details.dependencies, 
        nodeId, 
        nodesMap, 
        links, 
        packageVersions,
        currentIsDev // Pass down dev status
      );
    }
  }
}