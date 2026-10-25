import Spinner from "../Spinner";

export function StatusMessage({
  label,
  detail,
}: {
  label: string;
  detail?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <Spinner className="size-6 text-muted-foreground" />
      <div className="flex w-full flex-col gap-1">
        <p className="text-sm font-medium">{label}</p>
        {detail && (
          <p className="truncate px-4 text-xs text-muted-foreground">
            {detail}
          </p>
        )}
      </div>
    </div>
  );
}
