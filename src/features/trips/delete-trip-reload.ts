export type TripDeleteSnapshot = {
  activeSharePageCount: number | null;
  contentVersion: number;
  version: number;
};

export type TripDeleteReloadState<TActionState> = {
  hiddenErrorState?: TActionState;
  latestSnapshot: TripDeleteSnapshot | null;
  reloadSucceeded: boolean;
};

export function completedTripDeleteReload<TActionState>(
  snapshot: TripDeleteSnapshot,
  actionState: TActionState,
): TripDeleteReloadState<TActionState> {
  return { hiddenErrorState: actionState, latestSnapshot: snapshot, reloadSucceeded: true };
}

export function openedTripDeleteSession<TActionState>(
  actionState: TActionState,
): TripDeleteReloadState<TActionState> {
  return {
    hiddenErrorState: actionState,
    latestSnapshot: null,
    reloadSucceeded: false,
  };
}

export function startedTripDeleteSubmission<TActionState>(
  state: TripDeleteReloadState<TActionState>,
): TripDeleteReloadState<TActionState> {
  return { ...state, reloadSucceeded: false };
}

export function effectiveTripDeleteSnapshot(
  initial: TripDeleteSnapshot,
  refreshed: TripDeleteSnapshot | null,
) {
  return refreshed ?? initial;
}
