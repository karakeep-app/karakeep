import { cn } from "@/lib/utils";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";

export function SettingsPage({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}

export function SettingsSection({
  title,
  description,
  action,
  children,
  variant = "default",
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  variant?: "default" | "danger";
}) {
  return (
    <Card
      className={variant === "danger" ? "border-destructive/20" : undefined}
    >
      {(title || description || action) && (
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              {title && (
                <CardTitle
                  className={cn(
                    "text-lg",
                    variant === "danger" && "text-destructive",
                  )}
                >
                  {title}
                </CardTitle>
              )}
              {description && <CardDescription>{description}</CardDescription>}
            </div>
            {action && <div className="shrink-0">{action}</div>}
          </div>
        </CardHeader>
      )}
      <CardContent
        className={cn("space-y-4", !(title || description || action) && "pt-6")}
      >
        {children}
      </CardContent>
    </Card>
  );
}
