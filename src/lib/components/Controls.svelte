<script lang="ts">
	import type { DependencyGraphData, LinkType, NodeType } from '$lib/types';
	import { isTypeDefinition } from '$lib/utils/lockfileParser';
	import DependencyGraph from './DependencyGraph.svelte';

	const data = $props<{ graphData: DependencyGraphData | null }>();

	let searchTerm = $state('');
	let showDevDeps = $state(true);
	let showPeerDeps = $state(true);
	let showOptionalDeps = $state(true);
	let showProdDeps = $state(true);
	let showTypeDefinitions = $state(true);
	let highlightVersionConflicts = $state(false); // New state for version conflict highlighting
	let previousHighlightVersionConflicts = $state(false);
	let previousShowDevDeps = $state(true);
	let previousShowPeerDeps = $state(true);
	let previousShowOptionalDeps = $state(true);
	let previousShowProdDeps = $state(true);
	let previousShowTypeDefinitions = $state(true);
	let previousSearchTerm = $state('');
	let isProcessing = $state(false);

	// Pure function for filtering (no state mutations)
	function getFilteredData(): DependencyGraphData {
		if (!data.graphData) return { nodes: [], links: [] };

		// Skip filtering if no filters are applied and no version conflicts highlighting
		if (!searchTerm.trim() && showDevDeps && showPeerDeps && showOptionalDeps && showProdDeps && showTypeDefinitions && !highlightVersionConflicts) {
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
				const matchesPeer = showPeerDeps || node.type !== 'peer';
				const matchesOptional = showOptionalDeps || node.type !== 'optional';
				const matchesProd = showProdDeps || node.type !== 'prod';
				const matchesTypeDef = showTypeDefinitions || !isTypeDefinition(node);
				const matchesVersionConflict = !highlightVersionConflicts || node.hasMultipleVersions;
				const matchesSearch = !matchingNodeIds || matchingNodeIds.has(node.id);
				return matchesDev && matchesPeer && matchesOptional && matchesProd && matchesTypeDef && matchesVersionConflict && matchesSearch;
			});

		// Create a Set for faster lookup
		const filteredNodeIds = new Set(filteredNodes.map((n: NodeType) => n.id));
		const filteredLinks = data.graphData.links.filter(
			(link: LinkType) =>
				filteredNodeIds.has(link.source as string) && filteredNodeIds.has(link.target as string)
		);

		return { nodes: filteredNodes, links: filteredLinks };
	}

	// Calculate version conflict statistics
	function getVersionConflictStats(): { 
		totalPackagesWithConflicts: number;
		packageConflicts: { packageName: string, versions: string[] }[];
	} {
		if (!data.graphData) return { totalPackagesWithConflicts: 0, packageConflicts: [] };
		
		// Group nodes by package name
		const packageMap = new Map<string, NodeType[]>();
		data.graphData.nodes.forEach((node: NodeType) => {
			if (!packageMap.has(node.name)) {
				packageMap.set(node.name, []);
			}
			packageMap.get(node.name)!.push(node);
		});
		
		// Find packages with multiple versions
		const packageConflicts = Array.from(packageMap.entries())
			.filter(([_, nodes]) => nodes.length > 1)
			.map(([packageName, nodes]) => ({
				packageName,
				versions: nodes.map(n => n.version).sort()
			}))
			.sort((a, b) => b.versions.length - a.versions.length); // Sort by number of versions (descending)
		
		return {
			totalPackagesWithConflicts: packageConflicts.length,
			packageConflicts
		};
	}
	
	// Track when filtering parameters change and set processing state
	$effect(() => {
		// Only trigger processing when values actually change
		if (
			data.graphData &&
			(searchTerm !== previousSearchTerm || 
			 showDevDeps !== previousShowDevDeps || 
			 showPeerDeps !== previousShowPeerDeps ||
			 showOptionalDeps !== previousShowOptionalDeps ||
			 showProdDeps !== previousShowProdDeps ||
			 showTypeDefinitions !== previousShowTypeDefinitions ||
			 highlightVersionConflicts !== previousHighlightVersionConflicts)
		) {
			isProcessing = true;

			// Store current values
			previousSearchTerm = searchTerm;
			previousShowDevDeps = showDevDeps;
			previousShowPeerDeps = showPeerDeps;
			previousShowOptionalDeps = showOptionalDeps;
			previousShowProdDeps = showProdDeps;
			previousShowTypeDefinitions = showTypeDefinitions;
			previousHighlightVersionConflicts = highlightVersionConflicts;

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
	
	// Derived state for version conflict statistics
	let versionConflictStats = $derived(() => getVersionConflictStats());
</script>

<div class="p-4 pb-0">
	<!-- Search field with icon -->
	<div class="relative mb-4">
		<div class="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none">
			<svg class="w-4 h-4 text-gray-500 dark:text-gray-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20">
				<path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z"/>
			</svg>
		</div>
		<input
			type="search"
			placeholder="Search packages..."
			bind:value={searchTerm}
			class="block w-full p-2 ps-10 text-sm text-gray-900 border border-gray-300 rounded-lg bg-white focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
		/>
	</div>

	<div class="filter-controls bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-4">
		<h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-3">Filter Dependencies</h3>
		
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4">
			<!-- Dependency type filters -->
			<label class="flex items-center space-x-2 text-gray-700 dark:text-gray-300 text-sm">
				<input type="checkbox" bind:checked={showDevDeps} class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"/>
				<div class="flex items-center">
					<span class="inline-block w-3 h-3 rounded-full bg-red-500 mr-2"></span>
					<span>Development</span>
				</div>
			</label>

			<label class="flex items-center space-x-2 text-gray-700 dark:text-gray-300 text-sm">
				<input type="checkbox" bind:checked={showProdDeps} class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"/>
				<div class="flex items-center">
					<span class="inline-block w-3 h-3 rounded-full bg-green-500 mr-2"></span>
					<span>Production</span>
				</div>
			</label>

			<label class="flex items-center space-x-2 text-gray-700 dark:text-gray-300 text-sm">
				<input type="checkbox" bind:checked={showPeerDeps} class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"/>
				<div class="flex items-center">
					<span class="inline-block w-3 h-3 rounded-full bg-blue-500 mr-2"></span>
					<span>Peer</span>
				</div>
			</label>

			<label class="flex items-center space-x-2 text-gray-700 dark:text-gray-300 text-sm">
				<input type="checkbox" bind:checked={showOptionalDeps} class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"/>
				<div class="flex items-center">
					<span class="inline-block w-3 h-3 rounded-full bg-purple-500 mr-2"></span>
					<span>Optional</span>
				</div>
			</label>

			<label class="flex items-center space-x-2 text-gray-700 dark:text-gray-300 text-sm">
				<input type="checkbox" bind:checked={showTypeDefinitions} class="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"/>
				<div class="flex items-center">
					<span class="inline-block w-3 h-3 rounded-full bg-white border border-gray-300 dark:border-gray-500 mr-2 flex items-center justify-center">
						<span class="text-[5px] text-gray-700 dark:text-gray-300 font-bold">TS</span>
					</span>
					<span>Type Definitions</span>
				</div>
			</label>

			<label class="flex items-center space-x-2 text-gray-700 dark:text-gray-300 text-sm">
				<input type="checkbox" bind:checked={highlightVersionConflicts} class="w-4 h-4 text-orange-600 rounded focus:ring-orange-500 dark:focus:ring-orange-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"/>
				<div class="flex items-center">
					<span class="inline-block w-3 h-3 rounded-full border-2 border-dashed border-orange-500 mr-2"></span>
					<span>Version Conflicts</span>
				</div>
			</label>
		</div>
	</div>

	<!-- Current state information -->
	<div class="flex flex-wrap items-center justify-between mb-4 text-xs text-gray-500 dark:text-gray-400">
		<div>
			{#if isProcessing}
				<div class="inline-flex items-center">
					<div class="w-3 h-3 me-2 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
					Processing filters...
				</div>
			{:else}
				<span>
					{filteredGraphData().nodes.length} packages • {filteredGraphData().links.length} dependencies
				</span>
			{/if}
		</div>
		
		{#if isLimited()}
			<button 
				class="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
				onclick={() => (nodeLimit += 200)}
			>
				Showing {nodeLimit} of {filteredGraphData().nodes.length} packages • Show more
			</button>
		{/if}
	</div>
</div>

{#if displayedGraphData().nodes.length > 0}
	<DependencyGraph data={displayedGraphData()} />
{:else if data.graphData}
	<div class="flex flex-col items-center justify-center h-64 text-gray-500 dark:text-gray-400">
		<svg class="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
		</svg>
		<p>No packages match your filters</p>
		<button 
			class="mt-4 px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
			onclick={() => {
				searchTerm = '';
				showDevDeps = true;
				showProdDeps = true;
				showPeerDeps = true;
				showOptionalDeps = true;
				showTypeDefinitions = true;
				highlightVersionConflicts = false;
			}}
		>
			Reset all filters
		</button>
	</div>
{/if}

{#if data.graphData && versionConflictStats().totalPackagesWithConflicts > 0}
	<div class="mx-4 mb-4 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-gray-800 dark:to-gray-800 border border-orange-200 dark:border-orange-800 rounded-lg shadow-sm overflow-hidden">
		<div class="p-4 border-b border-orange-200 dark:border-orange-700/50 flex justify-between items-center">
			<h3 class="text-base font-medium text-orange-800 dark:text-orange-300 flex items-center">
				<svg class="w-5 h-5 mr-2 text-orange-500 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
				</svg>
				Version Conflicts Detected
				<span class="ml-2 px-2 py-0.5 text-xs bg-orange-200 dark:bg-orange-900 text-orange-800 dark:text-orange-300 rounded-full">
					{versionConflictStats().totalPackagesWithConflicts}
				</span>
			</h3>
			
			<button
				class={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
					highlightVersionConflicts 
						? 'bg-white dark:bg-gray-700 text-orange-700 dark:text-orange-300 border border-orange-300 dark:border-orange-700 hover:bg-orange-50 dark:hover:bg-gray-600' 
						: 'bg-orange-500 dark:bg-orange-600 text-white hover:bg-orange-600 dark:hover:bg-orange-700'
				}`}
				onclick={() => highlightVersionConflicts = !highlightVersionConflicts}
			>
				{highlightVersionConflicts ? 'Show All Packages' : 'Show Only Conflicts'}
			</button>
		</div>
		
		<div class="p-4">
			<div class="bg-white dark:bg-gray-900/50 rounded-lg border border-orange-200 dark:border-orange-800/30 overflow-hidden">
				<div class="overflow-x-auto">
					<table class="w-full text-sm text-left">
						<thead class="text-xs text-orange-700 dark:text-orange-300 uppercase bg-orange-100 dark:bg-orange-900/30">
							<tr>
								<th scope="col" class="px-4 py-2">Package</th>
								<th scope="col" class="px-4 py-2">Versions</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-orange-100 dark:divide-orange-900/20">
							{#each versionConflictStats().packageConflicts.slice(0, 10) as conflict}
								<tr class="hover:bg-orange-50 dark:hover:bg-orange-900/10">
									<td class="px-4 py-2 font-medium text-orange-900 dark:text-orange-100">{conflict.packageName}</td>
									<td class="px-4 py-2 text-orange-800 dark:text-orange-200">
										{#each conflict.versions as version, i}
											<span class="px-1.5 py-0.5 text-xs font-medium bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 rounded mr-1">
												{version}
											</span>
										{/each}
									</td>
								</tr>
							{/each}
							{#if versionConflictStats().packageConflicts.length > 10}
								<tr>
									<td colspan="2" class="px-4 py-2 text-center text-orange-600 dark:text-orange-400">
										...and {versionConflictStats().packageConflicts.length - 10} more packages with conflicts
									</td>
								</tr>
							{/if}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	</div>
{/if}
