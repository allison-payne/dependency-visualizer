<script lang="ts">
  import { parseLockfile } from '$lib/utils/lockfileParser';
  import DependencyGraph from '$lib/components/DependencyGraph.svelte';
  import AccessibleTable from '$lib/components/AccessibleTable.svelte';
  import Controls from '$lib/components/Controls.svelte';
  import type { DependencyGraphData } from '$lib/types';
  
  let lockfileContent = $state<string | null>(null);
  let graphData = $state<DependencyGraphData | null>(null);
  let errorMsg = $state<string | null>(null);
  let isLoading = $state<boolean>(false);
  let showTableView = $state(false);
  
  // GitHub repo input state
  let githubRepoUrl = $state('');
  let githubBranch = $state('main');
  let lockfileType = $state('package-lock.json');
  let loadingSource = $state<'upload' | 'github' | null>(null);
  
  const acceptedFileTypes = [
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml'
  ];

  // Detect lockfile type from filename
  function detectLockfileType(filename: string): string {
    if (filename.endsWith('yarn.lock')) return 'yarn';
    if (filename.endsWith('pnpm-lock.yaml')) return 'pnpm';
    return 'package-lock'; // default
  }

  async function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    loadingSource = 'upload';
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
        loadingSource = null;
      }
    };
    reader.onerror = () => {
      errorMsg = 'Error reading file.';
      isLoading = false;
      loadingSource = null;
    };
    reader.readAsText(file);
  }

  // New function to fetch lockfile from GitHub
  async function fetchFromGitHub() {
    if (!githubRepoUrl) {
      errorMsg = "Please enter a GitHub repository URL";
      return;
    }
    
    try {
      loadingSource = 'github';
      isLoading = true;
      errorMsg = null;
      graphData = null;
      lockfileContent = null;

      // Parse GitHub URL
      let owner, repo, path = '';
      
      // Handle different GitHub URL formats
      if (githubRepoUrl.includes('github.com')) {
        // Extract owner/repo from URL
        const urlParts = githubRepoUrl
          .replace('https://github.com/', '')
          .replace('http://github.com/', '')
          .replace('github.com/', '')
          .split('/');
        
        owner = urlParts[0];
        repo = urlParts[1];
        
        // If URL points directly to a file
        if (urlParts.length > 2 && urlParts.includes('blob')) {
          // Handle URL like: github.com/owner/repo/blob/branch/path/to/file
          const blobIndex = urlParts.indexOf('blob');
          if (blobIndex !== -1 && urlParts.length > blobIndex + 2) {
            githubBranch = urlParts[blobIndex + 1];
            path = urlParts.slice(blobIndex + 2).join('/');
          }
        } else {
          // Just use the provided lockfile type
          path = lockfileType;
        }
      } else {
        // Assuming simple format: owner/repo
        const parts = githubRepoUrl.split('/');
        if (parts.length >= 2) {
          owner = parts[0];
          repo = parts[1];
          path = lockfileType;
        } else {
          throw new Error("Invalid GitHub repository format. Please use 'owner/repo' or full GitHub URL");
        }
      }
      
      if (!owner || !repo) {
        throw new Error("Could not parse GitHub repository information");
      }
      
      // Construct raw content URL
      const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${githubBranch}/${path}`;
      console.log(`Fetching lockfile from: ${rawUrl}`);
      
      // Fetch the file
      const response = await fetch(rawUrl);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch lockfile (${response.status}): ${response.statusText}`);
      }
      
      const content = await response.text();
      lockfileContent = content;
      
      // Parse the lockfile
      graphData = await parseLockfile(content, path);
      
    } catch (err: any) {
      errorMsg = `Error fetching from GitHub: ${err.message}`;
      console.error(err);
    } finally {
      isLoading = false;
      loadingSource = null;
    }
  }

  function toggleView() {
    showTableView = !showTableView;
  }
</script>

<section class="space-y-6">
  <!-- File Upload Card -->
  <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
    <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">Upload Dependency File</h2>
    
    <div class="space-y-4">
      <div class="flex flex-col">
        <label class="block mb-2 text-sm font-medium text-gray-900 dark:text-white" for="lockfile_input">
          Choose a lockfile from your device
        </label>
        <div class="flex flex-col sm:flex-row gap-4">
          <input
            class="block flex-grow text-sm text-gray-900 dark:text-gray-300
                  border border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer
                  bg-gray-50 dark:bg-gray-700 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400
                  file:mr-4 file:py-2 file:px-4 file:border-0
                  file:text-sm file:font-medium file:text-white
                  file:bg-blue-600 dark:file:bg-blue-500 file:hover:bg-blue-700 dark:file:hover:bg-blue-600"
            id="lockfile_input"
            type="file"
            accept=".json,.lock,.yaml"
            onchange={handleFileSelect}
            disabled={isLoading}
            aria-describedby="file-input-help"
          />
        </div>
        <p id="file-input-help" class="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Upload a package-lock.json, yarn.lock, or pnpm-lock.yaml file to visualize dependencies.
        </p>
      </div>
      
      {#if acceptedFileTypes.length > 0}
        <div class="mt-2 flex flex-wrap gap-2">
          {#each acceptedFileTypes as fileType}
            <span class="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-full">
              {fileType}
            </span>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- GitHub Repository Card -->
  <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
    <h2 class="text-xl font-bold mb-4 text-gray-900 dark:text-white">Fetch from GitHub</h2>
    
    <div class="space-y-4">
      <div class="flex flex-col">
        <label class="block mb-2 text-sm font-medium text-gray-900 dark:text-white" for="github_repo">
          GitHub repository URL or owner/repo format
        </label>
        <div class="flex flex-col sm:flex-row gap-4">
          <input
            class="block flex-grow text-sm text-gray-900 dark:text-gray-300
                  border border-gray-300 dark:border-gray-600 rounded-lg
                  bg-gray-50 dark:bg-gray-700 p-2.5 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400"
            id="github_repo"
            type="text"
            placeholder="e.g., facebook/react or https://github.com/facebook/react"
            bind:value={githubRepoUrl}
            disabled={isLoading}
          />
        </div>
        <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Enter a GitHub repository URL or just 'owner/repo' to fetch the lockfile directly.
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="block mb-2 text-sm font-medium text-gray-900 dark:text-white" for="github_branch">
            Branch
          </label>
          <input
            class="block w-full text-sm text-gray-900 dark:text-gray-300
                  border border-gray-300 dark:border-gray-600 rounded-lg
                  bg-gray-50 dark:bg-gray-700 p-2.5 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400"
            id="github_branch"
            type="text"
            placeholder="main"
            bind:value={githubBranch}
            disabled={isLoading}
          />
        </div>

        <div>
          <label class="block mb-2 text-sm font-medium text-gray-900 dark:text-white" for="lockfile_type">
            Lockfile Type
          </label>
          <select
            class="block w-full text-sm text-gray-900 dark:text-gray-300
                  border border-gray-300 dark:border-gray-600 rounded-lg
                  bg-gray-50 dark:bg-gray-700 p-2.5 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400"
            id="lockfile_type"
            bind:value={lockfileType}
            disabled={isLoading}
          >
            <option value="package-lock.json">package-lock.json (npm)</option>
            <option value="yarn.lock">yarn.lock (Yarn)</option>
            <option value="pnpm-lock.yaml">pnpm-lock.yaml (pnpm)</option>
          </select>
        </div>
      </div>

      <div class="flex justify-end">
        <button 
          class="px-4 py-2 text-sm font-medium text-white bg-blue-600 dark:bg-blue-500 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onclick={fetchFromGitHub}
          disabled={isLoading || !githubRepoUrl}
        >
          {isLoading && loadingSource === 'github' ? 
            'Fetching...' : 
            'Fetch Lockfile'}
        </button>
      </div>
    </div>
  </div>

  {#if isLoading}
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 text-center" aria-live="polite" role="status">
      <div class="flex flex-col items-center justify-center space-y-4">
        <div class="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 dark:border-blue-500 border-r-transparent"></div>
        <p class="text-gray-700 dark:text-gray-300">
          {loadingSource === 'github' ? 
            'Fetching lockfile from GitHub...' : 
            'Loading your dependency graph...'}
        </p>
      </div>
    </div>
  {/if}
  
  {#if errorMsg}
    <div class="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4" role="alert" aria-live="assertive">
      <div class="flex">
        <svg class="h-5 w-5 text-red-500 dark:text-red-400 mr-3 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zm-1 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/>
        </svg>
        <p class="text-red-700 dark:text-red-300">{errorMsg}</p>
      </div>
    </div>
  {/if}
  
  {#if graphData}
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
      <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white">Dependency Graph</h2>
        <div class="flex space-x-2">
          <button 
            class="px-4 py-2 text-sm font-medium text-white bg-blue-600 dark:bg-blue-500 rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            onclick={toggleView}
            aria-pressed={showTableView}
          >
            {showTableView ? 'Show Graph View' : 'Show Accessible Table View'}
          </button>
        </div>
      </div>
      
      <div class="graph-container">
        {#if showTableView}
          <div class="p-4">
            <AccessibleTable data={graphData} />
          </div>
        {:else}
          <Controls graphData={graphData} />
        {/if}
      </div>
    </div>
    
    <div class="sr-only" aria-live="polite">
      Dependency graph loaded with {graphData.nodes.length} packages and {graphData.links.length} dependencies.
      {showTableView ? 'Currently showing table view.' : 'Currently showing graph visualization.'}
    </div>
  {/if}
</section>

<style lang="postcss">
  .graph-container {
    min-height: 70vh;
  }
</style>
