export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen items-center justify-center overflow-y-auto bg-muted">
      <main className="container mt-3">{children}</main>
    </div>
  );
}
