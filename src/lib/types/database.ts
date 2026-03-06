export type Json =
	| string
	| number
	| boolean
	| null
	| { [key: string]: Json | undefined }
	| Json[];

export interface Database {
	public: {
		Tables: {
			presentation_briefs: {
				Row: {
					created_at: string;
					id: string;
					outline: Json;
					scenario_id: string;
					theme: string;
					title: string;
					updated_at: string;
				};
				Insert: {
					created_at?: string;
					id?: string;
					outline?: Json;
					scenario_id: string;
					theme?: string;
					title: string;
					updated_at?: string;
				};
				Update: {
					created_at?: string;
					id?: string;
					outline?: Json;
					scenario_id?: string;
					theme?: string;
					title?: string;
					updated_at?: string;
				};
			};
			scenario_features: {
				Row: {
					area_sq_km: number | null;
					created_at: string;
					geometry: Json;
					id: string;
					kind: string;
					label: string;
					layer_id: string | null;
					measurement_km: number | null;
					properties: Json;
					scenario_id: string;
					updated_at: string;
				};
				Insert: {
					area_sq_km?: number | null;
					created_at?: string;
					geometry: Json;
					id?: string;
					kind: string;
					label?: string;
					layer_id?: string | null;
					measurement_km?: number | null;
					properties?: Json;
					scenario_id: string;
					updated_at?: string;
				};
				Update: {
					area_sq_km?: number | null;
					created_at?: string;
					geometry?: Json;
					id?: string;
					kind?: string;
					label?: string;
					layer_id?: string | null;
					measurement_km?: number | null;
					properties?: Json;
					scenario_id?: string;
					updated_at?: string;
				};
			};
			scenario_layers: {
				Row: {
					color: string;
					created_at: string;
					id: string;
					is_locked: boolean;
					is_visible: boolean;
					name: string;
					scenario_id: string;
					sort_order: number;
					updated_at: string;
				};
				Insert: {
					color?: string;
					created_at?: string;
					id?: string;
					is_locked?: boolean;
					is_visible?: boolean;
					name: string;
					scenario_id: string;
					sort_order?: number;
					updated_at?: string;
				};
				Update: {
					color?: string;
					created_at?: string;
					id?: string;
					is_locked?: boolean;
					is_visible?: boolean;
					name?: string;
					scenario_id?: string;
					sort_order?: number;
					updated_at?: string;
				};
			};
			scenarios: {
				Row: {
					briefing: string;
					classification: string;
					created_at: string;
					default_view: Json;
					grid_settings: Json;
					id: string;
					owner_id: string;
					presentation_settings: Json;
					slug: string | null;
					theater: string | null;
					title: string;
					updated_at: string;
				};
				Insert: {
					briefing?: string;
					classification?: string;
					created_at?: string;
					default_view?: Json;
					grid_settings?: Json;
					id?: string;
					owner_id: string;
					presentation_settings?: Json;
					slug?: string | null;
					theater?: string | null;
					title: string;
					updated_at?: string;
				};
				Update: {
					briefing?: string;
					classification?: string;
					created_at?: string;
					default_view?: Json;
					grid_settings?: Json;
					id?: string;
					owner_id?: string;
					presentation_settings?: Json;
					slug?: string | null;
					theater?: string | null;
					title?: string;
					updated_at?: string;
				};
			};
			simulation_runs: {
				Row: {
					created_at: string;
					executed_at: string | null;
					id: string;
					output_snapshot: Json;
					parameters: Json;
					scenario_id: string;
					status: string;
					summary: string | null;
					updated_at: string;
				};
				Insert: {
					created_at?: string;
					executed_at?: string | null;
					id?: string;
					output_snapshot?: Json;
					parameters?: Json;
					scenario_id: string;
					status?: string;
					summary?: string | null;
					updated_at?: string;
				};
				Update: {
					created_at?: string;
					executed_at?: string | null;
					id?: string;
					output_snapshot?: Json;
					parameters?: Json;
					scenario_id?: string;
					status?: string;
					summary?: string | null;
					updated_at?: string;
				};
			};
		};
		Views: Record<string, never>;
		Functions: Record<string, never>;
		Enums: Record<string, never>;
		CompositeTypes: Record<string, never>;
	};
}
