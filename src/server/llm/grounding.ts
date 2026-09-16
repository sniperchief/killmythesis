/**
 * Number grounding for LLM prose. A number the model writes is accepted only if some
 * value in the facts it was given rounds to it at the precision written.
 */

const NUMBER = /\d+(?:\.\d+)?/g;
const numbersIn = (text: string) => text.replace(/(\d),(?=\d{3})/g, "$1").match(NUMBER) ?? [];

/** Every number that appears in the facts (strings are scanned as text, objects as JSON). */
export function allowedNumbers(facts: object | string): number[] {
  const text = typeof facts === "string" ? facts : JSON.stringify(facts);
  return [...new Set(numbersIn(text).map(Number))];
}

/** The numbers in `text` that no fact supports. */
export function ungroundedNumbers(text: string, allowed: number[]): string[] {
  return numbersIn(text).filter((token) => {
    const value = Number(token);
    const decimals = token.includes(".") ? token.split(".")[1].length : 0;
    const tolerance = 0.5 * 10 ** -decimals + 1e-9;
    return !allowed.some((a) => Math.abs(a - value) <= tolerance);
  });
}
