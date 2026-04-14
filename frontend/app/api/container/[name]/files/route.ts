import { NextRequest, NextResponse } from "next/server"

const BACKEND_BASE_URL =
  process.env.BACKEND_API_URL?.replace(/\/$/, "") ?? "http://localhost:3003"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ name: string }> },
) {
  const { name } = await context.params
  const incomingForm = await request.formData()
  const archive = incomingForm.get("file")
  if (!(archive instanceof File)) {
    return NextResponse.json(
      { error: "A ZIP archive is required" },
      { status: 400 },
    )
  }

  const backendForm = new FormData()
  backendForm.append(
    "file",
    archive,
    archive.name || `${name}.zip`,
  )

  const response = await fetch(
    `${BACKEND_BASE_URL}/container/${encodeURIComponent(name)}/files`,
    {
      method: "POST",
      body: backendForm,
    },
  )

  const responseText = await response.text()

  return new NextResponse(responseText, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      "content-type":
        response.headers.get("content-type") ?? "application/json; charset=utf-8",
    },
  })
}
