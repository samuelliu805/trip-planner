import { Lightbulb, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { T } from "@/features/i18n/i18n-provider";

export function AccountToolLinks() {
  return (
    <div className="grid min-w-0 gap-2 border-t pt-4 sm:grid-cols-2">
      <Button asChild className="min-h-11 justify-start font-normal" variant="ghost">
        <Link href="/ideas">
          <Lightbulb aria-hidden="true" className="size-4 text-muted-foreground" />
          <T message="Personal ideas" />
        </Link>
      </Button>
      <Button asChild className="min-h-11 justify-start font-normal" variant="ghost">
        <Link href="/account/ai">
          <Sparkles aria-hidden="true" className="size-4 text-muted-foreground" />
          <T message="Connect your AI" />
        </Link>
      </Button>
    </div>
  );
}
