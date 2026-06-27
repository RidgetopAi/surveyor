// A Next.js-style page file. `metadata` and the default export are framework
// conventions valid on page.* files -> NOT flagged. `pageHelper` is NOT a
// convention and is never imported -> SHOULD be flagged unused_export.
// (Characterizes the Next.js convention skip applying per-export.)
export const metadata = { title: 'fixture' };

export function pageHelper(): void {}

export default function Page(): null {
  return null;
}
