import { permanentRedirect } from "next/navigation";

/** Early is now the waitlist: old links land there. */
export default function EarlyPage() {
  permanentRedirect("/waitlist");
}
