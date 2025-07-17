import React, { useEffect, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useBookmarkLists } from "@karakeep/shared-react/hooks/lists";

import { Button } from "./components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./components/ui/popover";
import Logo from "./Logo";
import Spinner from "./Spinner";
import { cn } from "./utils/css";
import usePluginSettings from "./utils/settings";
import { api } from "./utils/trpc";

export default function OptionsPage() {
  const navigate = useNavigate();
  const { settings, setSettings } = usePluginSettings();
  const [defaultListOpen, setDefaultListOpen] = useState(false);

  const { data: whoami, error: whoAmIError } = api.users.whoami.useQuery(
    undefined,
    {
      enabled: settings.address != "",
    },
  );

  const { data: allLists } = useBookmarkLists(undefined, {
    enabled: settings.address != "",
  });

  const { mutate: deleteKey } = api.apiKeys.revoke.useMutation();

  const invalidateWhoami = api.useUtils().users.whoami.refetch;

  useEffect(() => {
    invalidateWhoami();
  }, [settings, invalidateWhoami]);

  let loggedInMessage: React.ReactNode;
  if (whoAmIError) {
    if (whoAmIError.data?.code == "UNAUTHORIZED") {
      loggedInMessage = <span>Not logged in</span>;
    } else {
      loggedInMessage = (
        <span>Something went wrong: {whoAmIError.message}</span>
      );
    }
  } else if (whoami) {
    loggedInMessage = <span>{whoami.email}</span>;
  } else {
    loggedInMessage = <Spinner />;
  }

  const onLogout = () => {
    if (settings.apiKeyId) {
      deleteKey({ id: settings.apiKeyId });
    }
    setSettings((s) => ({ ...s, apiKey: "", apiKeyId: undefined }));
    invalidateWhoami();
    navigate("/notconfigured");
  };

  const selectedList = allLists?.allPaths.find(
    (path) => path[path.length - 1].id === settings.defaultListId,
  );

  const onSelectDefaultList = (listId: string) => {
    if (listId === "none") {
      setSettings((s) => ({ ...s, defaultListId: undefined }));
    } else {
      setSettings((s) => ({ ...s, defaultListId: listId }));
    }
    setDefaultListOpen(false);
  };

  return (
    <div className="flex flex-col space-y-2">
      <Logo />
      <span className="text-lg">Settings</span>
      <hr />
      <div className="flex gap-2">
        <span className="my-auto">Server Address:</span>
        {settings.address}
      </div>
      <div className="flex gap-2">
        <span className="my-auto">Logged in as:</span>
        {loggedInMessage}
      </div>
      {whoami && (
        <>
          <hr />
          <div className="flex flex-col gap-2">
            <span className="my-auto">Default List:</span>
            <Popover open={defaultListOpen} onOpenChange={setDefaultListOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={defaultListOpen}
                  className="justify-between"
                >
                  {selectedList
                    ? selectedList
                        .map((item) => `${item.icon} ${item.name}`)
                        .join(" / ")
                    : "None (always choose list)"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[320px] p-0">
                <Command>
                  <CommandInput placeholder="Search Lists..." />
                  <CommandList>
                    <CommandEmpty>No lists found.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        key="none"
                        value="none"
                        onSelect={onSelectDefaultList}
                      >
                        <Check
                          className={cn(
                            "mr-2 size-4",
                            !settings.defaultListId
                              ? "opacity-100"
                              : "opacity-0",
                          )}
                        />
                        None (always choose list)
                      </CommandItem>
                      {allLists?.allPaths.map((path) => {
                        const lastItem = path[path.length - 1];
                        return (
                          <CommandItem
                            key={lastItem.id}
                            value={lastItem.id}
                            keywords={[lastItem.name, lastItem.icon]}
                            onSelect={onSelectDefaultList}
                          >
                            <Check
                              className={cn(
                                "mr-2 size-4",
                                settings.defaultListId === lastItem.id
                                  ? "opacity-100"
                                  : "opacity-0",
                              )}
                            />
                            {path
                              .map((item) => `${item.icon} ${item.name}`)
                              .join(" / ")}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </>
      )}
      <Button onClick={onLogout}>Logout</Button>
    </div>
  );
}
