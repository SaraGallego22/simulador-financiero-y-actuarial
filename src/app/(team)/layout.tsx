import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session || session.user.role !== "TEAM") redirect("/login");
  return <>{children}</>;
}
