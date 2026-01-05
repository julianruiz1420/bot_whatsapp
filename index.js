require('dotenv').config();
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { createClient } = require('@supabase/supabase-js');
const qrcodeLib = require('qrcode');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 1. Health Check
app.get('/', (req, res) => res.send('Bot Online con Guardado de Datos'));
app.listen(port, '0.0.0.0', () => console.log(`🚀 Servidor en puerto ${port}`));

// 2. Configuración con LocalAuth (Usa tu Volumen de Railway)
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: 'session',
        dataPath: path.join(__dirname, '.wwebjs_auth') 
    }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// 3. Generación del Link para el QR
client.on('qr', async (qr) => {
    try {
        const qrBuffer = await qrcodeLib.toBuffer(qr, { type: 'png' });
        const fileName = `temp-qr/session-${Date.now()}.png`;
        await supabase.storage.from('qr-sessions').upload(fileName, qrBuffer, {
            contentType: 'image/png', upsert: true
        });
        const { data } = supabase.storage.from('qr-sessions').getPublicUrl(fileName);
        console.log(`➡️ ESCANEA AQUÍ PARA CONECTAR: ${data.publicUrl}`);
    } catch (e) {
        console.error('❌ Error al subir QR a Supabase:', e.message);
    }
});

// 4. Eventos de Conexión
client.on('ready', () => console.log('✅ BOT CONECTADO Y USANDO VOLUMEN PERSISTENTE'));

// 5. LÓGICA DE GUARDADO DE MENSAJES (Lo que faltaba)
client.on('message', async (msg) => {
    // Ignorar grupos y difusiones
    if (msg.from.includes('@g.us') || msg.from.includes('broadcast')) return;

    const telefonoCliente = msg.from.replace('@c.us', '');
    
    try {
        // GUARDAR MENSAJE RECIBIDO EN LA TABLA
        const { error: errorIn } = await supabase.from('mensajes_whatsapp').insert([{ 
            telefono_origen: telefonoCliente, 
            mensaje_texto: msg.body, 
            direccion: 'entrada' 
        }]);
        if (errorIn) console.error("❌ Error guardando entrada:", errorIn.message);

        // RESPUESTA AUTOMÁTICA
        if (msg.body.toLowerCase().includes('hola')) {
            const respuesta = '¡Hola! Recibí tu mensaje y ya quedó guardado en mi base de datos.';
            await msg.reply(respuesta);

            // GUARDAR LA RESPUESTA DEL BOT
            const { error: errorOut } = await supabase.from('mensajes_whatsapp').insert([{ 
                telefono_origen: telefonoCliente, 
                mensaje_texto: respuesta, 
                direccion: 'salida' 
            }]);
            if (errorOut) console.error("❌ Error guardando salida:", errorOut.message);
        }
    } catch (error) {
        console.error("❌ Error general en Supabase:", error.message);
    }
});

console.log('⏳ Iniciando Cliente de WhatsApp...');
client.initialize();