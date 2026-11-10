import { redirect } from "next/navigation";

// The Pipeline board was removed. Old bookmarks go to Customers.
export default function PipelineGone() {
  redirect("/customers");
}
