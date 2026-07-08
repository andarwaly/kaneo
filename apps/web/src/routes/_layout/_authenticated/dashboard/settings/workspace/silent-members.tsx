import { createFileRoute } from "@tanstack/react-router";
import { GhostIcon } from "lucide-react";
import { useState } from "react";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SilentMemberBadge } from "@/components/ui/silent-member-badge";
import useCreateSilentMember from "@/hooks/mutations/workspace-user/use-create-silent-member";
import useGetWorkspaceMembers from "@/hooks/queries/workspace-user/use-get-workspace-members";
import { useWorkspacePermission } from "@/hooks/use-workspace-permission";
import { toast } from "@/lib/toast";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/workspace/silent-members",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { workspace, isAdmin } = useWorkspacePermission();
  const workspaceId = workspace?.id ?? "";

  if (!isAdmin) {
    return (
      <>
        <PageTitle title="Silent members" />
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">Silent members</h1>
            <p className="text-muted-foreground">
              You need admin or owner permissions to manage silent members.
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageTitle title="Silent members" />
      <SilentMembersPage workspaceId={workspaceId} />
    </>
  );
}

export function SilentMembersPage({ workspaceId }: { workspaceId: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const {
    data: members = [],
    isLoading,
    isError,
    error,
  } = useGetWorkspaceMembers(workspaceId);
  const { mutate: create, isPending } = useCreateSilentMember(workspaceId);

  const handleCreate = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name is required");
      return;
    }
    create(
      { name: trimmed, email: email.trim() || undefined },
      {
        onSuccess: () => {
          toast.success("Silent member created");
          setName("");
          setEmail("");
        },
        onError: (err) => {
          toast.error(
            err instanceof Error ? err.message : "Failed to create member",
          );
        },
      },
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Silent members</h1>
        <p className="text-muted-foreground">
          Silent members are assignable placeholder accounts with no login
          access and no invite email.
        </p>
      </div>

      <div className="space-y-6">
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="silent-member-name">Name</Label>
            <Input
              id="silent-member-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isPending}
              className="w-48"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="silent-member-email">Email</Label>
            <Input
              id="silent-member-email"
              placeholder="Email (optional)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isPending}
              className="w-64"
            />
          </div>
          <Button onClick={handleCreate} disabled={isPending} size="sm">
            Create
          </Button>
        </div>

        <div className="border border-border rounded-md bg-sidebar">
          {isLoading ? (
            <p className="text-xs text-muted-foreground px-4 py-6">Loading…</p>
          ) : isError ? (
            <p className="text-xs text-destructive px-4 py-6">
              {error instanceof Error
                ? error.message
                : "Failed to load members."}
            </p>
          ) : members.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <GhostIcon />
                </EmptyMedia>
                <EmptyTitle>No members yet</EmptyTitle>
                <EmptyDescription>
                  Create a silent member to assign tasks to someone who doesn't
                  need login access.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul>
              {members.map((member) => (
                <li
                  key={member.id}
                  className="flex items-center gap-2 px-4 py-3 border-b border-border last:border-b-0"
                >
                  <span className="text-sm font-medium">{member.name}</span>
                  {member.isSilent && <SilentMemberBadge />}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
