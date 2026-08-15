import { RefreshCw, Unlink } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

export function LongImageRegenerateDialog({
  onGenerate,
  pending,
}: {
  onGenerate: (mode: "new_export" | "replace_existing") => void;
  pending: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button className="col-span-2 min-h-11" disabled={pending} size="sm" variant="outline">
          <RefreshCw className="size-4" /> Regenerate…
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Regenerate this permanent image?</AlertDialogTitle>
          <AlertDialogDescription>
            Creating a new link keeps this image unchanged. Replacing it changes what the existing
            permanent URL shows; downloaded or reposted copies cannot be updated. The QR destination
            remains unchanged.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:flex-col sm:items-stretch">
          <AlertDialogAction
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => onGenerate("new_export")}
          >
            Create new link (recommended)
          </AlertDialogAction>
          <AlertDialogAction onClick={() => onGenerate("replace_existing")}>
            Replace existing version
          </AlertDialogAction>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function LongImageRevokeDialog({
  onRevoke,
  pending,
}: {
  onRevoke: () => void;
  pending: boolean;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button className="col-span-2 min-h-11" disabled={pending} size="sm" variant="ghost">
          <Unlink className="size-4" /> Revoke image link…
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke this permanent image link?</AlertDialogTitle>
          <AlertDialogDescription>
            The URL will stop working immediately. Downloaded or reposted copies cannot be removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onRevoke}>Revoke image link</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
