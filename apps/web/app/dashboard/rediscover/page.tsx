import { redirect } from "next/navigation";
import RediscoveryScreen from "@/components/dashboard/rediscovery/RediscoveryScreen";
import { getServerAuthSession } from "@/server/auth";

export default async function RediscoverPage() {
  const session = await getServerAuthSession();
  if (!session) {
    redirect("/");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Rediscover Bookmarks</h1>
      </div>
      <RediscoveryScreen />
    </div>
  );
}
