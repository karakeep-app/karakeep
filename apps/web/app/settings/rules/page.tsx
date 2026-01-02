"use client";

import { useState } from "react";
import { RuleEditor } from "@/components/dashboard/rules/RuleEngineRuleEditor";
import RuleList from "@/components/dashboard/rules/RuleEngineRuleList";
import { Button } from "@/components/ui/button";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { useTranslation } from "@/lib/i18n/client";
import { api } from "@/lib/trpc";
import { PlusCircle } from "lucide-react";

import { RuleEngineRule } from "@karakeep/shared/types/rules";

export default function RulesSettingsPage() {
  const { t } = useTranslation();
  const [editingRule, setEditingRule] = useState<
    (Omit<RuleEngineRule, "id"> & { id: string | null }) | null
  >(null);

  const { data: rules, isLoading } = api.rules.list.useQuery(undefined, {
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  const handleCreateRule = () => {
    const newRule = {
      id: null,
      name: "New Rule",
      description: "Description of the new rule",
      enabled: true,
      event: { type: "bookmarkAdded" as const },
      condition: { type: "alwaysTrue" as const },
      actions: [{ type: "addTag" as const, tagId: "" }],
    };
    setEditingRule(newRule);
  };

  const handleDeleteRule = (ruleId: string) => {
    if (editingRule?.id === ruleId) {
      // If the rule being edited is being deleted, reset the editing rule
      setEditingRule(null);
    }
  };

  return (
    <div className="rounded-md border bg-background p-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-lg font-medium">
            {t("settings.rules.rules")}
          </span>
          <Button onClick={handleCreateRule} variant="default">
            <PlusCircle className="mr-2 h-4 w-4" />
            {t("settings.rules.ceate_rule")}
          </Button>
        </div>
        <p className="text-sm italic text-muted-foreground">
          {t("settings.rules.description")}
        </p>
        {!rules || isLoading ? (
          <FullPageSpinner />
        ) : (
          <RuleList
            rules={rules.rules}
            onEditRule={(r) => setEditingRule(r)}
            onDeleteRule={handleDeleteRule}
          />
        )}
        <div className="lg:col-span-7">
          {editingRule && (
            <RuleEditor
              rule={editingRule}
              onCancel={() => setEditingRule(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
