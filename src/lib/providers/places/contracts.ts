import type { PlaceSnapshot } from "./types.ts";

export type PlaceSuggestion = {
  id: string;
  primary: string;
  secondary?: string;
};

export type PlaceSuggestionRequest = {
  includedPrimaryTypes?: string[];
  input: string;
  signal?: AbortSignal;
};

export interface PlaceSearchSession {
  close(): void;
  fetchSuggestions(request: PlaceSuggestionRequest): Promise<PlaceSuggestion[]>;
  resolveSuggestion(id: string, signal?: AbortSignal): Promise<PlaceSnapshot>;
}

export interface PlacesProvider {
  createSession(): PlaceSearchSession;
}

export type PlacesProviderState = {
  error?: Error;
  provider: PlacesProvider | null;
};
