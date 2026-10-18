const crypto = require("crypto");

// Encrypts secrets (like a user's MongoDB connection string) before they are
// stored in the database. Key comes from TOKEN_ENCRYPTION_KEY, falling back
// to JWT_SECRET so it works with no extra setup.
const getKey = () =>
  crypto.createHash("sha256")
    .update(String(process.env.TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET || ""))
    .digest();

exports.encrypt = (plain) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["enc1", iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
};

exports.decrypt = (payload) => {
  const [v, iv, tag, data] = String(payload).split(":");
  if (v !== "enc1") throw new Error("Unknown format");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
};
