import assert from "node:assert/strict";
import test from "node:test";
import { validateDocumentUpload, validateLogoUpload, validateXmlUpload } from "../lib/server/file-validation";

test("recognizes file content instead of trusting its name", () => {
  const pdf = Buffer.from("%PDF-1.7\nexample", "ascii");
  assert.deepEqual(validateDocumentUpload(pdf, "invoice.exe", "application/pdf"), {
    extension: ".pdf",
    mimeType: "application/pdf",
  });
  assert.equal(validateDocumentUpload(pdf, "invoice.pdf", "image/png"), null);
});

test("rejects XML external entity and DTD declarations", () => {
  assert.equal(validateXmlUpload(Buffer.from("<?xml version=\"1.0\"?><JPK/>"), "application/xml")?.includes("<JPK"), true);
  assert.equal(validateXmlUpload(Buffer.from("<!DOCTYPE foo [<!ENTITY xxe SYSTEM \"file:///etc/passwd\">]><foo>&xxe;</foo>"), "application/xml"), null);
});

test("recognizes image signatures and rejects a forged browser MIME type", () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);
  assert.deepEqual(validateLogoUpload(png, "image/png"), { extension: ".png", mimeType: "image/png" });
  assert.equal(validateLogoUpload(Buffer.from("not an image"), "image/png"), null);
});
