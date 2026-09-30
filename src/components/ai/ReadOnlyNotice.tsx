/** Shown on AI settings when the signed-in account can look but not change anything. */
export default function ReadOnlyNotice() {
  return (
    <p role="note" className="rounded-xl border border-lane/40 bg-[#fdf6e3] px-4 py-3 text-sm">
      <span className="font-semibold">View only.</span> Your account can see this but not change it. Owners, managers and the developer can edit it.
    </p>
  );
}
