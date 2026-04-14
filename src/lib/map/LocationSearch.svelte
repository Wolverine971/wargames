<script lang="ts">
	import { createEventDispatcher, onDestroy } from 'svelte';
	import {
		formatFeatureTypeLabel,
		searchAdministrativeLocations,
		type LocationSearchSuggestion
	} from '$lib/map/locationSearch';

	export let accessToken = '';
	export let disabled = false;
	export let disabledReason = 'Location search is unavailable.';
	export let proximity: [number, number] | null = null;

	const dispatch = createEventDispatcher<{
		select: LocationSearchSuggestion;
	}>();
	const MIN_QUERY_LENGTH = 2;
	const SEARCH_DEBOUNCE_MS = 280;

	let query = '';
	let suggestions: LocationSearchSuggestion[] = [];
	let activeIndex = -1;
	let isLoading = false;
	let isOpen = false;
	let errorMessage: string | null = null;
	let blurTimer: ReturnType<typeof setTimeout> | null = null;
	let searchTimer: ReturnType<typeof setTimeout> | null = null;
	let searchAbortController: AbortController | null = null;
	let requestSequence = 0;

	function clearBlurTimer() {
		if (blurTimer) {
			clearTimeout(blurTimer);
			blurTimer = null;
		}
	}

	function clearSearchWork() {
		if (searchTimer) {
			clearTimeout(searchTimer);
			searchTimer = null;
		}

		searchAbortController?.abort();
		searchAbortController = null;
	}

	function resetResults() {
		suggestions = [];
		activeIndex = -1;
		isLoading = false;
		errorMessage = null;
	}

	function closeResults() {
		isOpen = false;
	}

	function openResults() {
		if (disabled) {
			return;
		}

		if (query.trim().length >= MIN_QUERY_LENGTH || errorMessage) {
			isOpen = true;
		}
	}

	async function runSearch(searchQuery: string) {
		const requestId = ++requestSequence;
		searchAbortController?.abort();
		const controller = new AbortController();
		searchAbortController = controller;
		isLoading = true;
		errorMessage = null;
		isOpen = true;

		try {
			const nextSuggestions = await searchAdministrativeLocations({
				accessToken,
				proximity,
				query: searchQuery,
				signal: controller.signal
			});

			if (requestId !== requestSequence) {
				return;
			}

			suggestions = nextSuggestions;
			activeIndex = nextSuggestions.length > 0 ? 0 : -1;
		} catch (error) {
			if (controller.signal.aborted || requestId !== requestSequence) {
				return;
			}

			suggestions = [];
			activeIndex = -1;
			errorMessage =
				error instanceof Error
					? error.message
					: 'Location search is temporarily unavailable.';
		} finally {
			if (requestId === requestSequence) {
				isLoading = false;
			}
		}
	}

	function queueSearch() {
		clearSearchWork();

		if (disabled || !accessToken) {
			resetResults();
			closeResults();
			return;
		}

		const searchQuery = query.trim();
		if (searchQuery.length < MIN_QUERY_LENGTH) {
			resetResults();
			isOpen = searchQuery.length > 0;
			return;
		}

		searchTimer = setTimeout(() => {
			void runSearch(searchQuery);
		}, SEARCH_DEBOUNCE_MS);
	}

	function selectSuggestion(suggestion: LocationSearchSuggestion) {
		query = suggestion.fullName;
		resetResults();
		closeResults();
		dispatch('select', suggestion);
	}

	function handleInput() {
		queueSearch();
	}

	function handleFocusIn() {
		clearBlurTimer();
		openResults();
	}

	function handleFocusOut() {
		clearBlurTimer();
		blurTimer = setTimeout(() => {
			closeResults();
		}, 120);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (disabled) {
			return;
		}

		if (event.key === 'ArrowDown') {
			if (suggestions.length === 0) {
				return;
			}

			event.preventDefault();
			isOpen = true;
			activeIndex = Math.min(activeIndex + 1, suggestions.length - 1);
			return;
		}

		if (event.key === 'ArrowUp') {
			if (suggestions.length === 0) {
				return;
			}

			event.preventDefault();
			isOpen = true;
			activeIndex = Math.max(activeIndex - 1, 0);
			return;
		}

		if (event.key === 'Enter') {
			if (!isOpen || activeIndex < 0 || !suggestions[activeIndex]) {
				return;
			}

			event.preventDefault();
			selectSuggestion(suggestions[activeIndex]);
			return;
		}

		if (event.key === 'Escape') {
			closeResults();
		}
	}

	$: if (disabled || !accessToken) {
		clearSearchWork();
		resetResults();
		closeResults();
	}

	onDestroy(() => {
		clearBlurTimer();
		clearSearchWork();
	});
</script>

<div class="map-search-shell" on:focusin={handleFocusIn} on:focusout={handleFocusOut}>
	<div class="map-search-card">
		<div class="map-search-header">
			<div class="map-search-label">Location Search</div>
			<div class="map-search-meta">
				Global geography type-ahead for countries, regions, and cities
			</div>
		</div>

		<div class="map-search-input-row">
			<input
				aria-autocomplete="list"
				aria-controls="location-search-results"
				autocomplete="off"
				class="map-search-input"
				disabled={disabled}
				inputmode="search"
				on:input={handleInput}
				on:keydown={handleKeydown}
				placeholder="Search countries, states, provinces, districts, and cities"
				spellcheck="false"
				type="search"
				bind:value={query}
			/>
		</div>

		<div class="map-search-hint">
			{#if disabled}
				{disabledReason}
			{:else}
				Type `Mary` for Maryland or search across China and other global regions.
			{/if}
		</div>

		{#if isOpen}
			<div class="map-search-results" id="location-search-results" role="listbox">
				{#if disabled}
					<div class="map-search-state">{disabledReason}</div>
				{:else if query.trim().length < MIN_QUERY_LENGTH}
					<div class="map-search-state">
						Type at least {MIN_QUERY_LENGTH} characters to search.
					</div>
				{:else if isLoading}
					<div class="map-search-state">Searching geographies...</div>
				{:else if errorMessage}
					<div class="map-search-state">{errorMessage}</div>
				{:else if suggestions.length === 0}
					<div class="map-search-state">No matching locations found.</div>
				{:else}
					{#each suggestions as suggestion, index}
						<button
							aria-selected={index === activeIndex}
							class:is-active={index === activeIndex}
							class="map-search-result"
							on:click={() => selectSuggestion(suggestion)}
							on:mousedown|preventDefault
							on:mouseenter={() => (activeIndex = index)}
							role="option"
							type="button"
						>
							<div class="map-search-result-head">
								<div class="map-search-result-title">{suggestion.name}</div>
								<div class="map-search-result-type">
									{formatFeatureTypeLabel(suggestion.featureType)}
								</div>
							</div>
							<div class="map-search-result-subtitle">
								{suggestion.subtitle || 'Map focus target'}
							</div>
						</button>
					{/each}
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.map-search-shell {
		pointer-events: auto;
		width: min(32rem, 100%);
	}

	.map-search-card {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.95rem;
		border: 1px solid rgba(111, 162, 196, 0.22);
		background:
			linear-gradient(180deg, rgba(8, 20, 31, 0.94), rgba(5, 12, 19, 0.92)),
			linear-gradient(135deg, rgba(119, 209, 255, 0.06), transparent 55%);
		box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
		backdrop-filter: blur(16px);
	}

	.map-search-header {
		display: flex;
		flex-direction: column;
		gap: 0.28rem;
	}

	.map-search-label {
		color: var(--text-dim);
		font-family: var(--font-tech);
		font-size: 0.72rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}

	.map-search-meta,
	.map-search-hint,
	.map-search-result-subtitle,
	.map-search-state {
		color: var(--text-dim);
		font-size: 0.8rem;
		line-height: 1.4;
	}

	.map-search-input-row {
		display: flex;
	}

	.map-search-input {
		width: 100%;
		border: 1px solid rgba(119, 209, 255, 0.18);
		background: rgba(6, 15, 23, 0.92);
		color: var(--text);
		padding: 0.85rem 0.9rem;
	}

	.map-search-input::placeholder {
		color: rgba(143, 165, 180, 0.9);
	}

	.map-search-input:focus {
		outline: 1px solid rgba(119, 209, 255, 0.34);
		outline-offset: 0;
		border-color: rgba(119, 209, 255, 0.4);
	}

	.map-search-input:disabled {
		opacity: 0.72;
		cursor: not-allowed;
	}

	.map-search-results {
		display: flex;
		flex-direction: column;
		max-height: 22rem;
		overflow-y: auto;
		border: 1px solid rgba(119, 209, 255, 0.14);
		background: rgba(5, 14, 22, 0.96);
	}

	.map-search-result,
	.map-search-state {
		padding: 0.8rem 0.9rem;
	}

	.map-search-result {
		border: 0;
		border-bottom: 1px solid rgba(119, 209, 255, 0.08);
		background: transparent;
		color: inherit;
		text-align: left;
	}

	.map-search-result:last-child {
		border-bottom: 0;
	}

	.map-search-result:hover,
	.map-search-result.is-active {
		background:
			linear-gradient(135deg, rgba(18, 66, 90, 0.45), rgba(5, 14, 22, 0.98));
	}

	.map-search-result-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 1rem;
	}

	.map-search-result-title {
		font-weight: 600;
		letter-spacing: 0.03em;
	}

	.map-search-result-type {
		color: var(--accent);
		font-family: var(--font-tech);
		font-size: 0.72rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	@media (max-width: 720px) {
		.map-search-shell {
			width: 100%;
		}
	}
</style>
