/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DependencyGraphData, NodeType, LinkType } from '$lib/types';
import * as yaml from 'js-yaml';

// Add TypeScript interfaces for PNPM lock file
interface PnpmLockfile {
  name?: string;
  version?: string;
  lockfileVersion?: number;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  packages?: Record<string, PnpmPackageInfo>;
}

interface PnpmPackageInfo {
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
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

function parsePnpmLock(content: string): DependencyGraphData {
  const pnpmLock = yaml.load(content) as PnpmLockfile;
  const nodesMap = new Map<string, NodeType>();
  const links: LinkType[] = [];
  
  // Add root package
  const rootName = pnpmLock.name || "root";
  const rootVersion = pnpmLock.version || "0.0.0";
  const rootId = `${rootName}@${rootVersion}`;
  
  nodesMap.set(rootId, {
    id: rootId,
    name: rootName,
    version: rootVersion,
    dependencies: [],
    level: 0
  });
  
  // Process packages
  if (pnpmLock.packages) {
    // PNPM uses a flat structure where keys are package paths
    for (const [pkgPath, pkgInfo] of Object.entries(pnpmLock.packages)) {
      if (pkgPath === '.') continue; // Skip root package
      
      // Extract package info from path (format: /package-name@version)
      const pathMatch = pkgPath.match(/\/([^@]+)@(.+)$/);
      if (!pathMatch) continue;
      
      const [, name, version] = pathMatch;
      const id = `${name}@${version}`;
      
      // Create node if it doesn't exist
      if (!nodesMap.has(id)) {
        nodesMap.set(id, {
          id,
          name,
          version,
          dependencies: [],
          level: 1 // Will be updated later
        });
      }
      
      // Process dependencies
      if (pkgInfo.dependencies) {
        for (const [depName, depVersion] of Object.entries(pkgInfo.dependencies)) {
          const depId = `${depName}@${depVersion.replace(/^[\^~]/, '')}`;
          
          // Add the dependency node if it doesn't exist
          if (!nodesMap.has(depId)) {
            const extractedVersion = depVersion.replace(/^[\^~]/, '');
            nodesMap.set(depId, {
              id: depId,
              name: depName,
              version: extractedVersion,
              dependencies: [],
              level: 2 // Will be updated during traversal
            });
          }
          
          // Add the link
          links.push({
            source: id,
            target: depId,
            type: 'normal'
          });
          
          // Update node's dependencies array
          nodesMap.get(id)?.dependencies?.push(depName);
        }
      }
      
      // Add as a dependency of the root if it's a direct dependency
      if (pnpmLock.dependencies?.[name] || pnpmLock.devDependencies?.[name]) {
        links.push({
          source: rootId,
          target: id,
          type: pnpmLock.dependencies?.[name] ? 'normal' : 'dev'
        });
        
        // Add to root's dependencies list
        nodesMap.get(rootId)?.dependencies?.push(name);
      }
    }
  }
  
  // Update levels based on graph traversal
  const nodes = calculateLevels(rootId, nodesMap, links);
  
  return { nodes, links };
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

// We might need to add or update this function to calculate node levels
function calculateLevels(
  rootId: string,
  nodesMap: Map<string, NodeType>,
  links: LinkType[]
): NodeType[] {
  const visited = new Set<string>();
  
  function traverse(nodeId: string, level: number) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    
    const node = nodesMap.get(nodeId);
    if (node) {
      node.level = Math.min(node.level !== undefined ? node.level : Infinity, level);
      
      // Find all outgoing links
      const outLinks = links.filter(link => link.source === nodeId);
      for (const link of outLinks) {
        traverse(link.target as string, level + 1);
      }
    }
  }
  
  // Start traversal from the root node
  traverse(rootId, 0);
  
  return Array.from(nodesMap.values());
}

// Add a helper function to detect TypeScript type definitions
export function isTypeDefinition(node: NodeType): boolean {
  return node.name.startsWith('@types') || (node.type === 'dev' && node.name.endsWith('-types'));
}

export async function parseLockfile(content: string, filename: string): Promise<DependencyGraphData> {
  try {
    // Determine the lockfile type from the filename
    let lockfileType: 'package-lock' | 'yarn' | 'pnpm';
    
    if (typeof filename === 'string') {
      if (filename.endsWith('yarn.lock') || filename.includes('yarn.lock')) {
        lockfileType = 'yarn';
      } else if (filename.endsWith('pnpm-lock.yaml') || filename.includes('pnpm-lock.yaml')) {
        lockfileType = 'pnpm';
      } else if (filename.endsWith('package-lock.json') || filename.includes('package-lock.json')) {
        lockfileType = 'package-lock';
      } else {
        // Try to infer content type from content
        if (content.includes('"lockfileVersion":')) {
          lockfileType = 'package-lock';
          console.log("Inferred package-lock.json format from content");
        } else if (content.trim().startsWith('lockfileVersion:')) {
          lockfileType = 'pnpm';
          console.log("Inferred pnpm-lock.yaml format from content");
        } else {
          lockfileType = 'yarn';
          console.log("Inferred yarn.lock format from content (default fallback)");
        }
      }
    } else {
      throw new Error('Invalid filename parameter');
    }
    
    console.log(`Parsing ${lockfileType} lockfile`);
    
    // Parse according to the determined type
    switch (lockfileType) {
      case 'package-lock':
        return parsePackageLock(content);
      case 'yarn':
        return parseYarnLock(content);
      case 'pnpm':
        return parsePnpmLock(content);
      default:
        throw new Error('Unsupported lock file format');
    }
  } catch (error: any) {
    console.error('Error parsing lockfile:', error);
    throw new Error(`Failed to parse lockfile: ${error.message}`);
  }
}

