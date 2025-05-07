<script lang="ts">
	import type { DependencyGraphData, LinkType, NodeType } from '$lib/types';
	import DependencyGraph from './DependencyGraph.svelte';

	const data = $props<{ graphData: DependencyGraphData | null }>();

	let searchTerm = $state('');
	let debouncedSearchTerm = $state('');
	let showDevDeps = $state(true);
	let isProcessing = $state(false);

	// Debounce the search term updates
	$effect(() => {
		const timer = setTimeout(() => {
			debouncedSearchTerm = searchTerm;
		}, 300); // 300ms delay

		return () => clearTimeout(timer);
	});

	// Track when filtering parameters change and set processing state
	$effect(() => {
		// This runs when dependencies change but before filtering happens
		if (data.graphData && (debouncedSearchTerm.trim() || !showDevDeps)) {
			isProcessing = true;
			
			// Use setTimeout to allow UI to show loading state before filtering begins
			setTimeout(() => {
				// This will trigger the derived computation
				const result = getFilteredData();
				// After filtering completes
				isProcessing = false;
			}, 0);
		}
	});

	// Pure function for filtering (no state mutations)
	function getFilteredData(): DependencyGraphData {
		if (!data.graphData) return { nodes: [], links: [] };

		// Skip filtering if no filters are applied
		if (!debouncedSearchTerm.trim() && showDevDeps) {
			return data.graphData; // Return reference to original data
		}

		// For search term filtering, pre-calculate the matching node IDs once
		const matchingNodeIds = debouncedSearchTerm.trim()
			? new Set(
					data.graphData.nodes
						.filter((node: NodeType) =>
							node.id.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
						)
						.map((node: NodeType) => node.id)
				)
			: null;

		// Apply filters in a single pass if possible
		const filteredNodes = data.graphData.nodes.filter((node: { id: unknown; isDev: any; }) => {
			const matchesSearch = !matchingNodeIds || matchingNodeIds.has(node.id);
			const matchesDev = showDevDeps || !node.isDev;
			return matchesSearch && matchesDev;
		});

		// Create a Set for faster lookup
		const filteredNodeIds = new Set(filteredNodes.map((n: NodeType) => n.id));

		const filteredLinks = data.graphData.links.filter(
			(link: LinkType) =>
				filteredNodeIds.has(link.source as string) && filteredNodeIds.has(link.target as string)
		);

		return { nodes: filteredNodes, links: filteredLinks };
	}

	// Derived state calling the pure function (no mutations inside)
	let filteredGraphData = $derived(() => getFilteredData());

	// Add these variables
	let nodeLimit = $state(300); // Reasonable number for smooth rendering
	let isLimited = $derived(() => 
		filteredGraphData().nodes.length > nodeLimit
	);
	
	// Modify the filtered data to respect limits (also pure calculation)
	let displayedGraphData = $derived(() => {
		if (!filteredGraphData() || filteredGraphData().nodes.length === 0) 
			return { nodes: [], links: [] };
		
		// If under limit, show all
		if (filteredGraphData().nodes.length <= nodeLimit) {
			return filteredGraphData();
		}
		
		// Otherwise limit nodes
		const limitedNodes = filteredGraphData().nodes.slice(0, nodeLimit);
		const limitedNodeIds = new Set(limitedNodes.map(n => n.id));
		
		const limitedLinks = filteredGraphData().links.filter(link =>
			limitedNodeIds.has(link.source as string) && limitedNodeIds.has(link.target as string)
		);
		
		return { nodes: limitedNodes, links: limitedLinks };
	});
</script>

<div class="controls p-4 space-y-2">
	<input
		type="search"
		placeholder="Search packages..."
		bind:value={searchTerm}
		class="p-2 border rounded"
	/>

	<label class="flex items-center space-x-2">
		<input type="checkbox" bind:checked={showDevDeps} />
		<span>Show dev dependencies</span>
	</label>
</div>

<!-- Add loading indicator -->
{#if isProcessing}
  <div class="absolute top-4 right-4">
    <div class="spinner w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
  </div>
{/if}

{#if displayedGraphData().nodes.length > 0}
  <DependencyGraph data={displayedGraphData()} {searchTerm} />
  
  {#if isLimited()}
    <div class="text-amber-600 p-2 text-sm">
      Showing {nodeLimit} of {filteredGraphData().nodes.length} matching packages. 
      <button class="underline" onclick={() => nodeLimit += 200}>Show more</button>
    </div>
  {/if}
{:else if data.graphData}
	<DependencyGraph data={data.graphData} />
{/if}
