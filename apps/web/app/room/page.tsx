import { redirect } from "next/navigation";

/** "Room" was renamed to "Group"; old links keep working. */
export default async function RoomRedirect({ searchParams }: { searchParams: Promise<{ with?: string }> }) {
  const { with: w } = await searchParams;
  redirect(w ? `/group?with=${encodeURIComponent(w)}` : "/group");
}
