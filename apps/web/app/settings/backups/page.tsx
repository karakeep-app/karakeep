import BackupSettings from "@/components/settings/BackupSettings";

export default function BackupsPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">Backups</h1>
      <p className="text-muted-foreground">
        Automatically create and manage backups of your bookmarks. Backups are
        compressed and stored securely.
      </p>
      <BackupSettings />
    </div>
  );
}
