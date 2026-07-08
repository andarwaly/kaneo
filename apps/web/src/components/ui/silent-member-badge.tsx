import { GhostIcon } from "lucide-react";

export function SilentMemberBadge() {
  return (
    <span
      role="img"
      aria-label="Silent member — no login access"
      title="Silent member — no login access"
      className="inline-flex items-center text-muted-foreground"
    >
      <GhostIcon className="h-3 w-3" />
    </span>
  );
}
