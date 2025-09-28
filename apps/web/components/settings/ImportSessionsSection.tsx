"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useCreateImportSession,
  useListImportSessions,
} from "@/lib/hooks/useImportSessions";
import { Loader2, Package, Plus } from "lucide-react";

import { ImportSessionCard } from "./ImportSessionCard";

export function ImportSessionsSection() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [sessionName, setSessionName] = useState("");

  const { data: sessions, isLoading, error } = useListImportSessions();
  const createSession = useCreateImportSession();

  const handleCreateSession = async () => {
    if (!sessionName.trim()) return;

    try {
      await createSession.mutateAsync({ name: sessionName.trim() });
      setSessionName("");
      setIsCreateDialogOpen(false);
    } catch {
      // Error is handled by the mutation hook
    }
  };

  if (isLoading) {
    return (
      <div className="flex w-full flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Import Sessions</h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex w-full flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">Import Sessions</h3>
        </div>
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <p className="text-gray-600">Failed to load import sessions</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Import Sessions</h3>
          <p className="mt-1 text-sm text-gray-600">
            Manage your bulk import sessions and track their progress
          </p>
        </div>

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              New Session
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Import Session</DialogTitle>
              <DialogDescription>
                Create a new import session to organize and track your bulk
                imports.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="session-name">Session Name</Label>
                <Input
                  id="session-name"
                  placeholder="e.g., Browser Bookmarks, Pocket Export"
                  value={sessionName}
                  onChange={(e) => setSessionName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && sessionName.trim()) {
                      handleCreateSession();
                    }
                  }}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateSession}
                disabled={!sessionName.trim() || createSession.isPending}
              >
                {createSession.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create Session
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {sessions && sessions.length > 0 ? (
        <div className="space-y-4">
          {sessions.map((session) => (
            <ImportSessionCard key={session.id} session={session} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Package className="mb-4 h-12 w-12 text-gray-400" />
            <p className="mb-2 text-center text-gray-600">
              No import sessions yet
            </p>
            <p className="mb-4 text-center text-sm text-gray-500">
              Create an import session to organize and track bulk bookmark
              imports
            </p>
            <Button
              variant="outline"
              onClick={() => setIsCreateDialogOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Your First Session
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
