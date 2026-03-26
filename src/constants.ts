export const CHALLENGE = "horizen";
export const HKDF_SALT = new Uint8Array(0);
export const HKDF_INFO = new Uint8Array(0);

/** Message signed to produce the seed for privacy-preserving subtypes. */
export const SUBTYPE_KEY_MESSAGE = "subtype-key-v1";

/** Number of HMAC-derived subtypes generated from a seed. */
export const DEFAULT_SUBTYPE_N = 50;