import CopyBtn from "@/components/ui/copy-button";
import { Input } from "@/components/ui/input";

export default function ApiKeySuccess({
  apiKey,
  message,
}: {
  apiKey: string;
  message: string;
}) {
  return (
    <div>
      <div className="py-4 text-sm text-muted-foreground">{message}</div>
      <div className="flex space-x-2 pt-2">
        <Input value={apiKey} readOnly />
        <CopyBtn
          getStringToCopy={() => {
            return apiKey;
          }}
        />
      </div>
    </div>
  );
}
