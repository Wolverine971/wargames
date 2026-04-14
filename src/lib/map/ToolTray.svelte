<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let title = '';
	export let description = '';

	const dispatch = createEventDispatcher<{
		close: null;
	}>();
</script>

<section class="tool-tray">
	<div class="tool-tray-head">
		<div>
			<div class="panel-header">{title}</div>
			{#if description}
				<p class="tool-tray-description">{description}</p>
			{/if}
		</div>

		<button class="button ghost button-compact" type="button" on:click={() => dispatch('close', null)}>
			Close
		</button>
	</div>

	<div class="tool-tray-body">
		<slot />
	</div>
</section>
