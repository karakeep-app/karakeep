"use client";

import { useState } from "react";
import { RuleEditor } from "@/components/dashboard/rules/RuleEngineRuleEditor";
import RuleList from "@/components/dashboard/rules/RuleEngineRuleList";
import {
  SettingsPage,
  SettingsSection,
} from "@/components/settings/SettingsPage";
import { Button } from "@/components/ui/button";
import { FullPageSpinner } from "@/components/ui/full-page-spinner";
import { useTranslation } from "@/lib/i18n/client";
import { useQuery } from "@tanstack/react-query";
import { PlusCircle } from "lucide-react";

import { useTRPC } from "@karakeep/shared-react/trpc";
import { RuleEngineRule } from "@karakeep/shared/types/rules";

export default function RulesSettingsPage() {
  const api = useTRPC();
  const { t } = useTranslation();
  const [editingRule, setEditingRule] = useState<
    (Omit<RuleEngineRule, "id"> & { id: string | null }) | null
  >(null);

  const { data: rules, isLoading } = useQuery(
    api.rules.list.queryOptions(undefined, {
      refetchOnWindowFocus: true,
      refetchOnMount: true,
    }),
  );

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
    <SettingsPage
      title={t("settings.rules.rules")}
      description={t("settings.rules.description")}
      action={
        <Button onClick={handleCreateRule} variant="default">
          <PlusCircle className="mr-2 h-4 w-4" />
          {t("settings.rules.ceate_rule")}
        </Button>
      }
    >
      <SettingsSection>
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
      </SettingsSection>
    </SettingsPage>
  );
}
