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
	class="legend absolute {positionClasses[position as PositionType]} p-4 bg-white dark:bg-gray-800 shadow-md rounded z-10 text-gray-900 dark:text-white"
>
	<h3 class="font-bold mb-2 text-sm">Legend</h3>

	<div class="text-xs space-y-1">
		<div class="flex items-center">
			<div class="w-5 h-5 mr-2 flex items-center justify-center">
				<span class="w-3 h-3 bg-green-500 rounded-full shadow-sm shadow-green-500/50"></span>
			</div>
			<span>Production dependency</span>
		</div>

		<div class="flex items-center">
			<div class="w-5 h-5 mr-2 flex items-center justify-center">
				<span class="w-3 h-3 bg-red-500 rounded-full shadow-sm shadow-red-500/50 flex items-center justify-center">
					<span class="text-[5px] text-white font-bold">D</span>
				</span>
			</div>
			<span>Development dependency</span>
		</div>

		<div class="flex items-center">
			<div class="w-5 h-5 mr-2 flex items-center justify-center">
				<span class="w-3 h-3 bg-blue-500 rounded-full shadow-sm shadow-blue-500/50 flex items-center justify-center">
					<span class="text-[5px] text-white font-bold">P</span>
				</span>
			</div>
			<span>Peer dependency</span>
		</div>

		<div class="flex items-center">
			<div class="w-5 h-5 mr-2 flex items-center justify-center">
				<span class="w-3 h-3 bg-purple-500 rounded-full shadow-sm shadow-purple-500/50 flex items-center justify-center">
					<span class="text-[5px] text-white font-bold">O</span>
				</span>
			</div>
			<span>Optional dependency</span>
		</div>

		<div class="flex items-center mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
			<div class="w-5 h-5 mr-2 flex items-center justify-center">
				<span class="w-3 h-3 bg-gray-300 rounded-full border-2 border-dashed border-orange-500"></span>
			</div>
			<span>Multiple versions</span>
		</div>

		<div class="flex items-center">
			<div class="w-5 h-5 mr-2 flex items-center justify-center">
				<span class="w-3 h-3 bg-gray-500 rounded-full"></span>
			</div>
			<span>Root package</span>
		</div>

		<div class="flex items-center">
			<div class="w-5 h-5 mr-2 flex items-center justify-center">
				<span class="w-3 h-3 rounded-full flex items-center justify-center" style="background-color: white">
					<span class="text-[5px] text-black font-bold">TS</span>
				</span>
			</div>
			<span>TypeScript type definition</span>
		</div>
	</div>
</div>
