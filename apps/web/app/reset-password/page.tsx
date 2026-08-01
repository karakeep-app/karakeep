import { redirect } from "next/navigation";
import KarakeepLogo from "@/components/KarakeepIcon";
import ResetPasswordForm from "@/components/signin/ResetPasswordForm";
import { getServerAuthSession } from "@/server/auth";

export default async function ResetPasswordPage({
  searchParams,
}: PageProps<"/reset-password">) {
  const session = await getServerAuthSession();
  if (session) {
    redirect("/");
  }

  const { token } = await searchParams;

  if (typeof token !== "string" || !token) {
    redirect("/signin");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="flex items-center justify-center">
          <KarakeepLogo height={80} />
        </div>
        <ResetPasswordForm token={token} />
      </div>
    </div>
  );
}
