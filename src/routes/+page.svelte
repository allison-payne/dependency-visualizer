<script lang="ts">
  import DependencyGraph from '$lib/components/DependencyGraph.svelte';
  import { parseLockfile } from '$lib/utils/lockfileParser';
  import type { DependencyGraphData } from '$lib/types';

  let lockfileContent = $state<string | null>(null);
  let graphData = $state<DependencyGraphData | null>(null);
  let errorMsg = $state<string | null>(null);
  let isLoading = $state<boolean>(false);
  let searchTerm = $state('');

  const acceptedFileTypes = [
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml' // Add PNPM lock file
  ];

  async function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    isLoading = true;
    errorMsg = null;
    graphData = null;
    lockfileContent = null;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        lockfileContent = content;
        graphData = await parseLockfile(content, file.name);
      } catch (err: any) {
        errorMsg = `Error parsing ${file.name}: ${err.message}`;
        console.error(err);
      } finally {
        isLoading = false;
      }
    };
    reader.onerror = () => {
      errorMsg = 'Error reading file.';
      isLoading = false;
    };
    reader.readAsText(file);
  }

  // Function to export the graph as SVG
  function exportAsSVG() {
    if (!document.querySelector('.chart-container svg')) {
      return;
    }
    
    const svgElement = document.querySelector('.chart-container svg')!;
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgData], {type: 'image/svg+xml;charset=utf-8'});
    const svgUrl = URL.createObjectURL(svgBlob);
    
    const downloadLink = document.createElement('a');
    downloadLink.href = svgUrl;
    downloadLink.download = 'dependency-graph.svg';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  }
</script>

<div class="container mx-auto p-4">
  <header class="mb-6">
    <h1 class="text-3xl font-bold mb-2">Node.js Dependency Visualizer</h1>
    <p class="text-gray-600">Upload a package-lock.json or yarn.lock file to visualize your project dependencies</p>
  </header>
  
  <div class="mb-6">
    <label class="block mb-2 text-sm font-medium text-gray-900 dark:text-white" for="lockfile_input">
      Upload Lockfile
    </label>
    <input
      class="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 dark:text-gray-400 focus:outline-none dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400"
      id="lockfile_input"
      type="file"
      accept=".json,.lock,.yaml"
      onchange={handleFileSelect}
      disabled={isLoading}
    />
    {#if isLoading}
      <p class="mt-2 text-blue-500">Loading and parsing the dependency graph...</p>
    {/if}
    {#if errorMsg}
      <p class="mt-2 text-red-500">{errorMsg}</p>
    {/if}
  </div>

  <!-- Update display text if needed -->
  <div class="text-center text-sm text-gray-500 mt-2">
    Supported: package-lock.json, yarn.lock, pnpm-lock.yaml
  </div>

  {#if graphData}
    <div class="mb-4 flex flex-wrap gap-2 items-center">
      <input
        type="search"
        placeholder="Search packages..."
        bind:value={searchTerm}
        class="p-2 border rounded flex-1"
      />
      
      <!-- Export button -->
      <button 
        class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        onclick={exportAsSVG}
      >
        Export as SVG
      </button>
    </div>
    
    <DependencyGraph data={graphData} {searchTerm} />
    
    <!-- Accessible table alternative -->
    <div class="mt-6">
      <details>
        <summary class="cursor-pointer text-lg font-medium mb-2">
          View Dependencies as Table (Accessible Alternative)
        </summary>
        <div class="overflow-x-auto">
          <table class="min-w-full bg-white border border-gray-200">
            <caption class="sr-only">Node.js Package Dependencies</caption>
            <thead>
              <tr>
                <th class="px-4 py-2 border">Package</th>
                <th class="px-4 py-2 border">Version</th>
                <th class="px-4 py-2 border">Type</th>
                <th class="px-4 py-2 border">Multiple Versions?</th>
              </tr>
            </thead>
            <tbody>
              {#each graphData.nodes as node}
                <tr>
                  <td class="px-4 py-2 border">{node.name}</td>
                  <td class="px-4 py-2 border">{node.version}</td>
                  <td class="px-4 py-2 border">{node.type || 'prod'}</td>
                  <td class="px-4 py-2 border">{node.hasMultipleVersions ? 'Yes' : 'No'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  {/if}
</div>
