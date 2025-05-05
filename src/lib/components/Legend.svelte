<script lang="ts">
	// Define position type
	type PositionType = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
	
	// Optional props to control visibility or position
	const { position = 'top-right' } = $props<{
		position?: PositionType;
	}>();

	// Position classes
	const positionClasses: Record<PositionType, string> = {
		'top-left': 'top-4 left-4',
		'top-right': 'top-4 right-4',
		'bottom-left': 'bottom-4 left-4',
		'bottom-right': 'bottom-4 right-4'
	};
</script>

<div
	class="legend absolute {positionClasses[position as PositionType]} p-4 bg-white dark:bg-gray-800 shadow-md rounded z-10"
>
	<h3 class="font-bold mb-2 text-sm">Legend</h3>

	<div class="text-xs space-y-1">
		<div class="flex items-center">
			<span class="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
			<span>Production dependency</span>
		</div>

		<div class="flex items-center">
			<span class="w-3 h-3 bg-red-500 rounded-full mr-2"></span>
			<span>Development dependency</span>
		</div>

		<div class="flex items-center">
			<span class="w-3 h-3 bg-blue-500 rounded-full mr-2"></span>
			<span>Peer dependency</span>
		</div>

		<div class="flex items-center">
			<span class="w-3 h-3 bg-purple-500 rounded-full mr-2"></span>
			<span>Optional dependency</span>
		</div>

		<div class="flex items-center mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
			<span class="w-3 h-3 bg-gray-300 rounded-full border-2 border-orange-500 mr-2"></span>
			<span>Multiple versions</span>
		</div>

		<div class="flex items-center">
			<span class="w-3 h-3 bg-gray-500 rounded-full mr-2"></span>
			<span>Root package</span>
		</div>
	</div>
</div>
