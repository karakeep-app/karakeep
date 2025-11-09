import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import Logo from "./Logo";
import usePluginSettings from "./utils/settings";

export default function CustomHeadersPage() {
  const navigate = useNavigate();
  const { settings, setSettings } = usePluginSettings();

  // Convert headers object to array of entries for easier manipulation
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>([]);
  const [newHeaderKey, setNewHeaderKey] = useState("");
  const [newHeaderValue, setNewHeaderValue] = useState("");

  // Update headers when settings change (e.g., when loaded from storage)
  useEffect(() => {
    setHeaders(
      Object.entries(settings.customHeaders || {}).map(([key, value]) => ({
        key,
        value,
      })),
    );
  }, [settings.customHeaders]);

  const handleAddHeader = () => {
    if (!newHeaderKey.trim() || !newHeaderValue.trim()) {
      return;
    }

    // Check if header already exists
    const existingIndex = headers.findIndex((h) => h.key === newHeaderKey);
    if (existingIndex >= 0) {
      // Update existing header
      const updatedHeaders = [...headers];
      updatedHeaders[existingIndex].value = newHeaderValue;
      setHeaders(updatedHeaders);
    } else {
      // Add new header
      setHeaders([...headers, { key: newHeaderKey, value: newHeaderValue }]);
    }

    setNewHeaderKey("");
    setNewHeaderValue("");
  };

  const handleRemoveHeader = (index: number) => {
    setHeaders(headers.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    // Convert array back to object
    const headersObject = headers.reduce(
      (acc, { key, value }) => {
        if (key.trim() && value.trim()) {
          acc[key] = value;
        }
        return acc;
      },
      {} as Record<string, string>,
    );

    setSettings((s) => ({ ...s, customHeaders: headersObject }));
    navigate(-1);
  };

  const handleCancel = () => {
    navigate(-1);
  };

  return (
    <div className="flex flex-col space-y-2">
      <Logo />
      <span className="text-lg">Custom Headers</span>
      <p className="text-sm text-muted-foreground">
        Add custom HTTP headers that will be sent with every API request.
      </p>
      <hr />

      {/* Existing Headers List */}
      <div className="max-h-64 space-y-2 overflow-y-auto">
        {headers.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No custom headers configured
          </p>
        ) : (
          headers.map((header, index) => (
            <div
              key={index}
              className="flex items-center gap-2 rounded-lg border bg-background p-3"
            >
              <div className="flex-1 space-y-1">
                <p className="text-sm font-semibold">{header.key}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {header.value}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveHeader(index)}
                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </div>

      <hr />

      {/* Add New Header */}
      <div className="space-y-2">
        <p className="text-sm font-semibold">Add New Header</p>
        <Input
          placeholder="Header Name (e.g., X-Custom-Header)"
          value={newHeaderKey}
          onChange={(e) => setNewHeaderKey(e.target.value)}
          autoCapitalize="none"
        />
        <Input
          placeholder="Header Value"
          value={newHeaderValue}
          onChange={(e) => setNewHeaderValue(e.target.value)}
          autoCapitalize="none"
        />
        <Button
          variant="secondary"
          onClick={handleAddHeader}
          disabled={!newHeaderKey.trim() || !newHeaderValue.trim()}
          className="w-full"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Header
        </Button>
      </div>

      <hr />

      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button variant="outline" onClick={handleCancel} className="flex-1">
          Cancel
        </Button>
        <Button onClick={handleSave} className="flex-1">
          Save
        </Button>
      </div>
    </div>
  );
}
