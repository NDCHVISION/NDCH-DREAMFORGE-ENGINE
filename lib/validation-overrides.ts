/**
 * Per-reel exceptions to express validation rules.
 *
 * Global rules stay as they are. A reel may relax a rule only when BOTH
 *   1. its seed declares `validation_overrides`, and
 *   2. the reel is listed here with the same (or stricter) values.
 * A declaration from a reel that is not listed, or one that asks for more
 * than its entry allows, is an error, so an override can never spread to
 * other reels or projects by copy-paste.
 *
 * Add an entry only with an explicit editorial decision, and say why.
 */
export interface ValidationOverrides {
  /** Lowest narration word count accepted (the default floor is 70). */
  min_words?: number;
  /** `false` lifts the second-person ("you"/"your") requirement. */
  second_person?: false;
}

export const VALIDATION_OVERRIDE_ALLOWLIST: Readonly<Record<string, ValidationOverrides>> = {
  // NDCH 029 AXIOM, CUT 3 (approved 2026-10-22): a 48-word four-movement
  // narration written in the third person ("Orientation is easy when every
  // reference agrees ... The line never moved").
  NDCH_029_AXIOM: { min_words: 48, second_person: false },
};

/**
 * Resolves the overrides a reel may use. Returns {} when none are declared.
 * Throws when a declaration is not covered by the allowlist.
 */
export function resolveValidationOverrides(
  reelId: string | undefined,
  declared: unknown,
): ValidationOverrides {
  if (declared === undefined || declared === null) return {};
  if (typeof declared !== 'object' || Array.isArray(declared)) {
    throw new Error(`${reelId ?? 'reel'}: validation_overrides must be an object`);
  }
  const d = declared as Record<string, unknown>;
  const allowed = reelId ? VALIDATION_OVERRIDE_ALLOWLIST[reelId] : undefined;
  if (!allowed) {
    throw new Error(
      `${reelId ?? 'reel'}: validation_overrides declared but this reel is not in VALIDATION_OVERRIDE_ALLOWLIST (lib/validation-overrides.ts)`,
    );
  }
  const unknownKeys = Object.keys(d).filter((k) => k !== 'min_words' && k !== 'second_person');
  if (unknownKeys.length) {
    throw new Error(`${reelId}: unknown validation_overrides key(s): ${unknownKeys.join(', ')}`);
  }
  const out: ValidationOverrides = {};
  if (d.min_words !== undefined) {
    if (typeof d.min_words !== 'number' || !Number.isInteger(d.min_words)) {
      throw new Error(`${reelId}: validation_overrides.min_words must be an integer`);
    }
    if (allowed.min_words === undefined || d.min_words < allowed.min_words) {
      throw new Error(
        `${reelId}: validation_overrides.min_words ${d.min_words} is below the allowed ${allowed.min_words ?? 'default'}`,
      );
    }
    out.min_words = d.min_words;
  }
  if (d.second_person !== undefined) {
    if (d.second_person !== false || allowed.second_person !== false) {
      throw new Error(`${reelId}: validation_overrides.second_person is not allowed for this reel`);
    }
    out.second_person = false;
  }
  return out;
}
