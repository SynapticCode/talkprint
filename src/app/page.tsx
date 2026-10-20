import { redirect } from "next/navigation";

// Middleware sends signed-out visitors to /login; everyone else lands in the app.
export default function Home() {
  redirect("/app");
}
