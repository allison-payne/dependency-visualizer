<script lang="ts">
	import type { DependencyGraphData, LinkType, NodeType } from '$lib/types';
	import * as d3 from 'd3';
	import { onMount, onDestroy } from 'svelte';
	import Legend from './Legend.svelte';

	const { data, searchTerm = '' } = $props<{
		data: DependencyGraphData;
		searchTerm?: string;
	}>();

	let nodes = $state<NodeType[]>(data.nodes);
	let links = $state<LinkType[]>(data.links);
	let svgElement: SVGSVGElement | null = $state(null);
	let simulation: d3.Simulation<NodeType, LinkType> | null = null;
	let currentTransform = $state(d3.zoomIdentity);
	// Add this line to define zoomBehavior at the component level
	let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = $state(null);
	let width = $state(800);
	let height = $state(600);
	let tooltipData = $state<{ node: NodeType | null; x: number; y: number }>({
		node: null,
		x: 0,
		y: 0
	});
	let selectedNode = $state<NodeType | null>(null);
	let focusIndex = $state(-1); // Track keyboard focus position
	let showLegend = $state(true);

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
			.filter((n) => n.name === node.name && n.version !== node.version)
			.map((n) => n.version);

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

	// Add a function to toggle the legend visibility
	function toggleLegend() {
		showLegend = !showLegend;
	}

	// Add these zoom control functions to the script section
	function zoomIn() {
		if (!svgElement || !zoomBehavior) return;
		d3.select(svgElement).transition().call(zoomBehavior.scaleBy, 1.5);
	}

	function zoomOut() {
		if (!svgElement || !zoomBehavior) return;
		d3.select(svgElement).transition().call(zoomBehavior.scaleBy, 0.75);
	}

	function resetZoom() {
		if (!svgElement || !zoomBehavior) return;
		d3.select(svgElement).transition().call(zoomBehavior.transform, d3.zoomIdentity);
	}

	// Ensure you have this handleZoom function defined
	function handleZoom(event: d3.D3ZoomEvent<SVGSVGElement, unknown>) {
		currentTransform = event.transform;
	}

	// New keyboard navigation functions
	function handleKeyDown(event: KeyboardEvent) {
		if (!nodes || nodes.length === 0) return;

		switch (event.key) {
			case 'ArrowRight':
				focusIndex = (focusIndex + 1) % nodes.length;
				selectNode(nodes[focusIndex]);
				event.preventDefault();
				break;
			case 'ArrowLeft':
				focusIndex = (focusIndex - 1 + nodes.length) % nodes.length;
				selectNode(nodes[focusIndex]);
				event.preventDefault();
				break;
			case 'Enter':
			case ' ':
				if (focusIndex >= 0 && focusIndex < nodes.length) {
					toggleNodeSelection(nodes[focusIndex]);
					event.preventDefault();
				}
				break;
			case 'Escape':
				selectedNode = null;
				focusIndex = -1;
				event.preventDefault();
				break;
		}
	}

	function selectNode(node: NodeType) {
		selectedNode = node;
		// Center view on selected node if it exists
		if (node && node.x && node.y && svgElement && zoomBehavior) {
			const transform = d3.zoomIdentity
				.translate(width / 2, height / 2)
				.scale(1.2)
				.translate(-node.x, -node.y);

			d3.select(svgElement).transition().duration(500).call(zoomBehavior.transform, transform);
		}
	}

	function toggleNodeSelection(node: NodeType) {
		selectedNode = selectedNode === node ? null : node;
	}

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

	// When data changes (filtering occurs)
	$effect(() => {
		// Stop any current simulation first
		if (simulation) {
			simulation.stop();
			
			// Only restart if we have enough nodes to warrant simulation
			if (data.nodes.length > 1) {
				simulation.nodes(data.nodes);
				simulation.force<d3.ForceLink<NodeType, LinkType>>('link')?.links(data.links);
				
				// Use reduced alpha for faster stabilization on filter changes
				simulation.alpha(0.3).restart();
			}
		}
	});

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
		zoomBehavior = d3
			.zoom<SVGSVGElement, unknown>()
			.scaleExtent([0.1, 8])
			.on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
				currentTransform = event.transform;
			});

		// Apply the zoom behavior to the SVG element
		d3.select(svgElement).call(zoomBehavior);

		console.log('Simulation initialized.');

		// Make the SVG element keyboard focusable
		if (svgElement) {
			svgElement.setAttribute('tabindex', '0');
			svgElement.addEventListener('keydown', handleKeyDown);
		}

		// Clean up event listeners
		return () => {
			if (svgElement) {
				svgElement.removeEventListener('keydown', handleKeyDown);
			}
			if (simulation) simulation.stop();
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
				.data(nodes, (d) => d && d.id)
				.call(dragBehavior);
		}
	});
</script>

<div class="chart-container relative w-full h-[600px] border border-gray-300 overflow-hidden">
	<!-- Control buttons -->
	<div class="absolute top-4 left-4 z-10 flex gap-2">
		<button class="bg-white dark:bg-gray-800 p-2 rounded shadow-md text-xs" onclick={toggleLegend}>
			{showLegend ? 'Hide' : 'Show'} Legend
		</button>
	</div>

	<!-- Add zoom controls -->
	<div class="absolute bottom-4 right-4 z-10 flex gap-2">
		<button
			class="bg-white dark:bg-gray-800 p-2 rounded shadow-md text-xs"
			onclick={zoomIn}
			aria-label="Zoom in"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
			</svg>
		</button>
		<button
			class="bg-white dark:bg-gray-800 p-2 rounded shadow-md text-xs"
			onclick={zoomOut}
			aria-label="Zoom out"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4" />
			</svg>
		</button>
		<button
			class="bg-white dark:bg-gray-800 p-2 rounded shadow-md text-xs"
			onclick={resetZoom}
			aria-label="Reset zoom"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-4 w-4"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"
				/>
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
			<g class="links" aria-hidden="true">
				{#each links as link (links.indexOf(link))}
					<line
						class="link stroke-gray-400"
						stroke-width={1}
						x1={(link.source as NodeType).x}
						y1={(link.source as NodeType).y}
						x2={(link.target as NodeType).x}
						y2={(link.target as NodeType).y}
					/>
				{/each}
			</g>

			<g class="nodes">
				{#each nodes as node, i (node.id)}
					<g
						class="node-group"
						transform={`translate(${node.x}, ${node.y})`}
						role="button"
						aria-pressed={selectedNode === node}
						data-index={i}
						tabindex="0"
						onclick={() => toggleNodeSelection(node)}
						onkeydown={(e) =>
							e.key === 'Enter' || e.key === ' ' ? toggleNodeSelection(node) : null}
						onmouseenter={(e) => showTooltip(e, node)}
						onmouseleave={hideTooltip}
						aria-label={`${node.name} version ${node.version}`}
					>
						<circle
							class={`node stroke-black cursor-pointer ${focusIndex === i ? 'focus-visible' : ''} ${selectedNode === node ? 'selected' : ''} ${node.name.startsWith('@types') ? 'types-package' : ''}`}
							r={10}
							fill={getNodeColor(node)}
							stroke-width={selectedNode === node ? 3 : 1.5}
						>
							<!-- Add accessible title -->
							<title>{node.name} @ {node.version}</title>
						</circle>

						<!-- Add a visual pattern for types packages instead of just color -->
						{#if node.name.startsWith('@types')}
							<circle r="4" fill="white" stroke="none" />
						{/if}

						<!-- Add a small badge for selected node for additional visual cue -->
						{#if selectedNode === node}
							<circle r="3" cx="7" cy="-7" fill="#38bdf8" stroke="white" stroke-width="1" />
						{/if}
					</g>
				{/each}
			</g>
		</g>
	</svg>

	{#if tooltipData.node}
		<div
			class="tooltip absolute z-10 px-3 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg shadow-sm dark:bg-gray-700"
			style="left: {tooltipData.x + 15}px; top: {tooltipData.y + 15}px; pointer-events: none;"
			role="tooltip"
		>
			<strong>{tooltipData.node.name}</strong><br />
			Version: {tooltipData.node.version}<br />
			ID: {tooltipData.node.id}
		</div>
	{/if}

	<!-- Screen reader only instructions -->
	<div class="sr-only">
		<p>
			Use arrow keys to navigate between nodes. Press Enter or Space to select a node. Press Escape
			to clear selection.
		</p>
	</div>
</div>

<style>
	.link {
		stroke-opacity: 0.6;
	}
	.node {
		stroke-opacity: 0.8;
		transition: stroke-width 0.2s;
	}
	.node:hover {
		stroke-width: 3;
	}
	.node.selected {
		stroke: #38bdf8;
	}
	.node.focus-visible {
		stroke: #38bdf8;
		stroke-width: 3;
		stroke-dasharray: 5, 2;
	}
	.types-package {
		/* Pattern for types packages in addition to color */
	}
	.tooltip {
		max-width: 300px;
		white-space: pre-wrap;
		word-break: break-all;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border-width: 0;
	}
</style>
