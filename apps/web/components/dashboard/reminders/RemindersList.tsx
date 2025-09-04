"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Clock } from "lucide-react";

import type {
  ZGetRemindersRequest,
  ZReminder,
} from "@karakeep/shared/types/reminders";

import ReminderCard from "./ReminderCard";

interface RemindersListProps {
  reminderType: NonNullable<ZGetRemindersRequest["reminderType"]>;
  reminders: ZReminder[];
  isLoading: boolean;
}

export default function RemindersList({
  reminderType,
  reminders,
  isLoading,
}: RemindersListProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="mb-2 h-20 rounded bg-muted"></div>
              <div className="mb-2 h-4 w-3/4 rounded bg-muted"></div>
              <div className="h-3 w-1/2 rounded bg-muted"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (reminders.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Clock className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-lg font-medium">
            No {reminderType} reminders
          </h3>
          <p className="text-muted-foreground">
            {reminderType === "due" &&
              "You're all caught up! No overdue reminders."}
            {reminderType === "upcoming" && "No upcoming reminders scheduled."}
            {reminderType === "dismissed" && "No dismissed reminders yet."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {reminders.map((reminder) => (
        <ReminderCard
          key={reminder.id}
          reminder={reminder}
          reminderType={reminderType}
        />
      ))}
    </div>
  );
}
