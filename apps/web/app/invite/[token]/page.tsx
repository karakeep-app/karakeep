import { redirect } from "next/navigation";
import InviteAcceptForm from "@/components/invite/InviteAcceptForm";
import KarakeepLogo from "@/components/KarakeepIcon";
import { getServerAuthSession } from "@/server/auth";

export default async function InvitePage({
  params,
}: PageProps<"/invite/[token]">) {
  const session = await getServerAuthSession();
  if (session) {
    redirect("/");
  }

  const { token } = await params;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="flex items-center justify-center">
          <KarakeepLogo height={80} />
        </div>
        <InviteAcceptForm token={token} />
      </div>
    </div>
  );
}
