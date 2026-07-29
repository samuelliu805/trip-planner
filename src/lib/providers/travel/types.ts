export interface TravelResearchRequest {
  destination?: string;
  startDate?: string;
  endDate?: string;
}

export interface TravelProvider {
  id: string;
  name: string;
  createResearchUrl(request: TravelResearchRequest): URL;
}
