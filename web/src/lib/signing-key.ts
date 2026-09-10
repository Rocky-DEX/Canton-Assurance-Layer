/**
 * The one check that keeps a lost keystore from becoming a silent key
 * rotation. The signing service mints a fresh seed for an organisation whose
 * sealed key file it cannot find — correct on first use, catastrophic after
 * a bad restore, because every reader would see the publisher's key change
 * in the anchor history and nothing in the console would have said a word.
 * So: once an organisation has a recorded key, a report signed by any other
 * key is refused, and the operator decides.
 */

export class SigningKeyChanged extends Error {
  constructor(
    public readonly slug: string,
    public readonly recorded: string,
    public readonly returned: string
  ) {
    super(
      `signing key changed for ${slug}: the signing service signed with ${returned.slice(0, 16)}… but this organisation's recorded key is ${recorded.slice(0, 16)}…. ` +
        "Nothing was stored. Restore the keystore volume and SERVICE_KEK from backup (see DEPLOY.md §6), or, to rotate deliberately, clear the recorded key in Settings."
    );
  }
}

export function assertSameSigningKey(org: { slug: string; signingKeyHex: string | null }, returned: string): void {
  if (org.signingKeyHex && org.signingKeyHex !== returned) {
    throw new SigningKeyChanged(org.slug, org.signingKeyHex, returned);
  }
}
