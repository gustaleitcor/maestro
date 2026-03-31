import { NextRequest, NextResponse } from "next/server"

const BACKEND_BASE_URL =
  process.env.BACKEND_API_URL?.replace(/\/$/, "") ?? "http://localhost:3003"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function proxyRequest(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params
  const targetUrl = new URL(
    `${BACKEND_BASE_URL}/${path.join("/")}${request.nextUrl.search}`,
  )

  const headers = new Headers()
  const contentType = request.headers.get("content-type")
  const accept = request.headers.get("accept")
  const authorization = request.headers.get("authorization")

  if (contentType) {
    headers.set("content-type", contentType)
  }
  if (accept) {
    headers.set("accept", accept)
  }
  if (authorization) {
    headers.set("authorization", authorization)
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer()
  }

  const response = await fetch(targetUrl, init)
  const responseHeaders = new Headers(response.headers)
  responseHeaders.delete("content-encoding")
  responseHeaders.delete("content-length")
  responseHeaders.delete("transfer-encoding")

  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  })
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context)
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context)
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context)
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context)
}

export async function OPTIONS(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyRequest(request, context)
}
