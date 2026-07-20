import { randomBytes } from 'crypto';

// ---------------------------------------------------------------------------
// Character sets
// ---------------------------------------------------------------------------

const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const NUMBERS = '0123456789';
const SPECIAL = '!@#$%^&*()_+~`|}{[]:;?><,./-=';

// Characters that are easily confused with one another when displayed/typed.
const AMBIGUOUS = 'Il1O0o';

export interface PasswordOptions {
  /** Desired password length. Minimum 8 (enforced). Default: 16 */
  length?: number;
  /** Include uppercase letters. Default: true */
  useUppercase?: boolean;
  /** Include lowercase letters. Default: true */
  useLowercase?: boolean;
  /** Include digits. Default: true */
  useNumbers?: boolean;
  /** Include special/symbol characters. Default: true */
  useSpecial?: boolean;
  /** Strip visually ambiguous characters (I, l, 1, O, 0, o). Default: false */
  excludeAmbiguous?: boolean;
}

const MIN_LENGTH = 8;
const MAX_LENGTH = 1024;

/**
 * Picks a single character from `charset` using rejection sampling so every
 * character has an exactly equal probability of being chosen (a plain
 * `randomBytes(1)[0] % charset.length` is biased whenever 256 isn't a
 * multiple of charset.length).
 */
function secureRandomChar(charset: string): string {
  const max = 256 - (256 % charset.length);
  let byte: number;
  do {
    byte = randomBytes(1)[0];
  } while (byte >= max);
  return charset[byte % charset.length];
}

/**
 * Fisher-Yates shuffle using a cryptographically secure, unbiased random
 * index at each step.
 */
function secureShuffle(chars: string[]): string[] {
  const arr = chars.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const max = 256 - (256 % (i + 1));
    let byte: number;
    do {
      byte = randomBytes(1)[0];
    } while (byte >= max);
    const j = byte % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function stripAmbiguous(charset: string): string {
  return charset
    .split('')
    .filter((c) => !AMBIGUOUS.includes(c))
    .join('');
}

/**
 * Generates a cryptographically secure random password.
 *
 * Enforces the policy: password must be at least 8 characters long and
 * include an uppercase letter, a lowercase letter, a number, and a special
 * character (unless a class is explicitly disabled via options). Uses
 * unbiased secure-random selection throughout (no modulo bias).
 *
 * @throws {Error} if options are invalid (e.g. length below 8, length too
 *   short for the requested character classes, or no character classes
 *   enabled).
 */
export function generateSecurePassword(options: PasswordOptions = {}): string {
  const {
    length = 16,
    useUppercase = true,
    useLowercase = true,
    useNumbers = true,
    useSpecial = true,
    excludeAmbiguous = false,
  } = options;

  if (!Number.isInteger(length)) {
    throw new Error('length must be an integer.');
  }
  if (length < MIN_LENGTH) {
    throw new Error(`length must be at least ${MIN_LENGTH}.`);
  }
  if (length > MAX_LENGTH) {
    throw new Error(`length must not exceed ${MAX_LENGTH}.`);
  }

  const selectedSets: string[] = [];
  if (useUppercase) selectedSets.push(UPPERCASE);
  if (useLowercase) selectedSets.push(LOWERCASE);
  if (useNumbers) selectedSets.push(NUMBERS);
  if (useSpecial) selectedSets.push(SPECIAL);

  if (selectedSets.length === 0) {
    throw new Error('At least one character class must be enabled.');
  }

  const processedSets = excludeAmbiguous
    ? selectedSets.map(stripAmbiguous)
    : selectedSets;

  if (processedSets.some((set) => set.length === 0)) {
    throw new Error(
      'excludeAmbiguous removed an entire character class; enable another class or disable it.',
    );
  }

  if (length < processedSets.length) {
    throw new Error(
      `length (${length}) must be at least ${processedSets.length} to include one character from each enabled class.`,
    );
  }

  const allChars = processedSets.join('');
  const passwordChars: string[] = [];

  // 1. Guarantee at least one character from each enabled set.
  for (const set of processedSets) {
    passwordChars.push(secureRandomChar(set));
  }

  // 2. Fill the remainder from the combined pool.
  for (let i = passwordChars.length; i < length; i++) {
    passwordChars.push(secureRandomChar(allChars));
  }

  // 3. Shuffle so the guaranteed characters aren't always in fixed positions.
  return secureShuffle(passwordChars).join('');
}

/**
 * Escapes regex metacharacters so a literal charset can be safely embedded
 * in a `[...]` character class.
 */
function toCharClass(charset: string): string {
  return charset.replace(/[\\^\]-]/g, '\\$&');
}

/**
 * Validates that a generated (or user-supplied) password satisfies the same
 * class requirements used by {@link generateSecurePassword}. Useful for
 * confirming output or checking passwords collected from elsewhere.
 */
export function validatePassword(
  password: string,
  options: PasswordOptions = {},
): boolean {
  const {
    useUppercase = true,
    useLowercase = true,
    useNumbers = true,
    useSpecial = true,
  } = options;

  if (password.length < MIN_LENGTH) return false;
  if (useUppercase && !new RegExp(`[${toCharClass(UPPERCASE)}]`).test(password))
    return false;
  if (useLowercase && !new RegExp(`[${toCharClass(LOWERCASE)}]`).test(password))
    return false;
  if (useNumbers && !new RegExp(`[${toCharClass(NUMBERS)}]`).test(password))
    return false;
  if (useSpecial && !new RegExp(`[${toCharClass(SPECIAL)}]`).test(password))
    return false;

  return true;
}
