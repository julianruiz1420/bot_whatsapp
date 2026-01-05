require('dotenv').config();
const express = require('express');
const qrcodeLib = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot CRM - Restaurado y Funcionando'));
app.listen(port, '0.0.0.0', () => console.log(`[SERVER] Puerto ${port} listo.`));

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

client.on('qr', async (qr) => {
    const qrBuffer = await qrcodeLib.toBuffer(qr, { type: 'png' });
    const fileName = `temp-qr/session-${Date.now()}.png`;
    await supabase.storage.from('qr-sessions').upload(fileName, qrBuffer, { contentType: 'image/png', upsert: true });
    const { data } = supabase.storage.from('qr-sessions').getPublicUrl(fileName);
    console.log(`➡️ NUEVO QR: ${data.publicUrl}`);
});

client.on('ready', () => console.log('✅ BOT CONECTADO Y REGISTRANDO.'));

// LÓGICA ULTRA-ESTABLE (Sin funciones que bloqueen)
client.on('message_create', async (msg) => {
    if (msg.from.includes('@g.us') || msg.from.includes('broadcast')) return;

    const esSalida = msg.fromMe; 
    const chatId = esSalida ? msg.to : msg.from;
    const telefono = chatId.replace('@c.us', '');
    const mensajeTexto = msg.body ? msg.body.trim() : '';

    try {
        // --- OBTENCIÓN DE NOMBRE SEGURA (Sin getContact que falla) ---
        // Usamos el nombre que viene en la metadata del mensaje (notifyName)
        const nombreMetadata = msg._data.notifyName || 'Contacto Nuevo';

        // 1. COMANDOS DE CLASIFICACIÓN
        const comandos = ['!cliente recurrente', '!proveedor', '!cliente nuevo'];
        if (esSalida && comandos.includes(mensajeTexto.toLowerCase())) {
            await supabase.from('contactos').upsert({ 
                telefono: telefono, 
                clasificacion: mensajeTexto.toLowerCase(),
                nombre: nombreMetadata 
            }, { onConflict: 'telefono' });
            return;
        }

        // 2. AUTO-REGISTRO (Si no existe, se crea)
        const { data: existe } = await supabase.from('contactos').select('telefono').eq('telefono', telefono).single();

        if (!existe) {
            await supabase.from('contactos').insert([{ 
                telefono: telefono, 
                nombre: nombreMetadata, 
                clasificacion: '!cliente nuevo' 
            }]);
            console.log(`🆕 Registrado automáticamente: ${nombreMetadata}`);
        }

        // 3. GUARDADO DE HISTORIAL (Obligatorio)
        await supabase.from('mensajes_whatsapp').insert([{ 
            telefono_origen: telefono, 
            mensaje_texto: mensajeTexto, 
            direccion: esSalida ? 'salida' : 'entrada' 
        }]);

    } catch (error) {
        console.error("❌ Error de registro:", error.message);
    }
});

client.initialize();