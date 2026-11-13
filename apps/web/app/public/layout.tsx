export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen items-center justify-center overflow-y-auto bg-panel">
      <main className="container mt-3 p-4">{children}</main>
    </div>
  );
}
