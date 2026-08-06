import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const SCRYPT_N = 32_768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

function derive(password: string, salt: Buffer, n: number, r: number, p: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      { N: n, r, p, maxmem: 64 * 1024 * 1024 },
      (error, value) => (error ? reject(error) : resolve(value)),
    );
  });
}

export function validatePassword(password: string) {
  if (password.length < 12) return "Hasło musi mieć co najmniej 12 znaków.";
  if (password.length > 256) return "Hasło jest zbyt długie.";
  if (!/[a-ząćęłńóśźż]/i.test(password) || !/[0-9]/.test(password)) {
    return "Hasło musi zawierać literę i cyfrę.";
  }
  return null;
}

export async function hashPassword(password: string) {
  const validationError = validatePassword(password);
  if (validationError) throw new Error(validationError);

  const salt = randomBytes(24);
  const derivedKey = await derive(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}

export async function verifyPassword(password: string, encodedHash: string) {
  const [algorithm, rawN, rawR, rawP, rawSalt, rawHash] = encodedHash.split("$");
  if (algorithm !== "scrypt" || !rawN || !rawR || !rawP || !rawSalt || !rawHash) {
    return false;
  }

  const n = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (n !== SCRYPT_N || r !== SCRYPT_R || p !== SCRYPT_P) return false;

  const expected = Buffer.from(rawHash, "base64url");
  const actual = await derive(password, Buffer.from(rawSalt, "base64url"), n, r, p);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
