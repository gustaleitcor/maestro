type ZipEntry = {
  path: string
  data: Uint8Array
  lastModified: number
  isDirectory: boolean
}

const textEncoder = new TextEncoder()
const crcTable = new Uint32Array(256).map((_, index) => {
  let value = index

  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }

  return value >>> 0
})

function normalizePath(path: string) {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".")
    .join("/")
}

function ensureRelativePath(path: string) {
  const normalizedPath = normalizePath(path)

  if (
    !normalizedPath ||
    normalizedPath.startsWith("/") ||
    normalizedPath.split("/").some((segment) => segment === "..")
  ) {
    throw new Error(`Invalid file path: ${path}`)
  }

  return normalizedPath
}

function toDosDateTime(timestamp: number) {
  const date = new Date(timestamp)
  const year = Math.min(Math.max(date.getFullYear(), 1980), 2107)
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const seconds = Math.floor(date.getSeconds() / 2)

  return {
    date: ((year - 1980) << 9) | (month << 5) | day,
    time: (hours << 11) | (minutes << 5) | seconds,
  }
}

function crc32(bytes: Uint8Array) {
  let value = 0xffffffff

  for (const byte of bytes) {
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8)
  }

  return (value ^ 0xffffffff) >>> 0
}

function writeUint16(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff
  target[offset + 1] = (value >>> 8) & 0xff
}

function writeUint32(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff
  target[offset + 1] = (value >>> 8) & 0xff
  target[offset + 2] = (value >>> 16) & 0xff
  target[offset + 3] = (value >>> 24) & 0xff
}

function buildLocalHeader(entry: ZipEntry, encodedPath: Uint8Array) {
  const header = new Uint8Array(30 + encodedPath.length)
  const { date, time } = toDosDateTime(entry.lastModified)
  const checksum = crc32(entry.data)

  writeUint32(header, 0, 0x04034b50)
  writeUint16(header, 4, 20)
  writeUint16(header, 6, 0x0800)
  writeUint16(header, 8, 0)
  writeUint16(header, 10, time)
  writeUint16(header, 12, date)
  writeUint32(header, 14, checksum)
  writeUint32(header, 18, entry.data.length)
  writeUint32(header, 22, entry.data.length)
  writeUint16(header, 26, encodedPath.length)
  writeUint16(header, 28, 0)
  header.set(encodedPath, 30)

  return header
}

function buildCentralDirectoryHeader(
  entry: ZipEntry,
  encodedPath: Uint8Array,
  localHeaderOffset: number,
) {
  const header = new Uint8Array(46 + encodedPath.length)
  const { date, time } = toDosDateTime(entry.lastModified)
  const checksum = crc32(entry.data)

  writeUint32(header, 0, 0x02014b50)
  writeUint16(header, 4, 20)
  writeUint16(header, 6, 20)
  writeUint16(header, 8, 0x0800)
  writeUint16(header, 10, 0)
  writeUint16(header, 12, time)
  writeUint16(header, 14, date)
  writeUint32(header, 16, checksum)
  writeUint32(header, 20, entry.data.length)
  writeUint32(header, 24, entry.data.length)
  writeUint16(header, 28, encodedPath.length)
  writeUint16(header, 30, 0)
  writeUint16(header, 32, 0)
  writeUint16(header, 34, 0)
  writeUint16(header, 36, 0)
  writeUint32(header, 38, entry.isDirectory ? 0x10 : 0)
  writeUint32(header, 42, localHeaderOffset)
  header.set(encodedPath, 46)

  return header
}

type InputEntry = {
  path: string
  data: Uint8Array
  lastModified?: number
}

export function createZipArchive(entries: InputEntry[]) {
  const normalizedEntries = new Map<string, ZipEntry>()

  for (const entry of entries) {
    const path = ensureRelativePath(entry.path)
    const segments = path.split("/")
    let parentPath = ""

    for (let index = 0; index < segments.length - 1; index += 1) {
      parentPath = parentPath ? `${parentPath}/${segments[index]}` : segments[index]
      const directoryPath = `${parentPath}/`

      if (!normalizedEntries.has(directoryPath)) {
        normalizedEntries.set(directoryPath, {
          path: directoryPath,
          data: new Uint8Array(),
          lastModified: entry.lastModified ?? Date.now(),
          isDirectory: true,
        })
      }
    }

    normalizedEntries.set(path, {
      path,
      data: entry.data,
      lastModified: entry.lastModified ?? Date.now(),
      isDirectory: false,
    })
  }

  const orderedEntries = Array.from(normalizedEntries.values()).sort((left, right) =>
    left.path.localeCompare(right.path),
  )

  const fileParts: Uint8Array[] = []
  const centralDirectoryParts: Uint8Array[] = []
  let currentOffset = 0

  for (const entry of orderedEntries) {
    const encodedPath = textEncoder.encode(entry.path)
    const localHeader = buildLocalHeader(entry, encodedPath)
    const centralDirectoryHeader = buildCentralDirectoryHeader(
      entry,
      encodedPath,
      currentOffset,
    )

    fileParts.push(localHeader, entry.data)
    centralDirectoryParts.push(centralDirectoryHeader)
    currentOffset += localHeader.length + entry.data.length
  }

  const centralDirectoryOffset = currentOffset
  const centralDirectoryLength = centralDirectoryParts.reduce(
    (total, part) => total + part.length,
    0,
  )
  const endOfCentralDirectory = new Uint8Array(22)

  writeUint32(endOfCentralDirectory, 0, 0x06054b50)
  writeUint16(endOfCentralDirectory, 4, 0)
  writeUint16(endOfCentralDirectory, 6, 0)
  writeUint16(endOfCentralDirectory, 8, orderedEntries.length)
  writeUint16(endOfCentralDirectory, 10, orderedEntries.length)
  writeUint32(endOfCentralDirectory, 12, centralDirectoryLength)
  writeUint32(endOfCentralDirectory, 16, centralDirectoryOffset)
  writeUint16(endOfCentralDirectory, 20, 0)

  const archive = new Uint8Array(
    centralDirectoryOffset + centralDirectoryLength + endOfCentralDirectory.length,
  )
  let offset = 0

  for (const part of fileParts) {
    archive.set(part, offset)
    offset += part.length
  }

  for (const part of centralDirectoryParts) {
    archive.set(part, offset)
    offset += part.length
  }

  archive.set(endOfCentralDirectory, offset)

  return archive
}
