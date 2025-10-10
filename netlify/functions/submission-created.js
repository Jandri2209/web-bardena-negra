// netlify/functions/submission-created.js
// Auto-respuesta (cliente) + Notificación interna (propietario) para el formulario "reserva"
const nodemailer = require("nodemailer");

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function trimAndLimit(str = "", max = 800) {
  const s = String(str).trim();
  return s.length > max ? s.slice(0, max) + "…" : s;
}
function nowStamp() {
  const d = new Date();
  const fmt = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false
  });
  const parts = fmt.formatToParts(d).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  return `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}`; // YYYYMMDD-HHMM
}

exports.handler = async (event) => {
  try {
    // ⬇️ Renombrado: era "body"
    const evtBody = JSON.parse(event.body || "{}");
    const data = evtBody?.payload?.data || {};

    // Solo procesa el form "reserva"
    const formName = (data["form-name"] || data.form_name || "").toLowerCase();
    if (formName && formName !== "reserva") {
      return { statusCode: 200, body: "skip" };
    }

    // Branding y URLs
    const BRAND_NAME  = process.env.BRAND_NAME  || "Casa Bardena Negra";
    const BRAND_COLOR = process.env.BRAND_COLOR || "#7a5c2e";
    const LOGO_URL    = process.env.LOGO_URL    || ""; // absoluto https://...

    // Datos del formulario
    const to       = (data.email || "").trim();
    const name     = (data.name || data.nombre || "amigo/a").trim();
    const checkin  = (data.checkin || "").trim();
    const checkout = (data.checkout || "").trim();
    const adultos  = (data.adultos || "").toString().trim();
    const ninos    = (data.ninos || data["niños"] || "").toString().trim();
    const tel      = (data.telefono || data.phone || "").trim();
    const message  = (data.message || data.mensaje || "").trim();
    const total    = (data.total_personas || "").toString().trim();

    // Honeypot
    const bot = (data["bot-field"] || data._gotcha || "").trim();
    if (!to || bot) return { statusCode: 200, body: "skip" };

    // Saneado
    const safeName    = escapeHtml(name);
    const safeMessage = escapeHtml(trimAndLimit(message, 1200));
    const safeTel     = escapeHtml(tel);

    const bookingUrl = process.env.BOOKING_URL
      || "https://www.rurive.com/casas-rurales/casa-rural-bardena-negra";

    // SMTP: servidor propio si hay variables; si no, Gmail
    const transporter = nodemailer.createTransport(
      process.env.SMTP_HOST ? {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "465", 10),
        secure: String(process.env.SMTP_SECURE || "true") === "true",
        auth: {
          user: process.env.SMTP_USER || process.env.GMAIL_USER,
          pass: process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD
        }
      } : {
        service: "gmail",
        auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
      }
    );

    const from     = process.env.MAIL_FROM    || `Reservas <${process.env.GMAIL_USER}>`;
    const replyTo  = process.env.MAIL_REPLYTO || process.env.GMAIL_USER;
    const notifyTo = process.env.NOTIFY_TO    || process.env.GMAIL_USER;

    // ========= AUTO-REPLY (cliente) =========
    const replyHtml = `
<!doctype html>
<html>
  <body style="margin:0;background:#f6f7fb;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f7fb;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
               style="max-width:640px;background:#ffffff;border:1px solid #eee;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:${BRAND_COLOR};padding:16px 24px;color:#ffffff;">
              ${LOGO_URL
                ? `<img src="${LOGO_URL}" alt="${BRAND_NAME}" width="120" style="display:block;border:0;outline:0;">`
                : `<h2 style="margin:0;font-size:18px;font-family:system-ui,Segoe UI,Roboto,Arial;">${BRAND_NAME}</h2>`}
              <p style="margin:8px 0 0 0;font-size:16px;font-family:system-ui,Segoe UI,Roboto,Arial;">¡Gracias por tu solicitud, ${safeName}!</p>
            </td>
          </tr>
          <tr>
            <td style="padding:22px;color:#111827;font-family:system-ui,Segoe UI,Roboto,Arial;">
              <p>Hemos recibido tu petición de <strong>disponibilidad</strong>. Te responderemos lo antes posible.</p>
              <ul style="padding-left:18px;margin:12px 0;">
                ${checkin  ? `<li><strong>Entrada:</strong> ${checkin}</li>` : ``}
                ${checkout ? `<li><strong>Salida:</strong> ${checkout}</li>` : ``}
                ${adultos  ? `<li><strong>Adultos:</strong> ${adultos}</li>` : ``}
                ${ninos    ? `<li><strong>Niños:</strong> ${ninos}</li>` : ``}
                ${tel      ? `<li><strong>Tel.:</strong> ${safeTel}</li>` : ``}
                ${total    ? `<li><strong>Total personas:</strong> ${escapeHtml(total)}</li>` : ``}
              </ul>
              ${safeMessage ? `<div style="margin-top:8px"><strong>Mensaje:</strong> ${safeMessage}</div>` : ``}

              <p style="margin-top:16px">Si prefieres reservar directamente, puedes hacerlo desde aquí:</p>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:12px 0 0 0;">
                <tr><td align="center" style="border-radius:999px;background:${BRAND_COLOR};">
                  <a href="${bookingUrl}"
                     style="display:inline-block;padding:12px 18px;color:#ffffff;text-decoration:none;font-family:system-ui,Segoe UI,Roboto,Arial;">
                    Reservar ahora
                  </a>
                </td></tr>
              </table>

              <p style="font-size:12px;color:#6b7280;margin-top:16px;">
                Este es un mensaje automático. Puedes responder a este email y te atenderemos en cuanto podamos.
              </p>
            </td>
          </tr>
        </table>
        <p style="font-size:12px;color:#9ca3af;font-family:system-ui,Segoe UI,Roboto,Arial;margin-top:12px;">
          © ${new Date().getFullYear()} ${BRAND_NAME}
        </p>
      </td></tr>
    </table>
  </body>
</html>
    `.trim();

    const replyText = [
      `Gracias por tu solicitud, ${name}!`,
      `Fechas: ${checkin || "?"} → ${checkout || "?"}`,
      adultos ? `Adultos: ${adultos}` : "",
      ninos ? `Niños: ${ninos}` : "",
      total ? `Total personas: ${total}` : "",
      tel ? `Tel.: ${tel}` : "",
      message ? `Mensaje: ${message}` : "",
      `Reserva directa: ${bookingUrl}`
    ].filter(Boolean).join("\n");

    await transporter.sendMail({
      from, to, replyTo,
      subject: "Solicitud de disponibilidad — Casa Bardena Negra",
      html: replyHtml, text: replyText
    });

    // ========= NOTIFY OWNER (propietario) =========
    const stamp = nowStamp();

    // Fallbacks robustos (si el hidden total_personas no se actualizó)
    const toInt = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; };
    const totalCalc = (/^\d+$/.test(total)) ? toInt(total) : (toInt(adultos) + toInt(ninos));
    const nights = (() => {
      const di = new Date(checkin), doo = new Date(checkout);
      const ms = doo - di;
      return (Number.isFinite(ms) && ms > 0) ? Math.round(ms / 86400000) : "";
    })();

    // Texto plano (mejora entregabilidad y sirve para adjunto .txt)
    const flatText = [
      `Nueva solicitud — ${stamp}`,
      name ? `Nombre: ${name}` : "",
      `Email: ${to}`,
      tel ? `Teléfono: ${tel}` : "",
      checkin ? `Entrada: ${checkin}` : "",
      checkout ? `Salida: ${checkout}` : "",
      nights ? `Noches: ${nights}` : "",
      adultos ? `Adultos: ${adultos}` : "",
      ninos ? `Niños: ${ninos}` : "",
      `Total personas: ${totalCalc}`,
      message ? `Mensaje: ${message}` : ""
    ].filter(Boolean).join("\n");

    // CTA "Responder ahora" pre-rellenado
    const enc  = encodeURIComponent;
    const subj = enc(`Re: Solicitud de disponibilidad — ${stamp}`);
    // ⬇️ Renombrado: era "body"
    const mailtoBody = enc([
      `Hola ${name || ""},`,
      "",
      `Gracias por escribirnos. Para estas fechas (${checkin} → ${checkout}${nights ? `, ${nights} noche(s)` : ""}) ` +
      `con ${adultos || 0} adulto(s) y ${ninos || 0} niño(s) — total ${totalCalc} — te confirmamos:`,
      "",
      "…",
      "",
      "--",
      `${BRAND_NAME}`
    ].join("\n"));
    const mailto = `mailto:${to}?subject=${subj}&body=${mailtoBody}`;

    // HTML estilado del aviso interno
    const notifyHtml = `
<!doctype html><html><body style="margin:0;background:#f6f7fb;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f7fb;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
             style="max-width:720px;background:#ffffff;border:1px solid #eee;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:${BRAND_COLOR};padding:16px 24px;color:#ffffff;">
            ${LOGO_URL
              ? `<img src="${LOGO_URL}" alt="${BRAND_NAME}" width="120" style="display:block;border:0;outline:0;">`
              : `<h2 style="margin:0;font-size:18px;font-family:system-ui,Segoe UI,Roboto,Arial;">${BRAND_NAME}</h2>`}
            <p style="margin:8px 0 0 0;font-size:16px;font-family:system-ui,Segoe UI,Roboto,Arial;">
              Nueva solicitud — <strong>${stamp}</strong>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:22px;color:#111827;font-family:system-ui,Segoe UI,Roboto,Arial;">
            <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;font-size:14px;line-height:1.5;">
              ${name     ? `<tr><td style="padding:6px 0;width:160px;color:#6b7280;">Nombre</td><td style="padding:6px 0;">${escapeHtml(name)}</td></tr>` : ""}
              <tr><td style="padding:6px 0;color:#6b7280;">Email</td><td style="padding:6px 0;"><a href="mailto:${to}">${escapeHtml(to)}</a></td></tr>
              ${tel      ? `<tr><td style="padding:6px 0;color:#6b7280;">Teléfono</td><td style="padding:6px 0;"><a href="tel:${safeTel}">${safeTel}</a></td></tr>` : ""}
              ${checkin  ? `<tr><td style="padding:6px 0;color:#6b7280;">Entrada</td><td style="padding:6px 0;">${checkin}</td></tr>` : ""}
              ${checkout ? `<tr><td style="padding:6px 0;color:#6b7280;">Salida</td><td style="padding:6px 0;">${checkout}</td></tr>` : ""}
              ${nights   ? `<tr><td style="padding:6px 0;color:#6b7280;">Noches</td><td style="padding:6px 0;">${nights}</td></tr>` : ""}
              ${adultos  ? `<tr><td style="padding:6px 0;color:#6b7280;">Adultos</td><td style="padding:6px 0;">${adultos}</td></tr>` : ""}
              ${ninos    ? `<tr><td style="padding:6px 0;color:#6b7280;">Niños</td><td style="padding:6px 0;">${ninos}</td></tr>` : ""}
              <tr><td style="padding:6px 0;color:#6b7280;">Total personas</td><td style="padding:6px 0;"><strong>${totalCalc}</strong></td></tr>
            </table>

            ${safeMessage ? `
              <div style="margin-top:14px;padding:12px;border:1px solid #e5e7eb;border-radius:10px;background:#fafafa;">
                <div style="font-size:12px;color:#6b7280;margin-bottom:6px;">Mensaje</div>
                <div style="white-space:pre-wrap;">${safeMessage}</div>
              </div>` : ""}

            <table role="presentation" cellspacing="0" cellpadding="0" style="margin:18px 0 0;">
              <tr>
                <td style="border-radius:999px;background:${BRAND_COLOR};">
                  <a href="${mailto}" style="display:inline-block;padding:10px 16px;color:#fff;text-decoration:none;font-family:system-ui,Segoe UI,Roboto,Arial;">
                    Responder ahora
                  </a>
                </td>
                <td style="width:12px;"></td>
                <td style="border-radius:999px;background:#111827;">
                  <a href="${bookingUrl}" style="display:inline-block;padding:10px 16px;color:#fff;text-decoration:none;font-family:system-ui,Segoe UI,Roboto,Arial;">
                    Abrir Rurive
                  </a>
                </td>
              </tr>
            </table>

            <p style="font-size:12px;color:#9ca3af;margin-top:16px;">Enviado a las ${stamp.slice(-4, -2)}:${stamp.slice(-2)} (hora Madrid).</p>
          </td>
        </tr>
      </table>
      <p style="font-size:12px;color:#9ca3af;font-family:system-ui,Segoe UI,Roboto,Arial;margin-top:12px;">© ${new Date().getFullYear()} ${BRAND_NAME}</p>
    </td></tr>
  </table>
</body></html>
    `.trim();

    // Adjuntos para archivo
    const attachments = [
      { filename: `reserva-${stamp}.txt`,  content: flatText, contentType: "text/plain; charset=utf-8" },
      { filename: `reserva-${stamp}.json`, content: JSON.stringify({
          stamp, name, email: to, telefono: tel, checkin, checkout, noches: nights,
          adultos, ninos, total_personas: totalCalc, mensaje: message
        }, null, 2), contentType: "application/json" }
    ];

    await transporter.sendMail({
      from,
      to: notifyTo,
      replyTo: to, // contestar desde tu bandeja escribe al cliente
      subject: `🗓️ Solicitud de disponibilidad — ${stamp}`,
      text: flatText,
      html: notifyHtml,
      attachments
    });

    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "error" };
  }
};
