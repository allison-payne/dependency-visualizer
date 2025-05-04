<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as d3 from 'd3';
  import type { NodeType, LinkType, DependencyGraphData } from '$lib/utils/lockfileParser';

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
  let tooltipData = $state<{ node: NodeType | null, x: number, y: number }>({ node: null, x: 0, y: 0 });

  // Initialize state when data prop changes
  $effect(() => {
    console.log("Data prop changed, updating state...");
    // Create copies to avoid mutating the prop directly and ensure reactivity
    nodes = data.nodes.map((n: any) => ({...n}));
    links = data.links.map((l: any) => ({...l}));

    // Restart simulation if it already exists and nodes/links change
    if (simulation) {
      console.log("Restarting simulation with new data.");
      simulation.nodes(nodes);
      simulation.force<d3.ForceLink<NodeType, LinkType>>('link')?.links(links);
      simulation.alpha(0.3).restart(); // Reheat simulation
    }
  });

  // Filter nodes based on search term
  $effect(() => {
    if (!searchTerm.trim() || !data) {
      // If no search term, show all nodes from original data
      nodes = data.nodes.map((n: any) => ({...n}));
      links = data.links.map((l: any) => ({...l}));
    } else {
      const lowerSearchTerm = searchTerm.toLowerCase();
      const matchingNodeIds = new Set(
        data.nodes
          .filter((node: { id: string; }) => node.id.toLowerCase().includes(lowerSearchTerm))
          .map((node: { id: any; }) => node.id)
      );
      
      // Only show matching nodes
      nodes = data.nodes.filter((node: { id: unknown; }) => matchingNodeIds.has(node.id));
      
      // Only show links between matching nodes
      const filteredNodeIds = new Set(nodes.map(n => n.id));
      links = data.links.filter((link: { source: string; target: string; }) =>
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

  function getNodeColor(node: NodeType): string {
    // Add logic based on node properties
    return node.name.startsWith('@types') ? '#4e9a06' : '#3465a4';
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
    simulation = d3.forceSimulation<NodeType>(nodes)
      .force('link', d3.forceLink<NodeType, LinkType>(links)
        .id(d => d.id)
        .distance(linkDistance)
        .strength(0.6))
      .force('charge', d3.forceManyBody<NodeType>()
        .strength(-150))
      .force('collide', d3.forceCollide<NodeType>()
        .radius(nodeRadius + 2))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .velocityDecay(0.4)
      .alphaMin(0.001);

    // Define the tick handler
    simulation.on('tick', () => {
      nodes = simulation!.nodes(); // Re-assign to trigger reactivity
    });

    // Zoom behavior
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        currentTransform = event.transform;
      });

    // Apply the zoom behavior to the SVG element
    d3.select(svgElement).call(zoomBehavior);

    console.log("Simulation initialized.");

    return () => {
      simulation?.stop();
      console.log("Simulation stopped.");
    };
  });

  // Apply drag behavior after nodes are rendered
  $effect(() => {
    if (svgElement && nodes.length > 0) {
      const dragBehavior = d3.drag<SVGCircleElement, NodeType>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);

      d3.select(svgElement)
        .selectAll<SVGCircleElement, NodeType>('circle.node')
        .data(nodes, d => d.id)
        .call(dragBehavior);
    }
  });
</script>

<div class="chart-container relative w-full h-[600px] border border-gray-300 overflow-hidden">
  <!-- Add accessible SVG title and description -->
  <svg bind:this={svgElement} {width} {height} class="block" role="img" aria-labelledby="graphTitle graphDesc">
    <title id="graphTitle">Node.js Dependency Graph</title>
    <desc id="graphDesc">A force-directed graph visualizing the dependencies from a Node.js project.</desc>
    
    <g transform={currentTransform.toString()}>
      <g class="links">
        {#each links as link (link.index ?? `${link.source}-${link.target}`)}
          <line
            class="link stroke-gray-400"
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
            class="node stroke-black hover:stroke-blue-500 cursor-pointer"
            cx={node.x}
            cy={node.y}
            r={10}
            fill={getNodeColor(node)}
            stroke-width={1.5}
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
      ID: {tooltipData.node.id}
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