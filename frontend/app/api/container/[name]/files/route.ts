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
  const files = incomingForm.getAll("files")
  const paths = incomingForm.getAll("paths")

  const backendForm = new FormData()

  files.forEach((value, index) => {
    if (!(value instanceof File)) {
      return
    }

    backendForm.append("files", value, value.name)

    const pathValue = paths[index]
    if (typeof pathValue === "string") {
      backendForm.append("paths", pathValue)
    }
  })

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
