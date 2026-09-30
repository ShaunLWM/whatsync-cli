import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js"

function toDigits(input: string): string {
  return input.replace(/\D/g, "")
}

/**
 * Infer the user's country from their own WhatsApp number so contacts saved
 * in local format (no country code) can be parsed.
 */
export function inferRegion(ownNumber?: string): CountryCode | undefined {
  if (!ownNumber) return undefined
  return parsePhoneNumberFromString("+" + toDigits(ownNumber))?.country
}

/**
 * Normalize an arbitrary phone string to E.164 digits (no +).
 * e.g. "+65 9123 4567" → "6591234567"
 */
export function toE164Digits(
  input: string,
  defaultCountry?: CountryCode
): string | undefined {
  if (!input) return undefined
  const parsed = parsePhoneNumberFromString(input, defaultCountry)
  if (!parsed || !parsed.isPossible()) return undefined
  return toDigits(parsed.number)
}

/**
 * Legacy country-specific variants where WhatsApp and E.164 differ
 * by a mobile-indicator digit.
 */
export function legacyVariants(digits: string): string[] {
  const variants = new Set<string>()
  const add = (value: string) => {
    if (value !== digits) variants.add(value)
  }

  // Brazil (+55): mobile 9 prefix
  if (digits.startsWith("55")) {
    if (digits.length === 13 && digits[4] === "9") {
      add(digits.slice(0, 4) + digits.slice(5))
    } else if (digits.length === 12) {
      add(digits.slice(0, 4) + "9" + digits.slice(4))
    }
  }

  // Mexico (+52): mobile 1 prefix
  if (digits.startsWith("52")) {
    if (digits.length === 12) {
      add("521" + digits.slice(2))
    } else if (digits.length === 13 && digits[2] === "1") {
      add("52" + digits.slice(3))
    }
  }

  // Argentina (+54): mobile 9 prefix
  if (digits.startsWith("54")) {
    if (digits[2] !== "9") {
      add("549" + digits.slice(2))
    } else {
      add("54" + digits.slice(3))
    }
  }

  return [...variants]
}

/**
 * Build ordered probe list for matching a Google number against WhatsApp contacts.
 * Tries E.164 first, then legacy variants, then bare digits as fallback.
 */
export function matchCandidates(
  rawNumber: string,
  defaultCountry?: CountryCode
): string[] {
  const candidates: string[] = []
  const seen = new Set<string>()
  const push = (value?: string) => {
    if (value && !seen.has(value)) {
      seen.add(value)
      candidates.push(value)
    }
  }

  const e164 = toE164Digits(rawNumber, defaultCountry)
  push(e164)
  if (e164) legacyVariants(e164).forEach(push)
  push(toDigits(rawNumber))

  return candidates
}

/**
 * Normalize a WhatsApp phone (digits without +) to E.164 digits.
 */
export function normalizePhone(phone: string): string | null {
  const result = toE164Digits("+" + phone.replace(/\D/g, ""))
  if (result) return result
  const digits = phone.replace(/\D/g, "")
  return digits.length >= 7 ? digits : null
}
