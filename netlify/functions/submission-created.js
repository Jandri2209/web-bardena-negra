// netlify/functions/submission-created.js
// Auto-respuesta y notificación para el formulario "reserva"
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
  return `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}`;
}

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const data = body?.payload?.data || {};

    // (Opcional, pero robusto) solo procesa el form "reserva"
    const formName = (data["form-name"] || data.form_name || "").toLowerCase();
    if (formName && formName !== "reserva") {
      return { statusCode: 200, body: "skip" };
    }

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

    // SMTP: usa servidor propio si hay variables; si no, Gmail
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
<div style="font-family:system-ui,Segoe UI,Roboto,Arial;max-width:640px;margin:auto;border:1px solid #eee;border-radius:12px;overflow:hidden">
  <div style="background:#7a5c2e;color:#fff;padding:16px 24px">
    <h2 style="margin:0;font-size:18px">¡Gracias por tu solicitud, ${safeName}!</h2>
  </div>
  <div style="padding:22px;color:#111827">
    <p>Hemos recibido tu petición de <strong>disponibilidad</strong> para Casa Bardena Negra. Te responderemos lo antes posible.</p>
    <ul>
      ${checkin  ? `<li><strong>Entrada:</strong> ${checkin}</li>` : ``}
      ${checkout ? `<li><strong>Salida:</strong> ${checkout}</li>` : ``}
      ${adultos  ? `<li><strong>Adultos:</strong> ${adultos}</li>` : ``}
      ${ninos    ? `<li><strong>Niños:</strong> ${ninos}</li>` : ``}
      ${tel      ? `<li><strong>Tel.:</strong> ${safeTel}</li>` : ``}
      ${total    ? `<li><strong>Total personas:</strong> ${total}</li>` : ``}
    </ul>
    ${safeMessage ? `<p style="margin-top:8px"><strong>Mensaje:</strong> ${safeMessage}</p>` : ``}
    <p style="margin-top:16px">Si prefieres reservar directamente, puedes hacerlo desde aquí:</p>
    <p><a href="${bookingUrl}" style="display:inline-block;background:#7a5c2e;color:#fff;padding:10px 16px;border-radius:999px;text-decoration:none">Reservar ahora</a></p>
  </div>
</div>`.trim();

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

    // ========= NOTIFY OWNER (tú) =========
    const stamp = nowStamp();
    const flatText = [
      `Nueva solicitud — ${stamp}`,
      name ? `Nombre: ${name}` : "",
      `Email: ${to}`,
      checkin ? `Entrada: ${checkin}` : "",
      checkout ? `Salida: ${checkout}` : "",
      adultos ? `Adultos: ${adultos}` : "",
      ninos ? `Niños: ${ninos}` : "",
      total ? `Total personas: ${total}` : "",
      tel ? `Teléfono: ${tel}` : "",
      message ? `Mensaje: ${message}` : ""
    ].filter(Boolean).join("\n");

    await transporter.sendMail({
      from,
      to: notifyTo,
      replyTo: to, // ← responder desde tu bandeja va al cliente
      subject: `🗓️ Solicitud de disponibilidad — ${stamp}`,
      text: flatText,
      html: flatText.replace(/\n/g, "<br>")
    });

    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: "error" };
  }
};
