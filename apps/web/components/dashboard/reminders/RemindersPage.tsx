"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/trpc";

import RemindersList from "./RemindersList";

export default function RemindersPage() {
  const clientTimestamp = useMemo(() => Date.now(), []);

  // Fetch all reminders once
  const { data: allRemindersData, isLoading } =
    api.reminders.getReminders.useQuery({
      clientTimestamp,
    });

  const { data: groupedReminders } = api.reminders.getRemindersCounts.useQuery({
    clientTimestamp,
  });

  // Filter reminders client-side for each tab
  const allReminders = allRemindersData?.reminders || [];
  const now = new Date(clientTimestamp);

  const dueReminders = useMemo(
    () =>
      allReminders.filter(
        (r) => r.status === "active" && new Date(r.remindAt) <= now,
      ),
    [allReminders, now],
  );

  const upcomingReminders = useMemo(
    () =>
      allReminders.filter(
        (r) => r.status === "active" && new Date(r.remindAt) > now,
      ),
    [allReminders, now],
  );

  const dismissedReminders = useMemo(
    () => allReminders.filter((r) => r.status === "dismissed"),
    [allReminders],
  );

  const dueCount = groupedReminders?.dueCount || 0;
  const upcomingCount = groupedReminders?.upcomingCount || 0;
  const dismissedCount = groupedReminders?.dismissedCount || 0;

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Reminders</h1>
      </div>

      <Tabs defaultValue="due" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="due" className="flex items-center gap-2">
            Due
            {dueCount > 0 && (
              <Badge variant="destructive" className="ml-1">
                {dueCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="flex items-center gap-2">
            Upcoming
            {upcomingCount > 0 && (
              <Badge variant="secondary" className="ml-1">
                {upcomingCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="dismissed" className="flex items-center gap-2">
            Dismissed
            {/* TODO: Seeking feedback - should we show count for dismissed reminders? */}
            {dismissedCount > 0 && (
              <Badge variant="outline" className="ml-1">
                {dismissedCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="due" className="mt-6">
          <div className="mb-4">
            <p className="text-sm text-muted-foreground">
              These reminders are past their scheduled time
            </p>
          </div>
          <RemindersList
            reminderType="due"
            reminders={dueReminders}
            isLoading={isLoading}
          />
        </TabsContent>

        <TabsContent value="upcoming" className="mt-6">
          <div className="mb-4">
            <p className="text-sm text-muted-foreground">
              These reminders are scheduled for the future
            </p>
          </div>
          <RemindersList
            reminderType="upcoming"
            reminders={upcomingReminders}
            isLoading={isLoading}
          />
        </TabsContent>

        <TabsContent value="dismissed" className="mt-6">
          <div className="mb-4">
            <p className="text-sm text-muted-foreground">
              These reminders have been marked as complete
            </p>
          </div>
          <RemindersList
            reminderType="dismissed"
            reminders={dismissedReminders}
            isLoading={isLoading}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
