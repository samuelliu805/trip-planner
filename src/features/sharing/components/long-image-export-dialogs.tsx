import { T } from "@/features/i18n/i18n-provider";
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
          <RefreshCw className="size-4" /> <T message={" Regenerate… "} />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <T message={"Regenerate this image?"} />
          </AlertDialogTitle>
          <AlertDialogDescription>
            <T
              message={
                " A new link leaves the current image unchanged until it expires. Replacing updates the existing link and renews it for 30 days. Downloaded copies cannot be updated. The QR destination remains unchanged. "
              }
            />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:flex-col sm:items-stretch">
          <AlertDialogAction
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={() => onGenerate("new_export")}
          >
            <T message={" Create new link (recommended) "} />
          </AlertDialogAction>
          <AlertDialogAction onClick={() => onGenerate("replace_existing")}>
            <T message={" Replace existing version "} />
          </AlertDialogAction>
          <AlertDialogCancel>
            <T message={"Cancel"} />
          </AlertDialogCancel>
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
          <Unlink className="size-4" /> <T message={" Revoke image link… "} />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <T message={"Revoke this image link?"} />
          </AlertDialogTitle>
          <AlertDialogDescription>
            <T
              message={
                " The URL will stop working and its stored image files will be deleted. Downloaded or reposted copies cannot be removed. "
              }
            />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>
            <T message={"Cancel"} />
          </AlertDialogCancel>
          <AlertDialogAction onClick={onRevoke}>
            <T message={"Revoke image link"} />
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
