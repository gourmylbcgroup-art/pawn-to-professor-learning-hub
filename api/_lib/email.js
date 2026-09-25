export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail({ to, subject, html, text }) {
  if (!emailConfigured()) {
    throw new Error('Email is not configured. Add RESEND_API_KEY and EMAIL_FROM in Vercel.');
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [to],
      subject,
      html,
      text
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.message || body?.error || `Email provider returned ${response.status}.`);
  return body;
}
