// Outgoing mail from the Worker through Cloudflare Email Routing (binding EMAIL in wrangler.toml; the destination must be a
// verified address of Email Routing, kept in the ADMIN_EMAIL secret). Everything is best-effort: no binding, no mail.
export async function notifyAdmin(env, subject, text) {
  if (!env.EMAIL || !env.ADMIN_EMAIL) return false;
  try {
    const { EmailMessage } = await import("cloudflare:email");
    const from = `noreply@${env.MAIL_DOMAIN || "nextgrace.app"}`;
    const raw = [`From: Next Grace <${from}>`, `To: ${env.ADMIN_EMAIL}`, `Subject: ${subject.replace(/[\r\n]+/g, " ")}`, "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "", text].join("\r\n");
    await env.EMAIL.send(new EmailMessage(from, env.ADMIN_EMAIL, raw));
    return true;
  } catch (e) { console.error("mail", e); return false; }
}
