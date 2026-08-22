"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquareWarning } from "lucide-react";
import { ErrorState } from "@/components/data/states";
import { Button } from "@/components/ui/button";

export default function ComplaintNotFound() {
  const reference = usePathname().split("/").pop();

  return (
    <div className="mx-auto max-w-2xl">
      <ErrorState
        icon={MessageSquareWarning}
        title="We could not find that case"
        description="It may have been closed and archived, or you may not have access to it."
        reference={reference}
        action={
          <Button size="sm" asChild>
            <Link href="/complaints">Back to complaints</Link>
          </Button>
        }
      />
    </div>
  );
}
