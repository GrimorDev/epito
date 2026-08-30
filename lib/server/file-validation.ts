import path from "node:path";

type ValidatedFile = {
  extension: string;
  mimeType: string;
};

const PDF_SIGNATURE = Buffer.from("%PDF-", "ascii");
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);
const RIFF_SIGNATURE = Buffer.from("RIFF", "ascii");
const WEBP_SIGNATURE = Buffer.from("WEBP", "ascii");

function startsWith(bytes: Buffer, signature: Buffer) {
  return bytes.length >= signature.length && bytes.subarray(0, signature.length).equals(signature);
}

function declaredTypeMatches(declaredType: string, acceptedTypes: string[]) {
  const normalized = declaredType.trim().toLowerCase();
  return !normalized || normalized === "application/octet-stream" || acceptedTypes.includes(normalized);
}

export function validateXmlUpload(bytes: Buffer, declaredType = ""): string | null {
  if (!bytes.length || bytes.includes(0)) return null;
  const text = bytes.toString("utf8").replace(/^\uFEFF/, "").trimStart();
  if (!text.startsWith("<") || /<!DOCTYPE\b|<!ENTITY\b/i.test(text)) return null;
  if (!declaredTypeMatches(declaredType, ["application/xml", "text/xml"])) return null;
  return text;
}

export function validateDocumentUpload(bytes: Buffer, originalName: string, declaredType = ""): ValidatedFile | null {
  const sourceExtension = path.extname(originalName).toLowerCase();

  if (startsWith(bytes, PDF_SIGNATURE) && declaredTypeMatches(declaredType, ["application/pdf"])) {
    return { extension: ".pdf", mimeType: "application/pdf" };
  }
  if (startsWith(bytes, PNG_SIGNATURE) && declaredTypeMatches(declaredType, ["image/png"])) {
    return { extension: ".png", mimeType: "image/png" };
  }
  if (startsWith(bytes, JPEG_SIGNATURE) && declaredTypeMatches(declaredType, ["image/jpeg", "image/jpg"])) {
    return { extension: ".jpg", mimeType: "image/jpeg" };
  }
  if (sourceExtension === ".xml" && validateXmlUpload(bytes, declaredType)) {
    return { extension: ".xml", mimeType: "application/xml" };
  }
  if (sourceExtension === ".csv" && !bytes.includes(0) && declaredTypeMatches(declaredType, ["text/csv", "application/csv", "text/plain"])) {
    return { extension: ".csv", mimeType: "text/csv" };
  }
  return null;
}

export function validateLogoUpload(bytes: Buffer, declaredType = ""): ValidatedFile | null {
  if (startsWith(bytes, PNG_SIGNATURE) && declaredTypeMatches(declaredType, ["image/png"])) {
    return { extension: ".png", mimeType: "image/png" };
  }
  if (startsWith(bytes, JPEG_SIGNATURE) && declaredTypeMatches(declaredType, ["image/jpeg", "image/jpg"])) {
    return { extension: ".jpg", mimeType: "image/jpeg" };
  }
  const isWebP = startsWith(bytes, RIFF_SIGNATURE) && bytes.length >= 12 && bytes.subarray(8, 12).equals(WEBP_SIGNATURE);
  if (isWebP && declaredTypeMatches(declaredType, ["image/webp"])) {
    return { extension: ".webp", mimeType: "image/webp" };
  }
  return null;
}
