import React from "react";
import { TripPeopleEditor } from "../../../src/features/trips/components/trip-people-editor";
import { PublicShareDialog } from "../../../src/features/sharing/components/public-share-dialog";
import { useBackgroundActions } from "../../../src/features/editing/use-background-actions";
import { ImageProbe } from "./image-probe";
export function BackgroundProbe({ workspace }) {
  const [people, setPeople] = React.useState(false);
  const members = useBackgroundActions(workspace.variant.trip_id, "people");
  const sharing = useBackgroundActions(workspace.variant.trip_id, "sharing");
  React.useEffect(() => {
    window.__members = members;
    window.__sharing = sharing;
  }, [members, sharing]);
  const shareResult = sharing?.completed.filter((row) => row.intent.kind === "share.save").at(-1)
    ?.result?.data;
  return (
    <>
      {shareResult ? <ImageProbe sharePage={shareResult} /> : null}
      <button onClick={() => setPeople(true)}>Open people</button>
      <TripPeopleEditor
        tripId={workspace.variant.trip_id}
        open={people}
        onOpenChange={setPeople}
        role="owner"
      />
      <PublicShareDialog
        trip={window.__trip}
        activeVariantId={workspace.variant.id}
        initialLinks={[]}
        variants={[workspace.variant]}
        siteUrl={location.origin}
      />
    </>
  );
}
