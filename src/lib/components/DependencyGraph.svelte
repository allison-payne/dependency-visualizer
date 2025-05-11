<script lang="ts">
	import type { DependencyGraphData, LinkType, NodeType } from '$lib/types';
	import * as d3 from 'd3';
	import { onMount, onDestroy } from 'svelte';
	import Legend from './Legend.svelte';
	import { isTypeDefinition } from '$lib/utils/lockfileParser';

	const { data = '' } = $props<{
		data: DependencyGraphData;
	}>();

	let nodes = $state<NodeType[]>(data.nodes);
	let links = $state<LinkType[]>(data.links);
	let svgElement: SVGSVGElement | null = $state(null);
	let containerElement: HTMLDivElement | null = $state(null);
	let simulation: d3.Simulation<NodeType, LinkType> | null = null;
	let currentTransform = $state(d3.zoomIdentity);
	let zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown> | null = $state(null);
	let width = $state(800);
	let height = $state(600);
	let tooltipData = $state<{ node: NodeType | null; x: number; y: number; svgX: number; svgY: number; }>({
		node: null,
		x: 0,
		y: 0,
		svgX: 0,
		svgY: 0
	});
	let selectedNode = $state<NodeType | null>(null);
	let focusIndex = $state(-1); // Track keyboard focus position
	let showLegend = $state(true);
	let lastDataId = $state('');
	let resizeObserver: ResizeObserver | null = $state(null);

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
		return 'currentColor'; // Use text color for stroke
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
		if (!svgElement) return;
		
		// Get SVG coordinates - needed to position tooltip relative to SVG container
		const svgRect = svgElement.getBoundingClientRect();
		
		// Calculate position relative to the SVG element while accounting for zoom/pan
		const mouseX = event.clientX;
		const mouseY = event.clientY;
		
		// Store both screen coordinates and SVG-relative coordinates
		tooltipData = { 
			node, 
			x: mouseX, 
			y: mouseY,
			svgX: mouseX - svgRect.left,
			svgY: mouseY - svgRect.top
		};
	}

	function hideTooltip() {
		tooltipData = { node: null, x: 0, y: 0, svgX: 0, svgY: 0 };
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

	// Update container dimensions when it resizes
	function updateDimensions() {
		if (!containerElement) return;
		
		const rect = containerElement.getBoundingClientRect();
		width = rect.width;
		height = rect.height;
		
		// Update force center when dimensions change
		if (simulation) {
			simulation.force('center', d3.forceCenter(width / 2, height / 2));
			simulation.alpha(0.3).restart(); // Reheat the simulation to adjust to new dimensions
		}
	}

	// Combine your effects into one that handles all data updates
	$effect(() => {
		// Generate a better ID that includes node content
		const nodeIds = data.nodes.map((n: NodeType) => n.id).join(',');
		const currentDataId = `${data.nodes.length}-${data.links.length}-${nodeIds.substring(0, 100)}`;

		// Skip if data hasn't actually changed
		if (currentDataId === lastDataId) return;
		lastDataId = currentDataId;

		console.log('Data changed, updating simulation...');

		if (simulation) simulation.stop();

		// Update local state
		nodes = data.nodes.map((n: NodeType) => {
			const node = { ...n };
			// Set the isTypeDefinition property based on the helper function
			node.isTypeDefinition = isTypeDefinition(node);
			return node;
		});
		links = data.links.map((l: LinkType) => ({ ...l }));

		// Restart simulation if it exists
		if (simulation && nodes.length > 1) {
			simulation.nodes(nodes);
			simulation.force<d3.ForceLink<NodeType, LinkType>>('link')?.links(links);
			simulation.alpha(0.3).restart();
		}
	});

	onMount(() => {
		if (!svgElement || !containerElement) return;
	
		// Set initial dimensions based on container
		updateDimensions();

		// Watch for container resizes
		resizeObserver = new ResizeObserver(entries => {
			updateDimensions();
		});
		resizeObserver.observe(containerElement);

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
			// Use a microtask to update nodes after the current tick
			queueMicrotask(() => {
				nodes = [...simulation!.nodes()]; // Create new array reference to trigger reactivity
			});
		});

		// Zoom behavior
		zoomBehavior = d3
			.zoom<SVGSVGElement, unknown>()
			.scaleExtent([0.1, 8])
			.on('zoom', handleZoom);

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
			if (resizeObserver) resizeObserver.disconnect();
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

<div class="chart-container w-full h-full min-h-[500px] relative" bind:this={containerElement}>
	<!-- Control buttons: styled with more consistent colors and better positioning -->
	<div class="absolute top-4 left-4 z-10 flex gap-2">
		<button
			class="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 p-2 rounded shadow-md text-xs transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
			onclick={toggleLegend}
		>
			{showLegend ? 'Hide' : 'Show'} Legend
		</button>
	</div>

	<!-- Zoom controls: styled with more consistent colors -->
	<div class="absolute bottom-4 right-4 z-10 flex gap-2">
		<button
			class="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 p-2 rounded shadow-md text-xs hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
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
			class="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 p-2 rounded shadow-md text-xs hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
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
			class="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-200 p-2 rounded shadow-md text-xs hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
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
		class="w-full h-full bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
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
						class="link stroke-gray-400 dark:stroke-gray-600"
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
						aria-label={`${node.name} version ${node.version}, ${node.type || 'production'} dependency`}
					>
						<circle
							class={`node cursor-pointer ${focusIndex === i ? 'focus-visible' : ''} ${
								selectedNode === node ? 'selected' : ''
							} ${node.name.startsWith('@types') ? 'types-package' : ''} ${
								node.hasMultipleVersions ? 'version-conflict' : ''
							} ${node.type ? `dep-${node.type}` : 'dep-prod'}`}
							r={10}
							fill={getNodeColor(node)}
							stroke={getNodeStroke(node)}
							stroke-width={getNodeStrokeWidth(node)}
							stroke-dasharray={node.hasMultipleVersions ? '3,2' : '0'}
						>
							<!-- Add accessible title -->
							<title>{node.name} @ {node.version}</title>
						</circle>

						<!-- Add visual indicators for dependency types -->
						{#if node.type === 'dev'}
							<!-- Dev dependency: Add a small "D" -->
							<text dy="0.35em" text-anchor="middle" class="text-[7px] fill-white font-bold">D</text>
						{:else if node.type === 'peer'}
							<!-- Peer dependency: Add a small "P" -->
							<text dy="0.35em" text-anchor="middle" class="text-[7px] fill-white font-bold">P</text>
						{:else if node.type === 'optional'}
							<!-- Optional dependency: Add a small "O" -->
							<text dy="0.35em" text-anchor="middle" class="text-[7px] fill-white font-bold">O</text>
						{/if}

						<!-- Add a visual pattern for types packages -->
						{#if node.name.startsWith('@types')}
							<circle r="4" fill="white" stroke="none" />
							<text dy="0.35em" text-anchor="middle" class="text-[6px] fill-black font-bold">TS</text>
						{/if}

						<!-- Add a small badge for selected node -->
						{#if selectedNode === node}
							<circle r="3" cx="7" cy="-7" fill="#38bdf8" stroke="white" stroke-width="1" />
						{/if}
					</g>
				{/each}
			</g>
		</g>
	</svg>

	<!-- Fixed tooltip positioning that follows the node -->
	{#if tooltipData.node}
		<div
			class="tooltip absolute z-20 px-3 py-2 text-sm font-medium text-white bg-gray-900 dark:bg-gray-800 rounded-lg shadow-lg border border-gray-700 dark:border-gray-600"
			style="left: {tooltipData.x}px; top: {tooltipData.y - 10}px; transform: translate(-50%, -100%); pointer-events: none;"
			role="tooltip"
		>
			<div class="tooltip-content max-w-xs">
				<strong class="font-semibold">{tooltipData.node.name}</strong>
				<div class="text-gray-300 dark:text-gray-400 text-xs mt-1">
					Version: <span class="text-white dark:text-gray-200">{tooltipData.node.version}</span>
				</div>
				{#if tooltipData.node.type}
					<div class="text-gray-300 dark:text-gray-400 text-xs">
						Type: <span class="text-white dark:text-gray-200">{tooltipData.node.type}</span>
					</div>
				{/if}
				{#if tooltipData.node.hasMultipleVersions}
					<div class="mt-2 pt-1 border-t border-gray-700 dark:border-gray-600">
						<span class="text-orange-300 flex items-center text-xs">
							<svg class="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
								<path d="M10 1L12.294 6.344H18L13.428 9.815L15.294 15.5L10 11.685L4.706 15.5L6.572 9.815L2 6.344H7.706L10 1z"/>
							</svg>
							Version conflict detected
						</span>
						{#if getVersionConflictInfo(tooltipData.node)}
							<div class="text-xs mt-1">{getVersionConflictInfo(tooltipData.node)}</div>
						{/if}
					</div>
				{/if}
				<div class="tooltip-arrow"></div>
			</div>
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
	
	/* Tooltip styling with arrow */
	.tooltip-arrow {
		position: absolute;
		width: 0;
		height: 0;
		border-left: 8px solid transparent;
		border-right: 8px solid transparent;
		border-top: 8px solid #1f2937; /* Match tooltip background */
		bottom: -8px;
		left: 50%;
		margin-left: -8px;
	}
	
	:global(.dark) .tooltip-arrow {
		border-top-color: #1e293b; /* Match dark mode tooltip background */
	}
	
	/* Styling for different dependency types */
	.node.dep-dev {
		filter: drop-shadow(0 0 2px rgba(239, 68, 68, 0.5));
	}
	.node.dep-peer {
		filter: drop-shadow(0 0 2px rgba(59, 130, 246, 0.5));
	}
	.node.dep-optional {
		filter: drop-shadow(0 0 2px rgba(139, 92, 246, 0.5));
	}
	.node.dep-prod {
		filter: drop-shadow(0 0 2px rgba(16, 185, 129, 0.5));
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
	.node.version-conflict {
		stroke-opacity: 1;
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0% {
			stroke-opacity: 0.8;
		}
		50% {
			stroke-opacity: 1;
		}
		100% {
			stroke-opacity: 0.8;
		}
	}
</style>
