// Optional public settings. Leave unset until real demo/contact destinations exist.
function webUrl(value: string | undefined) {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return undefined;
    return url;
  } catch { return undefined; }
}

const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();
export const contactEmail = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
export const demoUrl = webUrl(process.env.NEXT_PUBLIC_DEMO_REQUEST_URL)?.href;
export const demoHref = demoUrl ?? (contactEmail ? `mailto:${encodeURIComponent(contactEmail)}?subject=Schoolix%20demo%20request` : undefined);
export const siteUrl = webUrl(process.env.NEXT_PUBLIC_SITE_URL);
