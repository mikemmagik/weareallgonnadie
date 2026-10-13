export const DISCLAIMER_HEADING = 'DISCLAIMER — NOT A NEWS OUTLET';
export const DISCLAIMER_TEXT =
  'This is not a news outlet. This website is a satirical collection of third-party content, memes, and commentary. Refer to original sources for factual information.';

export interface OperatorInformation {
  identity: string | null;
  contactEmail: string | null;
  contactVerified: boolean;
}

/** Public build-time information only. Verify the mailbox before enabling it. */
export const operator: OperatorInformation = {
  identity: null,
  contactEmail: null,
  contactVerified: false,
};

export function contactHref(info: OperatorInformation): string | null {
  const email = info.contactEmail;
  if (
    !info.contactVerified ||
    !email ||
    !/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/.test(
      email,
    )
  )
    return null;
  return `mailto:${encodeURIComponent(email)}`;
}
