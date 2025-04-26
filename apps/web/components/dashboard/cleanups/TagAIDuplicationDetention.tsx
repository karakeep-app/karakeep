"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/trpc";

import TagSuggestionList from "./TagSuggestionList";
import { Tags } from "lucide-react";
import { useTranslation } from "@/lib/i18n/client";
import { ActionButton } from "@/components/ui/action-button";
import React from "react";

const MemoizedTagSuggestionList = React.memo(TagSuggestionList);

export function TagAIDuplicationDetection() {
  const { t } = useTranslation();
  const [userInstructions, setUserInstructions] = useState("");
  const { data: suggestions, refetch, isLoading } = api.tags.aiCleanupSuggestions.useQuery(
    {
      userInstructions: "",
    },
    {
      refetchOnWindowFocus: false,
      enabled: false,
    },
  );

  return (
    <div className="flex flex-col gap-y-4 rounded-md border bg-background p-4">
      <span className="flex items-center gap-1 text-xl">
        <Tags />
        {t("cleanups.duplicate_tags.title")}
      </span>
      <div className="flex flex-col gap-y-4">
        <Input
          value={userInstructions}
          onChange={(v) => setUserInstructions(v.target.value)}
          placeholder="User instructions"
        />
        <ActionButton
          loading={isLoading}
          onClick={() => {
            refetch();
          }}
        >
          Suggest
        </ActionButton>
      </div>
      {suggestions && suggestions.suggestions.length > 0 && (
        <MemoizedTagSuggestionList suggestions={suggestions.suggestions} />
      )}
    </div>
  );
}
