import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Esta variable la configuraremos en el siguiente paso en la terminal
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

serve(async (req) => {
  // Manejo de CORS para que tu web pueda llamar a la función
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    } })
  }

  try {
    const { to, subject, message } = await req.json()

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'ERP Franquify <onboarding@resend.dev>',
        to: [to],
        subject: subject,
        html: `<strong>${message}</strong>`,
      }),
    })

    const data = await res.json()
    
    return new Response(JSON.stringify(data), { 
      status: 200, 
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*" 
      } 
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" }
    })
  }
})