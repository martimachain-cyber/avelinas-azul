
// /api/crear-pago.js
// Función serverless de Vercel: crea una preferencia de pago en Mercado Pago
// para cobrar la seña de $5.000 al reservar un turno.

export default async function handler(req, res) {
  // Solo aceptar POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { cliente, servicio, profesional, fecha, hora, refId } = req.body;

    if (!cliente || !servicio || !refId) {
      return res.status(400).json({ error: 'Faltan datos obligatorios' });
    }

    const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
    if (!MP_ACCESS_TOKEN) {
      return res.status(500).json({ error: 'Falta configurar MP_ACCESS_TOKEN en Vercel' });
    }

    const SENIA_MONTO = 5000; // monto fijo de la seña

    // URL base del sitio (para volver después de pagar)
    const baseUrl = `https://${req.headers.host}`;

    const preference = {
      items: [
        {
          title: `Seña - ${servicio} - Avelinas Azul`,
          quantity: 1,
          unit_price: SENIA_MONTO,
          currency_id: 'ARS',
        },
      ],
      payer: {
        name: cliente,
      },
      external_reference: refId, // este ID vincula el pago con la reserva en nuestro sistema
      back_urls: {
        success: `${baseUrl}/?pago=exito&ref=${refId}`,
        failure: `${baseUrl}/?pago=fallo&ref=${refId}`,
        pending: `${baseUrl}/?pago=pendiente&ref=${refId}`,
      },
      auto_return: 'approved',
      notification_url: `${baseUrl}/api/webhook-pago`,
      metadata: {
        cliente,
        servicio,
        profesional: profesional || '',
        fecha: fecha || '',
        hora: hora || '',
      },
    };

    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(preference),
    });

    const data = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error('Error de Mercado Pago:', data);
      return res.status(500).json({ error: 'No se pudo generar el link de pago', detalle: data });
    }

    // init_point es la URL a la que redirigimos a la clienta para pagar
    return res.status(200).json({
      init_point: data.init_point,
      preference_id: data.id,
    });
  } catch (error) {
    console.error('Error en crear-pago:', error);
    return res.status(500).json({ error: 'Error interno al crear el pago' });
  }
}
