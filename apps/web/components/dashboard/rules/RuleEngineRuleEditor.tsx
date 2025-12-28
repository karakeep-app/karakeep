import type React from "react";
import { useEffect, useState } from "react";
import { ActionBuilder } from "@/components/dashboard/rules/RuleEngineActionBuilder";
import { ConditionBuilder } from "@/components/dashboard/rules/RuleEngineConditionBuilder";
import { EventSelector } from "@/components/dashboard/rules/RuleEngineEventSelector";
import { ActionButton } from "@/components/ui/action-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { Textarea } from "@/components/ui/textarea";
import { Save, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import type {
  RuleEngineAction,
  RuleEngineCondition,
  RuleEngineEvent,
  RuleEngineRule,
} from "@karakeep/shared/types/rules";
import {
  useCreateRule,
  useUpdateRule,
} from "@karakeep/shared-react/hooks/rules";

interface RuleEditorProps {
  rule: Omit<RuleEngineRule, "id"> & { id: string | null };
  onCancel: () => void;
}

export function RuleEditor({ rule, onCancel }: RuleEditorProps) {
  const { t } = useTranslation();
  const { mutate: createRule, isPending: isCreating } = useCreateRule({
    onSuccess: () => {
      toast({
        description: t("settings.rules.rule_has_been_created"),
      });
      onCancel();
    },
    onError: (e) => {
      if (e.data?.code == "BAD_REQUEST") {
        if (e.data.zodError) {
          toast({
            variant: "destructive",
            description: Object.values(e.data.zodError.fieldErrors)
              .flat()
              .join("\n"),
          });
        } else {
          toast({
            variant: "destructive",
            description: e.message,
          });
        }
      } else {
        toast({
          variant: "destructive",
          title: t("common.something_went_wrong"),
        });
      }
    },
  });
  const { mutate: updateRule, isPending: isUpdating } = useUpdateRule({
    onSuccess: () => {
      toast({
        description: t("settings.rules.rule_has_been_updated"),
      });
      onCancel();
    },
    onError: (e) => {
      if (e.data?.code == "BAD_REQUEST") {
        if (e.data.zodError) {
          toast({
            variant: "destructive",
            description: Object.values(e.data.zodError.fieldErrors)
              .flat()
              .join("\n"),
          });
        } else {
          toast({
            variant: "destructive",
            description: e.message,
          });
        }
      } else {
        toast({
          variant: "destructive",
          title: t("common.something_went_wrong"),
        });
      }
    },
  });

  const [editedRule, setEditedRule] = useState<typeof rule>({ ...rule });

  useEffect(() => {
    setEditedRule({ ...rule });
  }, [rule]);

  const handleEventChange = (event: RuleEngineEvent) => {
    setEditedRule({ ...editedRule, event });
  };

  const handleConditionChange = (condition: RuleEngineCondition) => {
    setEditedRule({ ...editedRule, condition });
  };

  const handleActionsChange = (actions: RuleEngineAction[]) => {
    setEditedRule({ ...editedRule, actions });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const rule = editedRule;
    if (rule.id) {
      updateRule({
        ...rule,
        id: rule.id,
      });
    } else {
      createRule(rule);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>
            {rule.id
              ? t("settings.rules.edit_rule")
              : t("settings.rules.ceate_rule")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">{t("settings.rules.rule_name")}</Label>
              <Input
                id="name"
                value={editedRule.name}
                onChange={(e) =>
                  setEditedRule({ ...editedRule, name: e.target.value })
                }
                placeholder={t("settings.rules.enter_rule_name")}
                required
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={editedRule.description ?? ""}
                onChange={(e) =>
                  setEditedRule({ ...editedRule, description: e.target.value })
                }
                placeholder={t("settings.rules.describe_what_this_rule_does")}
                rows={2}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("settings.rules.whenever")}</Label>
            <EventSelector
              value={editedRule.event}
              onChange={handleEventChange}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("settings.rules.if")}</Label>
            <ConditionBuilder
              value={editedRule.condition}
              onChange={handleConditionChange}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("common.actions")}</Label>
            <ActionBuilder
              value={editedRule.actions}
              onChange={handleActionsChange}
            />
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onCancel}>
              <X className="mr-2 h-4 w-4" />
              {t("actions.cancel")}
            </Button>
            <ActionButton loading={isCreating || isUpdating} type="submit">
              <Save className="mr-2 h-4 w-4" />
              {t("settings.rules.save_rule")}
            </ActionButton>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
