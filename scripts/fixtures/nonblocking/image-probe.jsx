import React from "react";
import { useLongImageExport } from "../../../src/features/sharing/components/use-long-image-export";
import { useBackgroundActions } from "../../../src/features/editing/use-background-actions";
export function ImageProbe({ sharePage }) {
  const [imageState, setImageState] = React.useState(null);
  const owner = useBackgroundActions(sharePage.tripId, `images:${sharePage.id}`);
  const job = useLongImageExport({
    imageState,
    onImageStateChange: setImageState,
    sharePage,
    siteUrl: location.origin,
  });
  React.useEffect(() => {
    window.__images = owner;
  }, [owner]);
  return (
    <>
      <button onClick={() => job.generate("new_export")}>Generate image</button>
      <button onClick={() => owner?.queue.retry(owner.queue.operations[0]?.id)}>Retry image</button>
      <p role="status">{job.progress}</p>
      <p data-image-error>{job.error}</p>
      <pre data-image-state>{JSON.stringify(imageState)}</pre>
    </>
  );
}
