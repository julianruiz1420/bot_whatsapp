require('dotenv').config();
const express = require('express');
const qrcodeLib = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');
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

// 2. HEALTH CHECK (Mantiene el bot vivo en Railway)
const app = express();
const port = process.env.PORT || 3000;
app.get('/', (req, res) => res.status(200).send('Bot Online - Capturando Entradas y Salidas'));
app.listen(port, '0.0.0.0', () => console.log(`[SERVER] Puerto ${port} listo`));

// 3. INICIALIZACIÓN CON LOCALAUTH (Usa tu Volumen de 5GB)
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: 'session',
        dataPath: path.join(__dirname, '.wwebjs_auth') 
    }),
    webVersionCache: {
        type: 'remote',
        remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
    },
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--no-zygote']
    }
});

// 4. MANEJO DEL QR (Genera Link en Supabase Storage)
client.on('qr', async (qr) => {
    try {
        const qrBuffer = await qrcodeLib.toBuffer(qr, { type: 'png' });
        const fileName = `temp-qr/session-${Date.now()}.png`;
        await supabase.storage.from(SUPABASE_BUCKET_NAME).upload(fileName, qrBuffer, {
            contentType: 'image/png', upsert: true
        });
        const { data } = supabase.storage.from(SUPABASE_BUCKET_NAME).getPublicUrl(fileName);
        console.log('\n----------------------------------------------------');
        console.log(`➡️ ESCANEA AQUÍ: ${data.publicUrl}`);
        console.log('----------------------------------------------------\n');
    } catch (e) {
        console.error('❌ Error QR:', e.message);
    }
});

client.on('ready', () => console.log('✅ BOT CONECTADO. Sesión protegida en el Volumen.'));

// 5. LÓGICA DE MENSAJES: CAPTURA ENTRADAS Y SALIDAS
client.on('message_create', async (msg) => {
    // Ignorar grupos y difusiones
    if (msg.from.includes('@g.us') || msg.from.includes('broadcast')) return;

    // Detectar si el mensaje lo envié yo (desde el celular o el bot) o el cliente
    const esSalida = msg.fromMe; 
    const direccion = esSalida ? 'salida' : 'entrada';
    
    // Si es salida, el 'to' es el cliente. Si es entrada, el 'from' es el cliente.
    const chatId = esSalida ? msg.to : msg.from;
    const telefonoCliente = chatId.replace('@c.us', '');
    const mensajeTexto = msg.body || `[Mensaje tipo: ${msg.type}]`;

    try {
        // Guardar en la tabla mensajes_whatsapp
        const { error } = await supabase.from('mensajes_whatsapp').insert([{ 
            telefono_origen: telefonoCliente, 
            mensaje_texto: mensajeTexto, 
            direccion: direccion 
        }]);
        
        if (error) {
            console.error(`❌ Error en ${direccion}:`, error.message);
        } else {
            console.log(`✅ Registro guardado: ${direccion} (${telefonoCliente})`);
        }

        // Respuesta automática (Solo si es entrada y contiene 'hola')
        if (!esSalida && msg.body.toLowerCase().includes('hola')) {
            await msg.reply('¡Hola! Soy tu asistente virtual. He guardado tu mensaje.');
        }

    } catch (error) {
        console.error("❌ Error fatal:", error.message);
    }
});

console.log('🚀 Inicializando cliente...');
client.initialize();