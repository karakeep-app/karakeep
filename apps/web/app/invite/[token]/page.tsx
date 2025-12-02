import { redirect } from "next/navigation";
import InviteAcceptForm from "@/components/invite/InviteAcceptForm";
import KarakeepLogo from "@/components/KarakeepIcon";
import { getServerAuthSession } from "@/server/auth";

interface InvitePageProps {
  params: {
    token: string;
  };
}

export default async function InvitePage({ params }: InvitePageProps) {
  const session = await getServerAuthSession();
  if (session) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="flex items-center justify-center">
          <KarakeepLogo height={80} />
        </div>
        <InviteAcceptForm token={params.token} />
      </div>
    </div>
  );
}
