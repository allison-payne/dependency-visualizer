<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';

	let { children } = $props();
	let darkMode = $state(false);

	// Check for system preferences and local storage on mount
	onMount(() => {
		// Check if user has a theme preference in localStorage
		const savedTheme = localStorage.getItem('theme');
		if (savedTheme === 'dark') {
			darkMode = true;
			document.documentElement.classList.add('dark');
		} else if (savedTheme === 'light') {
			darkMode = false;
			document.documentElement.classList.remove('dark');
		} else {
			// Check system preference
			darkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
			if (darkMode) {
				document.documentElement.classList.add('dark');
			}
		}
	});

	// Toggle dark mode
	function toggleTheme() {
		darkMode = !darkMode;
		if (darkMode) {
			document.documentElement.classList.add('dark');
			localStorage.setItem('theme', 'dark');
		} else {
			document.documentElement.classList.remove('dark');
			localStorage.setItem('theme', 'light');
		}
	}
</script>

<div class="flex flex-col min-h-screen transition-colors duration-300 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
	<header class="bg-white dark:bg-gray-800 shadow">
		<div class="container mx-auto px-4 py-4 flex justify-between items-center">
			<h1 class="text-xl font-bold">GitXplorer</h1>
			<button 
				class="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
				onclick={toggleTheme} 
				aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
			>
				{#if darkMode}
					<!-- Sun icon for light mode -->
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
					</svg>
				{:else}
					<!-- Moon icon for dark mode -->
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
					</svg>
				{/if}
			</button>
		</div>
	</header>

	<main class="container mx-auto px-4 py-6 flex-grow">
		{@render children()}
	</main>

	<footer class="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mt-auto">
		<div class="container mx-auto px-4 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
			GitXplorer - Dependency Graph Visualization Tool
		</div>
	</footer>
</div>

<style>
	:global(html) {
		scroll-behavior: smooth;
	}
  
	:global(body) {
		margin: 0;
		padding: 0;
		height: 100%;
		width: 100%;
	}
</style>
