"use strict";
// Small .eml reader: enough for typical invoice emails (headers, plain-text body, attachment names).
// For production mailboxes, swap this for a full mail-parsing library.
const crypto = require("crypto");

function decodeWords(s) {
  return String(s || "").replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (all, cs, enc, data) => {
    try {
      const buf = enc.toLowerCase() === "b" ? Buffer.from(data, "base64")
        : Buffer.from(data.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16))), "binary");
      return buf.toString("utf8");
    } catch { return all; }
  });
}

function splitPart(raw) {
  const m = /\r?\n\r?\n/.exec(raw);
  const head = m ? raw.slice(0, m.index) : raw, body = m ? raw.slice(m.index + m[0].length) : "";
  const headers = {};
  head.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/).forEach((line) => {
    const i = line.indexOf(":");
    if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  });
  return { headers, body };
}

function decodeBody(body, encoding) {
  const enc = String(encoding || "").toLowerCase();
  if (enc === "base64") return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
  if (enc === "quoted-printable") {
    const bin = body.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16)));
    return Buffer.from(bin, "binary").toString("utf8");
  }
  return body;
}

function walk(raw, out, depth) {
  const { headers, body } = splitPart(raw);
  const type = headers["content-type"] || "text/plain", disp = headers["content-disposition"] || "";
  const boundary = /boundary="?([^";\s]+)"?/i.exec(type);
  if (/^multipart\//i.test(type) && boundary && depth < 5) {
    body.split("--" + boundary[1]).slice(1).forEach((p) => { if (!/^--/.test(p)) walk(p.replace(/^\r?\n/, ""), out, depth + 1); });
    return headers;
  }
  const name = /filename\*?="?([^";\r\n]+)"?/i.exec(disp) || /name="?([^";\r\n]+)"?/i.exec(type);
  if (/attachment/i.test(disp) || name) out.attachments.push(decodeWords(name ? name[1] : "attachment"));
  else if (/^text\/plain/i.test(type) && !out.body) out.body = decodeBody(body, headers["content-transfer-encoding"]).trim();
  return headers;
}

function parseEml(raw) {
  const out = { body: "", attachments: [] };
  const h = walk(String(raw), out, 0);
  const date = new Date(h.date);
  return {
    id: h["message-id"] || "sha1:" + crypto.createHash("sha1").update(String(raw)).digest("hex"),
    from: decodeWords(h.from), subject: decodeWords(h.subject),
    date: Number.isNaN(date.getTime()) ? new Date() : date,
    body: out.body, attachments: out.attachments
  };
}

module.exports = { parseEml };
