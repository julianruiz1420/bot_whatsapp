require('dotenv').config();
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { createClient } = require('@supabase/supabase-js');
const qrcodeLib = require('qrcode');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 1. Health Check (Mantiene vivo el proceso en Railway)
app.get('/', (req, res) => res.send('Bot Online'));
app.listen(port, '0.0.0.0');

// 2. Configuración del Cliente (Usa el Volumen montado)
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: 'session',
        dataPath: path.join(__dirname, '.wwebjs_auth') // Ruta al Volume
    }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// 3. Generación de Link QR (Simplificado)
client.on('qr', async (qr) => {
    try {
        const qrBuffer = await qrcodeLib.toBuffer(qr, { type: 'png' });
        const fileName = `temp-qr/${Date.now()}.png`;
        
        await supabase.storage.from('qr-sessions').upload(fileName, qrBuffer, {
            contentType: 'image/png', upsert: true
        });

        const { data } = supabase.storage.from('qr-sessions').getPublicUrl(fileName);
        
        console.log('--------------------------------------');
        console.log(`➡️ ESCANEA AQUÍ: ${data.publicUrl}`);
        console.log('--------------------------------------');
    } catch (e) {
        console.error('❌ Error Supabase:', e.message);
    }
});

// 4. Eventos de Conexión
client.on('ready', () => console.log('✅ BOT CONECTADO EN VOLUMEN'));

client.on('message', async (msg) => {
    if (msg.body.toLowerCase() === 'hola') {
        await msg.reply('¡Hola! Bot simplificado activo.');
    }
});

console.log('🚀 Iniciando...');
client.initialize();