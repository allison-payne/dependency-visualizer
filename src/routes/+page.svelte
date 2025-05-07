<script lang="ts">
  import { parseLockfile } from '$lib/utils/lockfileParser';
  import DependencyGraph from '$lib/components/DependencyGraph.svelte';
  import AccessibleTable from '$lib/components/AccessibleTable.svelte';
	import type { DependencyGraphData } from '$lib/types';
  
  let lockfileContent = $state<string | null>(null);
  let graphData = $state<DependencyGraphData | null>(null);
  let errorMsg = $state<string | null>(null);
  let isLoading = $state<boolean>(false);
  let searchTerm = $state('');
  let showTableView = $state(false);
  
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
        
        // Determine lockfile type based on file extension
        let lockfileType: 'package-lock' | 'yarn' | 'pnpm' = 'package-lock';
        if (file.name.endsWith('yarn.lock')) {
          lockfileType = 'yarn';
        } else if (file.name.endsWith('pnpm-lock.yaml')) {
          lockfileType = 'pnpm';
        }
        
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

  // Toggle between graph and table view
  function toggleView() {
    showTableView = !showTableView;
  }
</script>

<div class="container mx-auto px-4 py-8">
  <h1 class="text-3xl font-bold mb-6">Dependency Graph Visualizer</h1>
  
  <div class="mb-4">
    <label class="block mb-2 text-sm font-medium text-gray-900 dark:text-white" for="lockfile_input">Upload Lockfile</label>
    <input
      class="block w-full text-sm text-gray-900 border border-gray-300 rounded-lg cursor-pointer bg-gray-50 dark:text-gray-400 focus:outline-none dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400"
      id="lockfile_input"
      type="file"
      accept=".json,.lock,.yaml"
      on:change={handleFileSelect}
      disabled={isLoading}
      aria-describedby="file-input-help"
    />
    <p id="file-input-help" class="mt-1 text-sm text-gray-500 dark:text-gray-300">
      Upload a package-lock.json, yarn.lock, or pnpm-lock.yaml file to visualize dependencies.
    </p>
  </div>
  
  {#if isLoading}
    <div class="text-center py-10" aria-live="polite" role="status">
      <p>Loading your dependency graph...</p>
      <div class="mt-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent align-[-0.125em]"></div>
    </div>
  {/if}
  
  {#if errorMsg}
    <div class="p-4 mb-4 text-red-800 bg-red-100 rounded-lg dark:bg-red-800 dark:text-red-200" role="alert" aria-live="assertive">
      <p>{errorMsg}</p>
    </div>
  {/if}
  
  {#if graphData}
    <div class="mb-4 flex justify-between items-center">
      <div>
        <input
          type="search"
          placeholder="Search packages..."
          bind:value={searchTerm}
          class="p-2 border rounded"
          aria-label="Search for packages"
        />
      </div>
      
      <button 
        class="px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        on:click={toggleView}
        aria-pressed={showTableView}
      >
        {showTableView ? 'Show Graph View' : 'Show Accessible Table View'}
      </button>
    </div>
    
    {#if showTableView}
      <AccessibleTable data={graphData} />
    {:else}
      <DependencyGraph data={graphData} {searchTerm} />
    {/if}
    
    <!-- Additional information for screen readers -->
    <div class="sr-only" aria-live="polite">
      Dependency graph loaded with {graphData.nodes.length} packages and {graphData.links.length} dependencies.
      {showTableView ? 'Currently showing table view.' : 'Currently showing graph visualization.'}
    </div>
  {/if}
</div>
