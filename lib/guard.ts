const PATTERNS = [
  /ignore (all |any |your |the )?(previous|prior|above|earlier)?\s*(instructions|rules|prompt)/i,
  /(system|developer) (prompt|mode|message)/i,
  /you are now|pretend (you|to)|act as (if|an?)/i,
  /\b([5-9]\d|100)\s?%\s?(off|discount)/i,
  /(for free|free of charge|\$\s?0\b)/i,
  /(reveal|show|tell).{0,25}(rules|prompt|minimum price|lowest price|floor)/i,
  /jailbreak/i,
];
export const looksLikeManipulation = (text: string) => PATTERNS.some((p) => p.test(text));