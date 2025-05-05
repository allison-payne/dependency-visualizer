<script lang="ts">
	import type { DependencyGraphData, LinkType, NodeType } from '$lib/utils/lockfileParser';
	import * as d3 from 'd3';
	import { onMount } from 'svelte';
	import Legend from './Legend.svelte';

	const { data, searchTerm = '' } = $props<{
		data: DependencyGraphData;
		searchTerm?: string;
	}>();

	let nodes = $state<NodeType[]>([]);
	let links = $state<LinkType[]>([]);
	let svgElement: SVGSVGElement | null = $state(null);
	let simulation: d3.Simulation<NodeType, LinkType> | null = null;
	let width = $state(800);
	let height = $state(600);
	let currentTransform = $state(d3.zoomIdentity);
	let tooltipData = $state<{ node: NodeType | null; x: number; y: number }>({
		node: null,
		x: 0,
		y: 0
	});
	let showLegend = $state(true);

	// Initialize state when data prop changes
	$effect(() => {
		console.log('Data prop changed, updating state...');
		// Create copies to avoid mutating the prop directly and ensure reactivity
		nodes = data.nodes.map((n: any) => ({ ...n }));
		links = data.links.map((l: any) => ({ ...l }));

		// Restart simulation if it already exists and nodes/links change
		if (simulation) {
			console.log('Restarting simulation with new data.');
			simulation.nodes(nodes);
			simulation.force<d3.ForceLink<NodeType, LinkType>>('link')?.links(links);
			simulation.alpha(0.3).restart(); // Reheat simulation
		}
	});

	// Filter nodes based on search term
	$effect(() => {
		if (!searchTerm.trim() || !data) {
			// If no search term, show all nodes from original data
			nodes = data.nodes.map((n: any) => ({ ...n }));
			links = data.links.map((l: any) => ({ ...l }));
		} else {
			const lowerSearchTerm = searchTerm.toLowerCase();
			const matchingNodeIds = new Set(
				data.nodes
					.filter((node: { id: string }) => node.id.toLowerCase().includes(lowerSearchTerm))
					.map((node: { id: any }) => node.id)
			);

			// Only show matching nodes
			nodes = data.nodes.filter((node: { id: unknown }) => matchingNodeIds.has(node.id));

			// Only show links between matching nodes
			const filteredNodeIds = new Set(nodes.map((n) => n.id));
			links = data.links.filter(
				(link: { source: string; target: string }) =>
					filteredNodeIds.has(link.source as string) && filteredNodeIds.has(link.target as string)
			);
		}

		// Restart simulation with filtered data
		if (simulation) {
			simulation.nodes(nodes);
			simulation.force<d3.ForceLink<NodeType, LinkType>>('link')?.links(links);
			simulation.alpha(0.3).restart();
		}
	});

	// Get color based on node type
	function getNodeColor(node: NodeType): string {
		if (node.name === 'root') return '#6b7280'; // gray-500

		// Use color based on dependency type
		switch (node.type) {
			case 'dev':
				return '#ef4444'; // red-500
			case 'peer':
				return '#3b82f6'; // blue-500
			case 'optional':
				return '#8b5cf6'; // purple-500
			default:
				return '#10b981'; // green-500 (production)
		}
	}

	// Get stroke color for version conflicts
	function getNodeStroke(node: NodeType): string {
		// Highlight nodes with multiple versions
		if (node.hasMultipleVersions) {
			return '#f97316'; // orange-500
		}
		return '#000000';
	}

	// Get node stroke width
	function getNodeStrokeWidth(node: NodeType): number {
		return node.hasMultipleVersions ? 3 : 1.5;
	}

	// Add a function to enhance the tooltip with version conflict info
	function getVersionConflictInfo(node: NodeType): string | null {
		if (!node.hasMultipleVersions) return null;
		
		// Find other versions of this package
		const otherVersions = nodes
			.filter(n => n.name === node.name && n.version !== node.version)
			.map(n => n.version);
		
		if (otherVersions.length === 0) return null;
		
		return `Also found in versions: ${otherVersions.join(', ')}`;
	}

	function showTooltip(event: MouseEvent, node: NodeType) {
		tooltipData = { node, x: event.clientX, y: event.clientY };
	}

	function hideTooltip() {
		tooltipData = { node: null, x: 0, y: 0 };
	}

	function dragstarted(event: d3.D3DragEvent<SVGCircleElement, NodeType, any>, d: NodeType) {
		if (!event.active && simulation) simulation.alphaTarget(0.3).restart();
		d.fx = d.x;
		d.fy = d.y;
	}

	function dragged(event: d3.D3DragEvent<SVGCircleElement, NodeType, any>, d: NodeType) {
		d.fx = event.x;
		d.fy = event.y;
	}

	function dragended(event: d3.D3DragEvent<SVGCircleElement, NodeType, any>, d: NodeType) {
		if (!event.active && simulation) simulation.alphaTarget(0);
		d.fx = null;
		d.fy = null;
	}

	onMount(() => {
		if (!svgElement) return;

		const nodeRadius = 10;
		const linkDistance = 50;

		// Create the simulation
		simulation = d3
			.forceSimulation<NodeType>(nodes)
			.force(
				'link',
				d3
					.forceLink<NodeType, LinkType>(links)
					.id((d) => d.id)
					.distance(linkDistance)
					.strength(0.6)
			)
			.force('charge', d3.forceManyBody<NodeType>().strength(-150))
			.force('collide', d3.forceCollide<NodeType>().radius(nodeRadius + 2))
			.force('center', d3.forceCenter(width / 2, height / 2))
			.velocityDecay(0.4)
			.alphaMin(0.001);

		// Define the tick handler
		simulation.on('tick', () => {
			nodes = simulation!.nodes(); // Re-assign to trigger reactivity
		});

		// Zoom behavior
		const zoomBehavior = d3
			.zoom<SVGSVGElement, unknown>()
			.scaleExtent([0.1, 8])
			.on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
				currentTransform = event.transform;
			});

		// Apply the zoom behavior to the SVG element
		d3.select(svgElement).call(zoomBehavior);

		console.log('Simulation initialized.');

		return () => {
			simulation?.stop();
			console.log('Simulation stopped.');
		};
	});

	// Apply drag behavior after nodes are rendered
	$effect(() => {
		if (svgElement && nodes.length > 0) {
			const dragBehavior = d3
				.drag<SVGCircleElement, NodeType>()
				.on('start', dragstarted)
				.on('drag', dragged)
				.on('end', dragended);

			d3.select(svgElement)
				.selectAll<SVGCircleElement, NodeType>('circle.node')
				.data(nodes, (d) => d.id)
				.call(dragBehavior);
		}
	});

	// Add a function to toggle the legend visibility
	function toggleLegend() {
		showLegend = !showLegend;
	}

	// Add these zoom control functions to the script section
	function zoomIn() {
		if (!svgElement) return;
		const zoom = d3.zoom<SVGSVGElement, unknown>().on('zoom', handleZoom);
		d3.select(svgElement)
			.transition()
			.call(zoom.scaleBy, 1.5);
	}

	function zoomOut() {
		if (!svgElement) return;
		const zoom = d3.zoom<SVGSVGElement, unknown>().on('zoom', handleZoom);
		d3.select(svgElement)
			.transition()
			.call(zoom.scaleBy, 0.75);
	}

	function resetZoom() {
		if (!svgElement) return;
		const zoom = d3.zoom<SVGSVGElement, unknown>().on('zoom', handleZoom);
		d3.select(svgElement)
			.transition()
			.call(zoom.transform, d3.zoomIdentity);
	}
	
	// Ensure you have this handleZoom function defined
	function handleZoom(event: d3.D3ZoomEvent<SVGSVGElement, unknown>) {
		currentTransform = event.transform;
	}
</script>

<div class="chart-container relative w-full h-[600px] border border-gray-300 overflow-hidden">
	<!-- Control buttons -->
	<div class="absolute top-4 left-4 z-10 flex gap-2">
		<button class="bg-white dark:bg-gray-800 p-2 rounded shadow-md text-xs" on:click={toggleLegend}>
			{showLegend ? 'Hide' : 'Show'} Legend
		</button>
	</div>

	<!-- Add zoom controls -->
	<div class="absolute bottom-4 right-4 z-10 flex gap-2">
		<button 
			class="bg-white dark:bg-gray-800 p-2 rounded shadow-md text-xs"
			on:click={zoomIn}
			aria-label="Zoom in"
		>
			<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
			</svg>
		</button>
		<button 
			class="bg-white dark:bg-gray-800 p-2 rounded shadow-md text-xs"
			on:click={zoomOut}
			aria-label="Zoom out"
		>
			<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
			</svg>
		</button>
		<button 
			class="bg-white dark:bg-gray-800 p-2 rounded shadow-md text-xs"
			on:click={resetZoom}
			aria-label="Reset zoom"
		>
			<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
			</svg>
		</button>
	</div>

	<!-- Legend component -->
	{#if showLegend}
		<Legend position="top-right" />
	{/if}

	<!-- Add accessible SVG title and description -->
	<svg
		bind:this={svgElement}
		{width}
		{height}
		class="block"
		role="img"
		aria-labelledby="graphTitle graphDesc"
	>
		<title id="graphTitle">Node.js Dependency Graph</title>
		<desc id="graphDesc"
			>A force-directed graph visualizing the dependencies from a Node.js project.</desc
		>

		<g transform={currentTransform.toString()}>
			<g class="links">
				{#each links as link (link.index ?? `${link.source}-${link.target}`)}
					<line
						class="link"
						stroke={link.type === 'dev' ? '#fca5a5' : '#d1d5db'}
						stroke-width={Math.sqrt(1)}
						x1={(link.source as NodeType).x}
						y1={(link.source as NodeType).y}
						x2={(link.target as NodeType).x}
						y2={(link.target as NodeType).y}
					/>
				{/each}
			</g>

			<g class="nodes">
				{#each nodes as node (node.id)}
					<circle
						class="node hover:stroke-blue-500 cursor-pointer"
						cx={node.x}
						cy={node.y}
						r={10}
						fill={getNodeColor(node)}
						stroke={getNodeStroke(node)}
						stroke-width={getNodeStrokeWidth(node)}
						on:mouseenter={(e) => showTooltip(e, node)}
						on:mouseleave={hideTooltip}
					>
						<title>{node.id}</title>
					</circle>
				{/each}
			</g>
		</g>
	</svg>

	{#if tooltipData.node}
		<div
			class="tooltip absolute z-10 px-3 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg shadow-sm dark:bg-gray-700"
			style="left: {tooltipData.x + 15}px; top: {tooltipData.y + 15}px; pointer-events: none;"
		>
			<strong>{tooltipData.node.name}</strong><br/>
			Version: {tooltipData.node.version}<br/>
			Type: {tooltipData.node.type || 'production'}<br/>
			{#if tooltipData.node.hasMultipleVersions}
				<span class="text-orange-300 font-semibold">Version conflict!</span><br/>
				{#if getVersionConflictInfo(tooltipData.node)}
					<span class="text-xs opacity-80">{getVersionConflictInfo(tooltipData.node)}</span><br/>
				{/if}
			{/if}
		</div>
	{/if}
</div>

<style>
	.link {
		stroke-opacity: 0.6;
	}
	.node:hover {
		stroke-width: 3;
	}
	.tooltip {
		max-width: 300px;
		white-space: pre-wrap;
		word-break: break-all;
	}
</style>
