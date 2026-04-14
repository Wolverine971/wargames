import { browser } from '$app/environment';
import type { DraftState } from '$lib/map/workspaceTypes';

export const LOCAL_DRAFT_KEY = 'wargames/draft/v2';

export function readDraftState() {
	if (!browser) {
		return null;
	}

	const rawDraft = localStorage.getItem(LOCAL_DRAFT_KEY);
	if (!rawDraft) {
		return null;
	}

	try {
		return JSON.parse(rawDraft) as DraftState;
	} catch {
		localStorage.removeItem(LOCAL_DRAFT_KEY);
		return null;
	}
}

export function writeDraftState(draftState: DraftState) {
	if (!browser) {
		return;
	}

	localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify(draftState));
}

export function clearDraftState() {
	if (!browser) {
		return;
	}

	localStorage.removeItem(LOCAL_DRAFT_KEY);
}
