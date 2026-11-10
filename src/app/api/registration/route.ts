// Adds a registration sticker (with its photo) from the Registration page. The photo is made small in the browser first.
import { NextResponse, type NextRequest } from "next/server";
import { STAFF_COOKIE, validateStaff } from "@/lib/auth/session";
import { createRegistration } from "@/lib/registration/store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX = 3 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];
const text = (v: FormDataEntryValue | null, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

async function readImage(file: FormDataEntryValue | null): Promise<{ data: Buffer; type: string } | null | "bad"> {
  if (!file || typeof file === "string" || file.size === 0) return null;
  if (!TYPES.includes(file.type) || file.size > MAX) return "bad";
  return { data: Buffer.from(await file.arrayBuffer()), type: file.type };
}

export async function POST(req: NextRequest) {
  const staff = validateStaff(req.cookies.get(STAFF_COOKIE)?.value);
  if (!staff) return NextResponse.json({ error: "Your session ended. Sign in again." }, { status: 401 });
  try {
    const form = await req.formData();
    const photo = await readImage(form.get("photo"));
    const thumb = await readImage(form.get("thumb"));
    if (photo === "bad" || thumb === "bad") return NextResponse.json({ error: "The photo must be a JPG, PNG or WebP under 3 MB." }, { status: 400 });
    const name = text(form.get("name"), 80), phone = text(form.get("phone"), 30), vehicle = text(form.get("vehicle"), 100);
    if (!name && !phone && !photo) return NextResponse.json({ error: "Add a photo, or at least a name or phone number." }, { status: 400 });
    const id = await createRegistration({ name, phone, vehicle, deferred: form.get("deferred") === "1", note: text(form.get("note"), 500), photo: photo?.data ?? null, thumb: thumb?.data ?? null, type: photo?.type, by: staff.name });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === "no_db" ? "This turns on when the database is connected." : "Couldn't save it. Try again." }, { status: 500 });
  }
}
