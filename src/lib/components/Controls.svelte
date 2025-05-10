<script lang="ts">
	import type { DependencyGraphData, LinkType, NodeType } from '$lib/types';
	import DependencyGraph from './DependencyGraph.svelte';

	const data = $props<{ graphData: DependencyGraphData | null }>();

	let searchTerm = $state('');
	let showDevDeps = $state(true);
	let previousShowDevDeps = $state(true); // Initialize with the same default value as showDevDeps
	let previousSearchTerm = $state('');
	let isProcessing = $state(false);

	// Pure function for filtering (no state mutations)
	function getFilteredData(): DependencyGraphData {
		if (!data.graphData) return { nodes: [], links: [] };

		// Skip filtering if no filters are applied
		if (!searchTerm.trim() && showDevDeps) {
			return data.graphData; // Return reference to original data
		}

		// For search term filtering, pre-calculate the matching node IDs once
		const matchingNodeIds = searchTerm.trim()
			? new Set(
					data.graphData.nodes
						.filter((node: NodeType) => node.id.toLowerCase().includes(searchTerm.toLowerCase()))
						.map((node: NodeType) => node.id)
				)
			: null;
		// Apply filters
		const filteredNodes = data.graphData.nodes
			.filter((node: NodeType) => {
				const matchesDev = showDevDeps || node.type !== 'dev';
				return matchesDev;
			})
			.filter((node: NodeType) => {
				const matchesSearch = !matchingNodeIds || matchingNodeIds.has(node.id);
				return matchesSearch;
			});

		// Create a Set for faster lookup
		const filteredNodeIds = new Set(filteredNodes.map((n: NodeType) => n.id));
		const filteredLinks = data.graphData.links.filter(
			(link: LinkType) =>
				filteredNodeIds.has(link.source as string) && filteredNodeIds.has(link.target as string)
		);

		return { nodes: filteredNodes, links: filteredLinks };
	}

	// Track when filtering parameters change and set processing state
	$effect(() => {
		// Only trigger processing when values actually change
		if (
			data.graphData &&
			(searchTerm !== previousSearchTerm || showDevDeps !== previousShowDevDeps)
		) {
			isProcessing = true;

			// Store current values
			previousSearchTerm = searchTerm;
			previousShowDevDeps = showDevDeps;

			// Use a microtask to update after rendering
			Promise.resolve().then(() => {
				// Just update processing state, don't explicitly call getFilteredData()
				isProcessing = false;
			});
		}
	});

	let nodeLimit = $state(300); // Reasonable number for smooth rendering
	// Derived state calling the pure function (no mutations inside)
	let filteredGraphData = $derived(() => getFilteredData());
	let isLimited = $derived(() => filteredGraphData().nodes.length > nodeLimit);
	// Modify the filtered data to respect limits (also pure calculation)
	let displayedGraphData = $derived(() => {
		// Recalculate filteredGraphData whenever showDevDeps or searchTerm changes
		const filteredData = getFilteredData();

		if (!filteredData || filteredData.nodes.length === 0) {
			return { nodes: [], links: [] };
		}

		// If under limit, show all
		if (filteredData.nodes.length <= nodeLimit) {
			return filteredData;
		}

		// Otherwise limit nodes
		const limitedNodes = filteredData.nodes.slice(0, nodeLimit);
		const limitedNodeIds = new Set(limitedNodes.map((n) => n.id));

		const limitedLinks = filteredData.links.filter(
			(link) =>
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
		<div
			class="spinner w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"
		></div>
	</div>
{/if}

{#if displayedGraphData().nodes.length > 0}
	<DependencyGraph data={displayedGraphData()} />
{:else if data.graphData}
	<DependencyGraph data={data.graphData} />
{/if}
{#if isLimited()}
	<div class="text-amber-600 p-2 text-sm">
		Showing {nodeLimit} of {filteredGraphData().nodes.length} matching packages.
		<button class="underline" onclick={() => (nodeLimit += 200)}>Show more</button>
	</div>
{:else}
	<div class="text-amber-600 p-2 text-sm">
		Showing all {filteredGraphData().nodes.length} matching packages.
	</div>
{/if}
