import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { put } from "@vercel/blob";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

const LOCAL_UPLOAD_DIR = join(process.cwd(), "public", "uploads");

async function uploadLocal(
  file: File
): Promise<{ url: string; size: number; name: string; mimeType: string }> {
  await mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
  const ext = file.name.split(".").pop() || "bin";
  const storedName = `${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const filePath = join(LOCAL_UPLOAD_DIR, storedName);
  await writeFile(filePath, buffer);

  return {
    url: `/uploads/${storedName}`,
    size: file.size,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
  };
}

async function uploadVercelBlob(
  file: File
): Promise<{ url: string; size: number; name: string; mimeType: string }> {
  const blob = await put(file.name, file, {
    access: "public",
    addRandomSuffix: true,
  });

  return {
    url: blob.url,
    size: file.size,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
  };
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const useVercel = !!process.env.BLOB_READ_WRITE_TOKEN;
    const results = await Promise.all(
      files.map((file) =>
        useVercel ? uploadVercelBlob(file) : uploadLocal(file)
      )
    );

    return NextResponse.json({ files: results });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
