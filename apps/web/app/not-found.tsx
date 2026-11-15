import NotFound from "./dashboard/not-found";

// Unmatched URLs anywhere in the app land here, outside the dashboard layout.
export default function RootNotFound() {
  return (
    <div className="flex min-h-dvh p-4">
      <NotFound />
    </div>
  );
}
