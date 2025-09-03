"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/trpc";

import RemindersList from "./RemindersList";

export default function RemindersPage() {
  // Fetch counts for each tab to show badges
  const { data: dueReminders } = api.reminders.getReminders.useQuery({
    reminderType: "due",
  });

  const { data: upcomingReminders } = api.reminders.getReminders.useQuery({
    reminderType: "upcoming",
  });

  const { data: dismissedReminders } = api.reminders.getReminders.useQuery({
    reminderType: "dismissed",
  });

  const dueCount = dueReminders?.reminders.length || 0;
  const upcomingCount = upcomingReminders?.reminders.length || 0;
  const dismissedCount = dismissedReminders?.reminders.length || 0;

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Reminders</h1>
        <p className="text-muted-foreground">Manage your bookmark reminders</p>
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
            <h2 className="text-lg font-semibold text-red-600 dark:text-red-400">
              Due Reminders
            </h2>
            <p className="text-sm text-muted-foreground">
              These reminders are past their scheduled time
            </p>
          </div>
          <RemindersList reminderType="due" />
        </TabsContent>

        <TabsContent value="upcoming" className="mt-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Upcoming Reminders</h2>
            <p className="text-sm text-muted-foreground">
              These reminders are scheduled for the future
            </p>
          </div>
          <RemindersList reminderType="upcoming" />
        </TabsContent>

        <TabsContent value="dismissed" className="mt-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Dismissed Reminders</h2>
            <p className="text-sm text-muted-foreground">
              These reminders have been marked as complete
            </p>
          </div>
          <RemindersList reminderType="dismissed" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
