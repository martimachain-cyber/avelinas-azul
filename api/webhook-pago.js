// /api/webhook-pago.js
// Función serverless de Vercel: recibe las notificaciones de Mercado Pago
// cuando un pago se aprueba, y guarda el estado en la tabla "avelinas_data"
// (la misma que ya usa todo el sistema) bajo la key "senias_pagadas",
// para que el frontend pueda detectar que la seña fue pagada.
// No requiere crear ninguna tabla nueva en Supabase.

const SB_URL = 'https://ctfyibkqlxyolrknoznh.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0ZnlpYmtxbHh5b2xya25vem5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3NzE0OTYsImV4cCI6MjA5NDM0NzQ5Nn0.-MEXcvUg_8UnSzLeBvB01uFaPbCgOBQfYLKaYhe_-vk';

async function leerSeniasPagadas() {
  const resp = await fetch(
    `${SB_URL}/rest/v1/avelinas_data?key=eq.senias_pagadas&select=value`,
    { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
  );
  const rows = await resp.json();
  if (rows && rows.length > 0) {
    try {
      return JSON.parse(rows[0].value);
    } catch (e) {
      return {};
    }
  }
  return {};
}

async function guardarSeniasPagadas(data) {
  await fetch(`${SB_URL}/rest/v1/avelinas_data`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify({
      key: 'senias_pagadas',
      value: JSON.stringify(data),
      updated_at: new Date().toISOString(),
    }),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('ok'); // Mercado Pago a veces hace GET de verificación
  }

  try {
    const { type, data } = req.body;

    // Solo nos interesan las notificaciones de pago
    if (type !== 'payment' || !data?.id) {
      return res.status(200).json({ recibido: true });
    }

    const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
    if (!MP_ACCESS_TOKEN) {
      console.error('Falta MP_ACCESS_TOKEN');
      return res.status(200).json({ recibido: true });
    }

    // Consultamos el pago real a Mercado Pago para confirmar su estado
    const pagoResp = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });
    const pago = await pagoResp.json();

    if (pago.status === 'approved') {
      const refId = pago.external_reference;
      const monto = pago.transaction_amount;

      const senias = await leerSeniasPagadas();
      senias[refId] = {
        monto: monto,
        payment_id: data.id,
        fecha_pago: new Date().toISOString(),
        metadata: pago.metadata || {},
      };
      await guardarSeniasPagadas(senias);
    }

    return res.status(200).json({ recibido: true });
  } catch (error) {
    console.error('Error en webhook-pago:', error);
    // Igual respondemos 200 para que Mercado Pago no reintente indefinidamente
    return res.status(200).json({ recibido: true, error: true });
  }
}
