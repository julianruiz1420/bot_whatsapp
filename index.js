require('dotenv').config();
const express = require('express');
const qrcodeLib = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js'); // Cambiado a LocalAuth para usar Volumen
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// 1. CONFIGURACIÓN DE VARIABLES
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SUPABASE_BUCKET_NAME = 'qr-sessions'; 

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('\n❌ ERROR: Faltan variables de Supabase.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 2. HEALTH CHECK (Para que Railway no apague el bot)
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.status(200).send('Bot de WhatsApp Activo y Guardando Datos'));
app.listen(port, '0.0.0.0', () => console.log(`[HEALTH CHECK] Port ${port}`));

// 3. INICIALIZACIÓN DEL CLIENTE CON VOLUMEN PERSISTENTE
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: 'session',
        dataPath: path.join(__dirname, '.wwebjs_auth') // Apunta a tu Volumen de Railway
    }),
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    },
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--no-zygote'
        ]
    }
});

// 4. MANEJO DEL QR (Genera Link de Supabase)
client.on('qr', async (qr) => {
    console.log('📱 NUEVO QR GENERADO...');
    try {
        const qrBuffer = await qrcodeLib.toBuffer(qr, { type: 'png' });
        const fileName = `temp-qr/session-${Date.now()}.png`;
        
        await supabase.storage.from(SUPABASE_BUCKET_NAME).upload(fileName, qrBuffer, {
            contentType: 'image/png',
            upsert: true
        });
        
        const { data } = supabase.storage.from(SUPABASE_BUCKET_NAME).getPublicUrl(fileName);
        console.log('\n----------------------------------------------------');
        console.log(`➡️ ESCANEA AQUÍ: ${data.publicUrl}`);
        console.log('----------------------------------------------------\n');
    } catch (e) {
        console.error('❌ Error Supabase QR:', e.message);
    }
});

client.on('ready', () => {
    console.log('✅ BOT LISTO Y CONECTADO.');
    console.log('📂 Sesión guardada en el Volumen Persistente de Railway.');
});

// 5. LÓGICA DE GUARDADO DE MENSAJES (Tu lógica original)
client.on('message', async (msg) => {
    // Ignorar grupos y difusiones
    if (msg.from.includes('@g.us') || msg.from.includes('broadcast')) return;

    const telefonoCliente = msg.from.replace('@c.us', '');
    const mensajeTexto = msg.body || `[Mensaje tipo: ${msg.type}]`;

    try {
        // Guardar mensaje de entrada
        const { error: errorEntrada } = await supabase.from('mensajes_whatsapp').insert([{ 
            telefono_origen: telefonoCliente, 
            mensaje_texto: mensajeTexto, 
            direccion: 'entrada' 
        }]);
        
        if (errorEntrada) console.error("❌ Error Supabase (Entrada):", errorEntrada.message);

        // Lógica de respuesta automática
        if (msg.body.toLowerCase().includes('hola')) {
            const respuesta = '¡Hola! Soy tu asistente virtual. He guardado tu mensaje.';
            await msg.reply(respuesta);

            // Guardar mensaje de salida
            const { error: errorSalida } = await supabase.from('mensajes_whatsapp').insert([{ 
                telefono_origen: telefonoCliente, 
                mensaje_texto: respuesta, 
                direccion: 'salida' 
            }]);
            
            if (errorSalida) console.error("❌ Error Supabase (Salida):", errorSalida.message);
        }
    } catch (error) {
        console.error("❌ Error fatal en proceso de guardado:", error.message);
    }
});

console.log('🚀 Inicializando cliente...');
client.initialize();