import { useEffect, useRef, useState } from "react";
import { ActionButtonWithTooltip } from "@/components/ui/action-button";
import { ButtonWithTooltip } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipPortal,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTranslation } from "@/lib/i18n/client";
import { Check, Pencil, X } from "lucide-react";

interface Props {
  viewClassName?: string;
  untitledClassName?: string;
  editClassName?: string;
  onSave: (title: string | null) => void;
  isSaving: boolean;
  originalText: string | null;
  setEditable: (editable: boolean) => void;
}

function EditMode({
  onSave: onSaveCB,
  editClassName: className,
  isSaving,
  originalText,
  setEditable,
}: Props) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.focus();
      ref.current.textContent = originalText;
    }
  }, [ref]);

  const onSave = () => {
    let toSave: string | null = ref.current?.textContent ?? null;
    if (originalText == toSave) {
      // Nothing to do here
      return;
    }
    if (toSave == "") {
      toSave = null;
    }
    onSaveCB(toSave);
    setEditable(false);
  };

  return (
    <div className="flex gap-3">
      <div
        ref={ref}
        role="presentation"
        className={className}
        contentEditable={true}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onSave();
          }
        }}
      />
      <ActionButtonWithTooltip
        tooltip={t("actions.save")}
        delayDuration={500}
        size="none"
        variant="ghost"
        className="align-middle text-gray-400"
        loading={isSaving}
        onClick={() => onSave()}
      >
        <Check className="size-4" />
      </ActionButtonWithTooltip>
      <ButtonWithTooltip
        tooltip={t("actions.cancel")}
        delayDuration={500}
        size="none"
        variant="ghost"
        className="align-middle text-gray-400"
        onClick={() => {
          setEditable(false);
        }}
      >
        <X className="size-4" />
      </ButtonWithTooltip>
    </div>
  );
}

function ViewMode({
  originalText,
  setEditable,
  viewClassName,
  untitledClassName,
}: Props) {
  const { t } = useTranslation();
  return (
    <Tooltip delayDuration={500}>
      <div className="flex max-w-full items-center gap-3">
        <TooltipTrigger asChild>
          {originalText ? (
            <p className={viewClassName}>{originalText}</p>
          ) : (
            <p className={untitledClassName}>Untitled</p>
          )}
        </TooltipTrigger>
        <ButtonWithTooltip
          delayDuration={500}
          tooltip={t("actions.edit_title")}
          size="none"
          variant="ghost"
          className="align-middle text-gray-400"
          onClick={() => {
            setEditable(true);
          }}
        >
          <Pencil className="size-4" />
        </ButtonWithTooltip>
      </div>
      <TooltipPortal>
        {originalText && (
          <TooltipContent side="bottom" className="max-w-[40ch] break-words">
            {originalText}
          </TooltipContent>
        )}
      </TooltipPortal>
    </Tooltip>
  );
}

export function EditableText(props: {
  viewClassName?: string;
  untitledClassName?: string;
  editClassName?: string;
  originalText: string | null;
  onSave: (title: string | null) => void;
  isSaving: boolean;
}) {
  const [editable, setEditable] = useState(false);

  return editable ? (
    <EditMode setEditable={setEditable} {...props} />
  ) : (
    <ViewMode setEditable={setEditable} {...props} />
  );
}
