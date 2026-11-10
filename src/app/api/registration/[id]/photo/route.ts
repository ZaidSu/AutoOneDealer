// A registration sticker's photo: view or download it (GET), or add one to an entry that has none (POST).
import { NextResponse, type NextRequest } from "next/server";
import { STAFF_COOKIE, validateStaff } from "@/lib/auth/session";
import { attachPhoto, getPhoto } from "@/lib/registration/store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const MAX = 3 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!validateStaff(req.cookies.get(STAFF_COOKIE)?.value)) return new NextResponse("Sign in first", { status: 401 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return new NextResponse("Not found", { status: 404 });
  const thumb = req.nextUrl.searchParams.get("thumb") === "1";
  const photo = await getPhoto(id, thumb).catch(() => null);
  if (!photo) return new NextResponse("No photo", { status: 404 });
  const headers: Record<string, string> = { "Content-Type": photo.type, "Cache-Control": "private, max-age=300" };
  if (req.nextUrl.searchParams.get("download") === "1") headers["Content-Disposition"] = `attachment; filename="registration-${id}.${photo.type.includes("png") ? "png" : photo.type.includes("webp") ? "webp" : "jpg"}"`;
  return new NextResponse(new Uint8Array(photo.data), { headers });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staff = validateStaff(req.cookies.get(STAFF_COOKIE)?.value);
  if (!staff) return NextResponse.json({ error: "Your session ended. Sign in again." }, { status: 401 });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const form = await req.formData();
    const photo = form.get("photo"), thumb = form.get("thumb");
    if (!photo || typeof photo === "string" || photo.size === 0 || photo.size > MAX || !TYPES.includes(photo.type)) return NextResponse.json({ error: "The photo must be a JPG, PNG or WebP under 3 MB." }, { status: 400 });
    const small = thumb && typeof thumb !== "string" && thumb.size > 0 && thumb.size <= MAX ? Buffer.from(await thumb.arrayBuffer()) : null;
    const ok = await attachPhoto(id, Buffer.from(await photo.arrayBuffer()), small, photo.type, staff.name);
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Couldn't save the photo. Try again." }, { status: 500 });
  }
}
