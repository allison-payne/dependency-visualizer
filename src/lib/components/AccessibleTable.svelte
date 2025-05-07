<script lang="ts">
	import type { DependencyGraphData } from "$lib/types";


  export let data: DependencyGraphData;
  
  // Organize nodes by their dependencies for easier reading
  const nodesByDependency = new Map<string, string[]>();
  
  // Process links to create a dependency map
  data.links.forEach((link) => {
    const sourceId = typeof link.source === 'object' ? link.source.id : link.source as string;
    const targetId = typeof link.target === 'object' ? link.target.id : link.target as string;
    
    if (!nodesByDependency.has(targetId)) {
      nodesByDependency.set(targetId, []);
    }
    
    nodesByDependency.get(targetId)!.push(sourceId);
  });
</script>

<div class="table-container my-8">
  <table class="w-full text-sm text-left text-gray-500 dark:text-gray-400" aria-label="Dependency graph data in table format">
    <caption class="p-5 text-lg font-semibold text-left text-gray-900 bg-white dark:text-white dark:bg-gray-800">
      Project Dependencies
      <p class="mt-1 text-sm font-normal text-gray-500 dark:text-gray-400">
        Total packages: {data.nodes.length}, Total connections: {data.links.length}
      </p>
    </caption>
    <thead class="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
      <tr>
        <th scope="col" class="px-6 py-3">Package</th>
        <th scope="col" class="px-6 py-3">Version</th>
        <th scope="col" class="px-6 py-3">Used By</th>
      </tr>
    </thead>
    <tbody>
      {#each data.nodes as node}
        <tr class="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600">
          <td class="px-6 py-4 font-medium text-gray-900 dark:text-white">{node.name}</td>
          <td class="px-6 py-4">{node.version}</td>
          <td class="px-6 py-4">
            {#if nodesByDependency.has(node.id)}
              <ul class="list-disc pl-5">
                {#each nodesByDependency.get(node.id)! as dependentId}
                  <li>{dependentId}</li>
                {/each}
              </ul>
            {:else}
              <span class="text-gray-400">None (Root Package)</span>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .table-container {
    overflow-x: auto;
  }
</style>